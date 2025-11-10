import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { ChangelistManager } from '../managers/changelistManager';
import { ShelfManager } from '../managers/shelfManager';
import { LocalChangesProvider } from '../providers/localChangesProvider';
import { GitLogProvider } from '../providers/gitLogProvider';
import { ShelfProvider } from '../providers/shelfProvider';
import { BranchesProvider } from '../providers/branchesProvider';
import { StashProvider, StashTreeItem } from '../providers/stashProvider';
import { CommitDialog } from '../ui/commitDialog';
import { DiffViewHelper } from '../helpers/diffViewHelper';
import { AnnotateHelper } from '../helpers/annotateHelper';

export class CommandRegistry {
    private context: vscode.ExtensionContext;
    private gitService: GitService;
    private changelistManager: ChangelistManager;
    private shelfManager: ShelfManager;
    private localChangesProvider: LocalChangesProvider;
    private gitLogProvider: GitLogProvider;
    private shelfProvider: ShelfProvider;
    private branchesProvider: BranchesProvider;
    private stashProvider: StashProvider;
    private commitDialog: CommitDialog;

    constructor(
        context: vscode.ExtensionContext,
        gitService: GitService,
        changelistManager: ChangelistManager,
        shelfManager: ShelfManager,
        localChangesProvider: LocalChangesProvider,
        gitLogProvider: GitLogProvider,
        shelfProvider: ShelfProvider,
        branchesProvider: BranchesProvider,
        stashProvider: StashProvider,
        commitDialog: CommitDialog
    ) {
        this.context = context;
        this.gitService = gitService;
        this.changelistManager = changelistManager;
        this.shelfManager = shelfManager;
        this.localChangesProvider = localChangesProvider;
        this.gitLogProvider = gitLogProvider;
        this.shelfProvider = shelfProvider;
        this.branchesProvider = branchesProvider;
        this.stashProvider = stashProvider;
        this.commitDialog = commitDialog;
    }

    registerAllCommands(): void {
        // General commands
        this.register('vigit.refresh', () => this.refresh());

        // Commit commands
        this.register('vigit.commit', () => this.commit());
        this.register('vigit.commitAndPush', () => this.commitAndPush());

        // File commands
        this.register('vigit.showDiff', (filePath: string, staged: boolean) => 
            this.showDiff(filePath, staged));
        this.register('vigit.revertFile', (item: any) => this.revertFile(item));
        this.register('vigit.stageFile', (item: any) => this.stageFile(item));
        this.register('vigit.unstageFile', (item: any) => this.unstageFile(item));

        // Changelist commands
        this.register('vigit.newChangelist', () => this.newChangelist());
        this.register('vigit.moveToChangelist', (item: any) => this.moveToChangelist(item));
        this.register('vigit.deleteChangelist', (item: any) => this.deleteChangelist(item));
        this.register('vigit.setActiveChangelist', (item: any) => this.setActiveChangelist(item));

        // Shelf commands
        this.register('vigit.shelveChanges', () => this.shelveChanges());
        this.register('vigit.unshelveChanges', (item: any) => this.unshelveChanges(item));
        this.register('vigit.deleteShelvedChanges', (item: any) => this.deleteShelvedChanges(item));

        // Stash commands
        this.register('vigit.stashSave', () => this.stashSave());
        this.register('vigit.stashApply', (item: any) => this.stashApply(item));
        this.register('vigit.stashPop', (item: any) => this.stashPop(item));
        this.register('vigit.stashDrop', (item: any) => this.stashDrop(item));
        this.register('vigit.showStashDiff', (item: any) => this.showStashDiff(item));

        // Log commands
        this.register('vigit.showLog', () => this.showLog());
        this.register('vigit.showFileHistory', () => this.showFileHistory());
        this.register('vigit.showCommitDetails', (commit: any) => this.showCommitDetails(commit));
        this.register('vigit.annotate', () => this.annotate());

        // Branch commands
        this.register('vigit.checkoutBranch', (branchName: string) => this.checkoutBranch(branchName));
        this.register('vigit.newBranch', () => this.newBranch());
        this.register('vigit.deleteBranch', (item: any) => this.deleteBranch(item));
        this.register('vigit.mergeBranch', (item: any) => this.mergeBranch(item));
        this.register('vigit.rebaseBranch', (item: any) => this.rebaseBranch(item));

        // Git operations
        this.register('vigit.pull', () => this.pull());
        this.register('vigit.push', () => this.push());
        this.register('vigit.fetch', () => this.fetch());
        this.register('vigit.cherryPick', () => this.cherryPick());
        this.register('vigit.resetHead', () => this.resetHead());
        this.register('vigit.compareWithBranch', () => this.compareWithBranch());
    }

