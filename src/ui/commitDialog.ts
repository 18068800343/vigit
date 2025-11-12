import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { ChangelistManager, Changelist } from '../managers/changelistManager';
import { LocalChangesProvider } from '../providers/localChangesProvider';

export class CommitDialog {
    private context: vscode.ExtensionContext;
    private gitService: GitService;
    private changelistManager: ChangelistManager;
    private localChangesProvider: LocalChangesProvider;
    private readonly HISTORY_KEY = 'vigit.commitHistory';
    private readonly HISTORY_LIMIT = 20;

    constructor(
        context: vscode.ExtensionContext,
        gitService: GitService,
        changelistManager: ChangelistManager,
        localChangesProvider: LocalChangesProvider
    ) {
        this.context = context;
        this.gitService = gitService;
        this.changelistManager = changelistManager;
        this.localChangesProvider = localChangesProvider;
    }

    async showCommitDialog(andPush: boolean = false): Promise<void> {
        const changelists = this.changelistManager.getChangelists();
        const activeChangelist = this.changelistManager.getActiveChangelist();

        if (!activeChangelist || activeChangelist.files.length === 0) {
            vscode.window.showWarningMessage('No files to commit in active changelist');
            return;
        }

        // Show quick pick for changelist selection
        const changelistItems = changelists
            .filter(cl => cl.files.length > 0)
            .map(cl => ({
                label: cl.name,
                description: `${cl.files.length} file(s)`,
                detail: cl.active ? '✓ Active' : '',
                changelist: cl
            }));

        if (changelistItems.length === 0) {
            vscode.window.showWarningMessage('No changelists with files to commit');
            return;
        }

        let selectedChangelist: Changelist | undefined;

        if (changelistItems.length === 1) {
            selectedChangelist = changelistItems[0].changelist;
        } else {
            const selected = await vscode.window.showQuickPick(changelistItems, {
                placeHolder: 'Select changelist to commit',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (!selected) {
                return;
            }

            selectedChangelist = selected.changelist;
        }

        if (!selectedChangelist) {
            return;
        }

        await this.commitFiles(selectedChangelist.files, {
            changelistId: selectedChangelist.id,
            andPush,
            title: `Commit message for "${selectedChangelist.name}"`
        });
    }

    async showAmendDialog(): Promise<void> {
        const activeChangelist = this.changelistManager.getActiveChangelist();

        if (!activeChangelist || activeChangelist.files.length === 0) {
            vscode.window.showWarningMessage('No files to commit in active changelist');
            return;
        }

        const log = await this.gitService.getLog(1);
        const lastCommitMessage = log.length > 0 ? log[0].message : '';

        const commitMessage = await this.promptCommitMessage('Amend last commit', lastCommitMessage);

        if (!commitMessage) {
            return;
        }

        await this.executeCommit(activeChangelist.files, commitMessage, {
            changelistId: activeChangelist.id,
            amend: true
        });
    }

    async commitFiles(
        files: string[],
        options: { changelistId?: string; andPush?: boolean; title?: string } = {}
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('vigit');
        const template = config.get<string>('commitMessageTemplate', '');
        const promptTitle = options.title ?? 'Commit message';

        const commitMessage = await this.promptCommitMessage(promptTitle, template);
        if (!commitMessage) {
            return;
        }
        await this.executeCommit(files, commitMessage, {
            changelistId: options.changelistId,
            andPush: options.andPush
        });
    }

    async commitFromPanel(request: {
        files: string[];
        message: string;
        andPush?: boolean;
        amend?: boolean;
    }): Promise<void> {
        const message = request.message?.trim();
        if (!message) {
            vscode.window.showWarningMessage('Commit message cannot be empty');
            return;
        }

        await this.executeCommit(request.files, message, {
            andPush: request.andPush,
            amend: request.amend
        });
    }

    private async executeCommit(
        files: string[],
        commitMessage: string,
        options: { changelistId?: string; andPush?: boolean; amend?: boolean } = {}
    ): Promise<void> {
        const uniqueFiles = Array.from(new Set(files));
        if (uniqueFiles.length === 0) {
            vscode.window.showWarningMessage('No files selected');
            return;
        }

        try {
            await this.gitService.stageFiles(uniqueFiles);

            if (options.amend) {
                await this.gitService.commitAmend(commitMessage);
            } else {
                await this.gitService.commit(commitMessage, uniqueFiles);
            }

            this.removeFilesFromChangelists(uniqueFiles, options.changelistId);
            this.recordCommitMessage(commitMessage);

            await this.localChangesProvider.refresh();

            const actionLabel = options.amend ? 'amended' : 'committed';
            let infoMessage = `Successfully ${actionLabel} ${uniqueFiles.length} file${uniqueFiles.length !== 1 ? 's' : ''}`;

            if (options.andPush) {
                await this.pushWithProgress();
                infoMessage += ' and pushed to remote';
            }

            vscode.window.showInformationMessage(infoMessage);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const prefix = options.amend ? 'Amend failed' : 'Commit failed';
            vscode.window.showErrorMessage(`${prefix}: ${errorMessage}`);
        }
    }

    private removeFilesFromChangelists(files: string[], changelistId?: string): void {
        if (changelistId) {
            for (const file of files) {
                this.changelistManager.removeFileFromChangelist(file, changelistId);
            }
            return;
        }

        for (const file of files) {
            const changelist = this.changelistManager.getChangelistForFile(file);
            if (changelist) {
                this.changelistManager.removeFileFromChangelist(file, changelist.id);
            }
        }
    }

    private async pushWithProgress(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Pushing to remote...',
            cancellable: false
        }, async () => {
            await this.gitService.push();
        });
    }

    public getCommitHistoryEntries(): string[] {
        return this.context.workspaceState.get<string[]>(this.HISTORY_KEY, []);
    }

    private recordCommitMessage(message: string): void {
        const trimmed = message.trim();
        if (!trimmed) {
            return;
        }

        const history = this.getCommitHistoryEntries().filter(item => item !== trimmed);
        history.unshift(trimmed);
        const limited = history.slice(0, this.HISTORY_LIMIT);
        this.context.workspaceState.update(this.HISTORY_KEY, limited);
    }

    private async promptCommitMessage(prompt: string, initialValue: string): Promise<string | undefined> {
        const history = this.getCommitHistoryEntries();
        const input = vscode.window.createInputBox();
        input.prompt = prompt;
        input.value = initialValue || '';
        input.ignoreFocusOut = true;

        const historyButton: vscode.QuickInputButton = {
            iconPath: new vscode.ThemeIcon('history'),
            tooltip: '从历史记录中选择'
        };

        if (history.length > 0) {
            input.buttons = [historyButton];
        }

        return await new Promise<string | undefined>((resolve) => {
            let settled = false;
            const finalize = (value?: string) => {
                if (settled) {
                    return;
                }
                settled = true;
                input.dispose();
                resolve(value);
            };

            input.onDidAccept(() => {
                const value = input.value.trim();
                if (!value) {
                    vscode.window.showWarningMessage('Commit message cannot be empty');
                    return;
                }
                finalize(value);
            });

            input.onDidHide(() => finalize(undefined));

            input.onDidTriggerButton(async (button) => {
                if (button === historyButton && history.length > 0) {
                    const pick = await vscode.window.showQuickPick(
                        history.map(entry => ({ label: entry })),
                        {
                            placeHolder: '选择历史提交信息',
                            matchOnDetail: true
                        }
                    );
                    if (pick) {
                        input.value = pick.label;
                    }
                }
            });

            input.show();
        });
    }
}


