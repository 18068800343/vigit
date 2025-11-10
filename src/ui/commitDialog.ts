import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { ChangelistManager, Changelist } from '../managers/changelistManager';
import { LocalChangesProvider } from '../providers/localChangesProvider';

export class CommitDialog {
    private context: vscode.ExtensionContext;
    private gitService: GitService;
    private changelistManager: ChangelistManager;
    private localChangesProvider: LocalChangesProvider;

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

        // Show commit message input
        const config = vscode.workspace.getConfiguration('vigit');
        const messageTemplate = config.get<string>('commitMessageTemplate', '');

        const commitMessage = await vscode.window.showInputBox({
            prompt: `Commit message for "${selectedChangelist.name}"`,
            placeHolder: 'Enter commit message',
            value: messageTemplate,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Commit message cannot be empty';
                }
                return null;
            }
        });

        if (!commitMessage) {
            return;
        }

        try {
            // Stage files
            await this.gitService.stageFiles(selectedChangelist.files);

            // Commit
            await this.gitService.commit(commitMessage, selectedChangelist.files);

            // Remove committed files from changelist
            selectedChangelist.files = [];

            // Refresh
            await this.localChangesProvider.refresh();

            let message = `Successfully committed to ${await this.gitService.getCurrentBranch()}`;

            // Push if requested
            if (andPush) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Pushing to remote...',
                    cancellable: false
                }, async () => {
                    await this.gitService.push();
                });
                message += ' and pushed to remote';
            }

            vscode.window.showInformationMessage(message);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Commit failed: ${errorMessage}`);
        }
    }

    async showAmendDialog(): Promise<void> {
        const activeChangelist = this.changelistManager.getActiveChangelist();

        if (!activeChangelist || activeChangelist.files.length === 0) {
            vscode.window.showWarningMessage('No files to commit in active changelist');
            return;
        }

        // Get last commit message
        const log = await this.gitService.getLog(1);
        const lastCommitMessage = log.length > 0 ? log[0].message : '';

        const commitMessage = await vscode.window.showInputBox({
            prompt: 'Amend last commit',
            placeHolder: 'Enter commit message',
            value: lastCommitMessage,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Commit message cannot be empty';
                }
                return null;
            }
        });

        if (!commitMessage) {
            return;
        }

        try {
            // Stage files
            await this.gitService.stageFiles(activeChangelist.files);

            // Amend commit
            await this.gitService.commitAmend(commitMessage);

            // Remove committed files from changelist
            activeChangelist.files = [];

            // Refresh
            await this.localChangesProvider.refresh();

            vscode.window.showInformationMessage('Successfully amended last commit');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Amend failed: ${errorMessage}`);
        }
    }
}