    private register(command: string, callback: (...args: any[]) => any): void {
        this.context.subscriptions.push(
            vscode.commands.registerCommand(command, callback)
        );
    }

    // Command implementations

    private async refresh(): Promise<void> {
        await Promise.all([
            this.localChangesProvider.refresh(),
            this.gitLogProvider.refresh(),
            this.branchesProvider.refresh(),
            this.stashProvider.refresh()
        ]);
        this.shelfProvider.refresh();
        vscode.window.showInformationMessage('Refreshed');
    }

    private async commit(): Promise<void> {
        await this.commitDialog.showCommitDialog(false);
    }

    private async commitAndPush(): Promise<void> {
        await this.commitDialog.showCommitDialog(true);
    }

    private async showDiff(filePath: string, staged: boolean = false): Promise<void> {
        try {
            await DiffViewHelper.showDiff(this.gitService, filePath, staged);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show diff: ${error}`);
        }
    }

    private async revertFile(item: any): Promise<void> {
        if (!item || !item.filePath) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Revert changes in ${item.label}?`,
            { modal: true },
            'Revert'
        );

        if (confirm === 'Revert') {
            try {
                await this.gitService.revertFile(item.filePath);
                await this.localChangesProvider.refresh();
                vscode.window.showInformationMessage('File reverted');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to revert: ${error}`);
            }
        }
    }

    private async stageFile(item: any): Promise<void> {
        if (!item || !item.filePath) {
            return;
        }

        try {
            await this.gitService.stageFile(item.filePath);
            await this.localChangesProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stage: ${error}`);
        }
    }

    private async unstageFile(item: any): Promise<void> {
        if (!item || !item.filePath) {
            return;
        }

        try {
            await this.gitService.unstageFile(item.filePath);
            await this.localChangesProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to unstage: ${error}`);
        }
    }

    private async newChangelist(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter changelist name',
            placeHolder: 'Changelist name',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Name cannot be empty';
                }
                return null;
            }
        });

        if (!name) {
            return;
        }

        const description = await vscode.window.showInputBox({
            prompt: 'Enter changelist description (optional)',
            placeHolder: 'Description'
        });

        this.changelistManager.createChangelist(name, description);
        await this.localChangesProvider.refresh();
        vscode.window.showInformationMessage(`Created changelist: ${name}`);
    }

    private async moveToChangelist(item: any): Promise<void> {
        if (!item || !item.filePath) {
            return;
        }

        const changelists = this.changelistManager.getChangelists();
        const items = changelists.map(cl => ({
            label: cl.name,
            description: cl.active ? '(active)' : '',
            changelist: cl
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select target changelist'
        });

        if (!selected) {
            return;
        }

        this.changelistManager.moveFileToChangelist(item.filePath, selected.changelist.id);
        await this.localChangesProvider.refresh();
    }

    private async deleteChangelist(item: any): Promise<void> {
        if (!item || !item.changelistId) {
            return;
        }

        const changelist = this.changelistManager.getChangelist(item.changelistId);
        if (!changelist) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete changelist "${changelist.name}"? Files will be moved to the active changelist.`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            if (this.changelistManager.deleteChangelist(item.changelistId)) {
                await this.localChangesProvider.refresh();
                vscode.window.showInformationMessage('Changelist deleted');
            }
        }
    }

    private async setActiveChangelist(item: any): Promise<void> {
        if (!item || !item.changelistId) {
            return;
        }

        if (this.changelistManager.setActiveChangelist(item.changelistId)) {
            await this.localChangesProvider.refresh();
            vscode.window.showInformationMessage('Active changelist updated');
        }
    }

    private async shelveChanges(): Promise<void> {
        const activeChangelist = this.changelistManager.getActiveChangelist();
        if (!activeChangelist || activeChangelist.files.length === 0) {
            vscode.window.showWarningMessage('No files to shelve in active changelist');
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter shelf name',
            placeHolder: 'Shelf name',
            value: `${activeChangelist.name} - ${new Date().toLocaleString()}`,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Name cannot be empty';
                }
                return null;
            }
        });

        if (!name) {
            return;
        }

        const description = await vscode.window.showInputBox({
            prompt: 'Enter description (optional)',
            placeHolder: 'Description'
        });

        try {
            await this.shelfManager.shelveChanges(name, activeChangelist.files, description);
            await this.localChangesProvider.refresh();
            this.shelfProvider.refresh();
            vscode.window.showInformationMessage('Changes shelved');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to shelve: ${error}`);
        }
    }

    private async unshelveChanges(item: any): Promise<void> {
        if (!item || !item.shelvedChange) {
            return;
        }

        const options = ['Unshelve and Keep', 'Unshelve and Delete'];
        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select unshelve option'
        });

        if (!selected) {
            return;
        }

        const removeAfter = selected === 'Unshelve and Delete';

        const changelists = this.changelistManager.getChangelists();
        let targetChangelistId = this.changelistManager.getActiveChangelist()?.id;

        if (changelists.length > 1) {
            const pickItems = changelists.map(cl => ({
                label: cl.name,
                description: cl.active ? '(active)' : '',
                changelist: cl
            }));

            const chosen = await vscode.window.showQuickPick(pickItems, {
                placeHolder: 'Select changelist to receive unshelved files',
                canPickMany: false
            });

            if (!chosen) {
                return;
            }

            targetChangelistId = chosen.changelist.id;
        }

        try {
            await this.shelfManager.unshelveChanges(item.shelvedChange.id, removeAfter);

            if (targetChangelistId && item.shelvedChange.files) {
                for (const file of item.shelvedChange.files) {
                    this.changelistManager.addFileToChangelist(file, targetChangelistId);
                }
            }

            await this.localChangesProvider.refresh();
            this.shelfProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to unshelve: ${error}`);
        }
    }

    private async deleteShelvedChanges(item: any): Promise<void> {
        if (!item || !item.shelvedChange) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete shelved changes "${item.shelvedChange.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            await this.shelfManager.deleteShelvedChange(item.shelvedChange.id);
            this.shelfProvider.refresh();
            vscode.window.showInformationMessage('Shelved changes deleted');
        }
    }

    private async stashSave(): Promise<void> {
        const message = await vscode.window.showInputBox({
            prompt: 'Enter stash message (optional)',
            placeHolder: 'Stash message',
            value: ''
        });

        try {
            await this.gitService.stash(message && message.trim().length > 0 ? message.trim() : undefined);
            await Promise.all([
                this.stashProvider.refresh(),
                this.localChangesProvider.refresh()
            ]);
            vscode.window.showInformationMessage('Changes stashed');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stash changes: ${error}`);
        }
    }

    private async stashApply(item: any): Promise<void> {
        const stashItem = item as StashTreeItem;
        if (!stashItem || !stashItem.stash) {
            return;
        }

        try {
            await this.gitService.stashApply(stashItem.stash.hash);
            await this.localChangesProvider.refresh();
            vscode.window.showInformationMessage(`Applied ${stashItem.stash.hash}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply stash: ${error}`);
        }
    }

    private async stashPop(item: any): Promise<void> {
        const stashItem = item as StashTreeItem | undefined;

        try {
            if (stashItem && stashItem.stash) {
                await this.gitService.stashPop(stashItem.stash.hash);
            } else {
                await this.gitService.stashPop();
            }
            await Promise.all([
                this.localChangesProvider.refresh(),
                this.stashProvider.refresh()
            ]);
            vscode.window.showInformationMessage('Stash popped');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to pop stash: ${error}`);
        }
    }

    private async stashDrop(item: any): Promise<void> {
        const stashItem = item as StashTreeItem;
        if (!stashItem || !stashItem.stash) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Drop ${stashItem.stash.hash}?`,
            { modal: true },
            'Drop'
        );

        if (confirm !== 'Drop') {
            return;
        }

        try {
            await this.gitService.stashDrop(stashItem.stash.hash);
            await this.stashProvider.refresh();
            vscode.window.showInformationMessage(`Dropped ${stashItem.stash.hash}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to drop stash: ${error}`);
        }
    }

    private async showStashDiff(item: any): Promise<void> {
        const stashItem = item as StashTreeItem;
        if (!stashItem || !stashItem.stash) {
            return;
        }

        try {
            const diff = await this.gitService.getStashDiff(stashItem.stash.hash);
            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });
            await vscode.window.showTextDocument(doc, {
                preview: true,
                viewColumn: vscode.ViewColumn.Beside
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show stash diff: ${error}`);
        }
    }

    private async showLog(): Promise<void> {
        await this.gitLogProvider.refresh();
        vscode.commands.executeCommand('vigit.log.focus');
    }

    private async showFileHistory(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        try {
            const commits = await this.gitService.getFileLog(filePath);
            // Show commits in a quick pick
            const items = commits.map(c => ({
                label: `$(git-commit) ${c.abbrevHash}`,
                description: c.message,
                detail: `${c.author} · ${c.date.toLocaleString()}`,
                commit: c
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select commit to view',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                await this.showCommitDetails(selected.commit);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show file history: ${error}`);
        }
    }

    private async showCommitDetails(commit: any): Promise<void> {
        try {
            const diff = await this.gitService.getCommitDiff(commit.hash);
            
            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });

            await vscode.window.showTextDocument(doc, {
                preview: true,
                viewColumn: vscode.ViewColumn.Beside
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show commit details: ${error}`);
        }
    }

    private async annotate(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        try {
            await AnnotateHelper.showAnnotations(this.gitService, editor);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to annotate: ${error}`);
        }
    }

    private async checkoutBranch(branchName: string): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Checking out ${branchName}...`,
                cancellable: false
            }, async () => {
                await this.gitService.checkoutBranch(branchName);
            });

            await this.refresh();
            vscode.window.showInformationMessage(`Checked out: ${branchName}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to checkout: ${error}`);
        }
    }

    private async newBranch(): Promise<void> {
        const branchName = await vscode.window.showInputBox({
            prompt: 'Enter new branch name',
            placeHolder: 'Branch name',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Branch name cannot be empty';
                }
                if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
                    return 'Invalid branch name';
                }
                return null;
            }
        });

        if (!branchName) {
            return;
        }

        try {
            await this.gitService.createBranch(branchName);
            await this.branchesProvider.refresh();
            vscode.window.showInformationMessage(`Created and checked out: ${branchName}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create branch: ${error}`);
        }
    }

    private async deleteBranch(item: any): Promise<void> {
        if (!item || !item.branch) {
            return;
        }

        const branchName = item.branch.name;
        const confirm = await vscode.window.showWarningMessage(
            `Delete branch "${branchName}"?`,
            { modal: true },
            'Delete',
            'Force Delete'
        );

        if (!confirm) {
            return;
        }

        try {
            const force = confirm === 'Force Delete';
            await this.gitService.deleteBranch(branchName, force);
            await this.branchesProvider.refresh();
            vscode.window.showInformationMessage(`Deleted branch: ${branchName}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete branch: ${error}`);
        }
    }

    private async mergeBranch(item: any): Promise<void> {
        if (!item || !item.branch) {
            return;
        }

        const branchName = item.branch.name;
        const confirm = await vscode.window.showWarningMessage(
            `Merge "${branchName}" into current branch?`,
            { modal: true },
            'Merge'
        );

        if (confirm === 'Merge') {
            try {
                await this.gitService.mergeBranch(branchName);
                await this.refresh();
                vscode.window.showInformationMessage(`Merged: ${branchName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to merge: ${error}`);
            }
        }
    }

    private async rebaseBranch(item: any): Promise<void> {
        if (!item || !item.branch) {
            return;
        }

        const branchName = item.branch.name;
        const confirm = await vscode.window.showWarningMessage(
            `Rebase current branch onto "${branchName}"?`,
            { modal: true },
            'Rebase'
        );

        if (confirm === 'Rebase') {
            try {
                await this.gitService.rebase(branchName);
                await this.refresh();
                vscode.window.showInformationMessage(`Rebased onto: ${branchName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to rebase: ${error}`);
            }
        }
    }

    private async pull(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Pulling from remote...',
                cancellable: false
            }, async () => {
                await this.gitService.pull();
            });

            await this.refresh();
            vscode.window.showInformationMessage('Pull completed');
        } catch (error) {
            vscode.window.showErrorMessage(`Pull failed: ${error}`);
        }
    }

    private async push(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Pushing to remote...',
                cancellable: false
            }, async () => {
                await this.gitService.push();
            });

            vscode.window.showInformationMessage('Push completed');
        } catch (error) {
            vscode.window.showErrorMessage(`Push failed: ${error}`);
        }
    }

    private async fetch(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching from remote...',
                cancellable: false
            }, async () => {
                await this.gitService.fetch();
            });

            await this.branchesProvider.refresh();
            vscode.window.showInformationMessage('Fetch completed');
        } catch (error) {
            vscode.window.showErrorMessage(`Fetch failed: ${error}`);
        }
    }

    private async cherryPick(): Promise<void> {
        const commitHash = await vscode.window.showInputBox({
            prompt: 'Enter commit hash to cherry-pick',
            placeHolder: 'Commit hash'
        });

        if (!commitHash) {
            return;
        }

        try {
            await this.gitService.cherryPick(commitHash);
            await this.refresh();
            vscode.window.showInformationMessage(`Cherry-picked: ${commitHash}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Cherry-pick failed: ${error}`);
        }
    }

    private async resetHead(): Promise<void> {
        const modes = [
            { label: 'Soft', description: 'Keep changes in index', mode: 'soft' as const },
            { label: 'Mixed', description: 'Keep changes in working directory', mode: 'mixed' as const },
            { label: 'Hard', description: 'Discard all changes', mode: 'hard' as const }
        ];

        const selectedMode = await vscode.window.showQuickPick(modes, {
            placeHolder: 'Select reset mode'
        });

        if (!selectedMode) {
            return;
        }

        const target = await vscode.window.showInputBox({
            prompt: 'Enter target (default: HEAD)',
            placeHolder: 'HEAD~1, commit hash, branch name',
            value: 'HEAD'
        });

        if (!target) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Reset HEAD to ${target} (${selectedMode.label})?`,
            { modal: true },
            'Reset'
        );

        if (confirm === 'Reset') {
            try {
                await this.gitService.reset(selectedMode.mode, target);
                await this.refresh();
                vscode.window.showInformationMessage(`Reset to: ${target}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Reset failed: ${error}`);
            }
        }
    }

    private async compareWithBranch(): Promise<void> {
        const branches = await this.gitService.getBranches();
        const items = branches.map(b => ({
            label: b.name,
            description: b.current ? '(current)' : '',
            branch: b
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select branch to compare with'
        });

        if (!selected) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const filePath = editor.document.uri.fsPath;
            try {
                const diff = await this.gitService.compareWithBranch(selected.branch.name, filePath);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: diff,
                    language: 'diff'
                });

                await vscode.window.showTextDocument(doc, {
                    preview: true,
                    viewColumn: vscode.ViewColumn.Beside
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to compare: ${error}`);
            }
        } else {
            vscode.window.showWarningMessage('No active editor');
        }
    }
}


