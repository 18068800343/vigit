import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { GitService, GitStatus, GitBranch } from '../services/gitService';
import { ChangelistManager, Changelist } from '../managers/changelistManager';
import { ShelfManager, ShelvedChange } from '../managers/shelfManager';
import { LocalChangesProvider } from '../providers/localChangesProvider';
import { ShelfProvider } from '../providers/shelfProvider';
import { BranchesProvider } from '../providers/branchesProvider';
import { StashProvider, StashTreeItem } from '../providers/stashProvider';
import { CommitDialog } from '../ui/commitDialog';
import { BranchDetailsPanel } from '../ui/branchDetailsPanel';
import { PushDialog } from '../ui/pushDialog';
import { DiffViewHelper } from '../helpers/diffViewHelper';
import { AnnotateHelper } from '../helpers/annotateHelper';

export class CommandRegistry {
    private context: vscode.ExtensionContext;
    private gitService: GitService;
    private changelistManager: ChangelistManager;
    private shelfManager: ShelfManager;
    private localChangesProvider: LocalChangesProvider;
    private shelfProvider: ShelfProvider;
    private branchesProvider: BranchesProvider;
    private stashProvider: StashProvider;
    private commitDialog: CommitDialog;
    private branchDetailsPanel: BranchDetailsPanel;
    private pushDialog: PushDialog;

    constructor(
        context: vscode.ExtensionContext,
        gitService: GitService,
        changelistManager: ChangelistManager,
        shelfManager: ShelfManager,
        localChangesProvider: LocalChangesProvider,
        shelfProvider: ShelfProvider,
        branchesProvider: BranchesProvider,
        stashProvider: StashProvider,
        commitDialog: CommitDialog,
        branchDetailsPanel: BranchDetailsPanel,
        pushDialog: PushDialog
    ) {
        this.context = context;
        this.gitService = gitService;
        this.changelistManager = changelistManager;
        this.shelfManager = shelfManager;
        this.localChangesProvider = localChangesProvider;
        this.shelfProvider = shelfProvider;
        this.branchesProvider = branchesProvider;
        this.stashProvider = stashProvider;
        this.commitDialog = commitDialog;
        this.branchDetailsPanel = branchDetailsPanel;
        this.pushDialog = pushDialog;
        void this.ensureTreeIndent();
    }

    registerAllCommands(): void {
        // General commands
        this.register('vigit.refresh', () => this.refresh());

        // Commit commands
        this.register('vigit.commit', () => this.commit());
        this.register('vigit.commitAndPush', () => this.commitAndPush());
        this.register('vigit.commitDirectory', (resource?: vscode.Uri, resources?: vscode.Uri[]) => 
            this.commitDirectory(resource, resources));

        // File commands
        this.register('vigit.showDiff', (filePath: string, staged: boolean) => 
            this.showDiff(filePath, staged));
        this.register('vigit.revertFile', (item: any) => this.revertFile(item));
        this.register('vigit.stageFile', (item: any) => this.stageFile(item));
        this.register('vigit.unstageFile', (item: any) => this.unstageFile(item));
        this.register('vigit.stagePath', (resource?: vscode.Uri, resources?: vscode.Uri[]) => 
            this.stagePath(resource, resources));
        this.register('vigit.showDiffNewTab', (filePath: string, staged: boolean) =>
            this.showDiffInNewTab(filePath, staged));
        this.register('vigit.commitFile', (item: any) => this.commitFile(item));
        this.register('vigit.jumpToSource', (item: any) => this.jumpToSource(item));
        this.register('vigit.copyPatchToClipboard', (item: any) => this.copyPatchToClipboard(item));
        this.register('vigit.createPatchFromLocalChanges', (item: any) => this.createPatchFromLocalChanges(item));
        this.register('vigit.showLocalChangesAsUml', (item: any) => this.showLocalChangesAsUml(item));
        this.register('vigit.deleteWorkingTreeFile', (item: any) => this.deleteWorkingTreeFile(item));
        this.register('vigit.openGitExclude', () => this.openGitExclude());
        this.register('vigit.showPathDiff', (resource?: vscode.Uri) => this.showPathDiff(resource));
        this.register('vigit.compareWithRevision', (resource?: vscode.Uri) => this.compareWithRevision(resource));
        this.register('vigit.rollbackPath', (resource?: vscode.Uri, resources?: vscode.Uri[]) => 
            this.rollbackPath(resource, resources));

        // Changelist commands
        this.register('vigit.newChangelist', () => this.newChangelist());
        this.register('vigit.moveToChangelist', (item: any) => this.moveToChangelist(item));
        this.register('vigit.deleteChangelist', (item: any) => this.deleteChangelist(item));
        this.register('vigit.setActiveChangelist', (item: any) => this.setActiveChangelist(item));
        this.register('vigit.editChangelist', (item: any) => this.editChangelist(item));

        // Shelf commands
        this.register('vigit.shelveChanges', () => this.shelveChanges());
        this.register('vigit.unshelveChanges', (item: any) => this.unshelveChanges(item));
        this.register('vigit.deleteShelvedChanges', (item: any) => this.deleteShelvedChanges(item));
        this.register('vigit.showShelvedDiff', (item: any) => this.showShelvedDiff(item));

        // Stash commands
        this.register('vigit.stashSave', () => this.stashSave());
        this.register('vigit.stashApply', (item: any) => this.stashApply(item));
        this.register('vigit.stashPop', (item: any) => this.stashPop(item));
        this.register('vigit.stashDrop', (item: any) => this.stashDrop(item));
        this.register('vigit.showStashDiff', (item: any) => this.showStashDiff(item));

        this.register('vigit.showFileHistory', () => this.showFileHistory());
        this.register('vigit.showCommitDetails', (commit: any) => this.showCommitDetails(commit));
        this.register('vigit.showBranchDetails', (branch: GitBranch) => this.showBranchDetails(branch));
        this.register('vigit.annotate', () => this.annotate());

        // Branch commands
        this.register('vigit.checkoutBranch', (item: any) => this.checkoutBranch(item));
        this.register('vigit.newBranch', () => this.newBranch());
        this.register('vigit.deleteBranch', (item: any) => this.deleteBranch(item));
        this.register('vigit.mergeBranch', (item: any) => this.mergeBranch(item));
        this.register('vigit.rebaseBranch', (item: any) => this.rebaseBranch(item));
        this.register('vigit.pushBranch', (item: any) => this.pushBranch(item));
        this.register('vigit.openBranchesView', () => this.openBranchesView());
        this.register('vigit.createTag', () => this.createTag());

        // Git operations
        this.register('vigit.pull', () => this.pull());
        this.register('vigit.push', () => this.push());
        this.register('vigit.fetch', () => this.fetch());
        this.register('vigit.cherryPick', () => this.cherryPick());
        this.register('vigit.resetHead', () => this.resetHead());
        this.register('vigit.compareWithBranch', (resource?: vscode.Uri, resources?: vscode.Uri[]) => 
            this.compareWithBranch(resource, resources));
        this.register('vigit.unstashChanges', () => this.unstashChanges());
        this.register('vigit.manageRemotes', () => this.manageRemotes());
        this.register('vigit.cloneRepository', () => this.cloneRepository());
    }

    /**
     * 调高树视图缩进，让左下角 Branches 图标距离左边至少约 50px。
     */
    private async ensureTreeIndent(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('workbench');
            const current = config.get<number>('tree.indent', 8);
            if (current < 50) {
                await config.update('tree.indent', 50, vscode.ConfigurationTarget.Global);
            }
        } catch (error) {
            console.warn('ViGit: unable to update workbench.tree.indent', error);
        }
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
            this.branchesProvider.refresh(),
            this.stashProvider.refresh()
        ]);
        this.shelfProvider.refresh();
        vscode.window.showInformationMessage('Refreshed');
    }

    private async commit(): Promise<void> {
        const focused = await this.focusCommitPanel();
        if (!focused) {
            await this.commitDialog.showCommitDialog(false);
        }
    }

    private async commitAndPush(): Promise<void> {
        await this.commitDialog.showCommitDialog(true);
    }

    private async commitDirectory(resource?: vscode.Uri, resources?: vscode.Uri[]): Promise<void> {
        const target = this.resolveResource(resource, resources) ?? vscode.Uri.file(this.gitService.getWorkspaceRoot());
        const targetPath = target.fsPath;
        const files = this.changelistManager.getFilesUnderPath(targetPath);

        if (files.length === 0) {
            vscode.window.showWarningMessage('No tracked changes under the selected path');
            return;
        }

        const label = path.basename(targetPath) || targetPath;
        await this.commitDialog.commitFiles(files, {
            title: `Commit message for "${label}"`
        });
    }

    private async showDiff(filePath: string, staged: boolean = false): Promise<void> {
        try {
            await DiffViewHelper.showDiff(this.gitService, filePath, staged);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show diff: ${error}`);
        }
    }

    private async showDiffInNewTab(filePath: string, staged: boolean = false): Promise<void> {
        try {
            await DiffViewHelper.showDiff(this.gitService, filePath, staged, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: false
            });
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

    private async stagePath(resource?: vscode.Uri, resources?: vscode.Uri[]): Promise<void> {
        const targets = this.resolveResourceArray(resource, resources);
        if (targets.length === 0) {
            vscode.window.showWarningMessage('No path selected to add');
            return;
        }

        try {
            await this.gitService.stageFiles(targets.map(uri => uri.fsPath));
            await this.localChangesProvider.refresh();
            vscode.window.showInformationMessage(`Added ${targets.length} path${targets.length > 1 ? 's' : ''}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add paths: ${error}`);
        }
    }

    private async commitFile(item: any): Promise<void> {
        const files = this.collectFilesFromItem(item);
        if (files.length === 0) {
            vscode.window.showWarningMessage('Select a file or changelist to commit');
            return;
        }

        await this.commitDialog.commitFiles(files, {
            changelistId: item?.changelistId
        });
    }

    private async jumpToSource(item: any): Promise<void> {
        const filePath = this.collectFilesFromItem(item)[0];
        if (!filePath) {
            return;
        }

        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document, { preview: false });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${error}`);
        }
    }

    private async deleteWorkingTreeFile(item: any): Promise<void> {
        const filePath = item?.filePath;
        if (!filePath) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete "${path.basename(filePath)}" from disk?`,
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
            if (item?.changelistId) {
                this.changelistManager.removeFileFromChangelist(filePath, item.changelistId);
            }
            await this.localChangesProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete file: ${error}`);
        }
    }

    private async openGitExclude(): Promise<void> {
        const excludePath = path.join(this.gitService.getWorkspaceRoot(), '.git', 'info', 'exclude');
        try {
            await fs.mkdir(path.dirname(excludePath), { recursive: true });
            try {
                await fs.access(excludePath);
            } catch {
                await fs.writeFile(excludePath, '# Ignore additional files locally\n');
            }

            const doc = await vscode.workspace.openTextDocument(excludePath);
            await vscode.window.showTextDocument(doc, { preview: false });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open .git/info/exclude: ${error}`);
        }
    }

    private async showPathDiff(resource?: vscode.Uri): Promise<void> {
        const target = resource ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
            vscode.window.showWarningMessage('No file or folder selected to show diff');
            return;
        }

        try {
            const diff = await this.gitService.getDiff(target.fsPath);
            if (!diff.trim()) {
                vscode.window.showInformationMessage('No differences for the selected path');
                return;
            }

            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });

            await vscode.window.showTextDocument(doc, {
                preview: true,
                viewColumn: vscode.ViewColumn.Beside
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show diff: ${error}`);
        }
    }

    private async compareWithRevision(resource?: vscode.Uri): Promise<void> {
        const commits = await this.gitService.getLog(50);
        if (commits.length === 0) {
            vscode.window.showWarningMessage('No commits available to compare');
            return;
        }

        const items = commits.map(commit => ({
            label: `${commit.abbrevHash} ${commit.message}`,
            description: `${commit.author} · ${commit.date.toLocaleString()}`,
            commit
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a revision to compare with'
        });

        if (!selected) {
            return;
        }

        const targetPath = resource?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;

        try {
            const diff = await this.gitService.compareWithBranch(selected.commit.hash, targetPath);
            if (!diff.trim()) {
                vscode.window.showInformationMessage('No differences for the selected revision');
                return;
            }

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
    }

    private async rollbackPath(resource?: vscode.Uri, resources?: vscode.Uri[]): Promise<void> {
        const targets = this.resolveResourceArray(resource, resources);
        if (targets.length === 0) {
            vscode.window.showWarningMessage('No path selected to roll back');
            return;
        }

        const label = targets.length === 1
            ? path.basename(targets[0].fsPath) || targets[0].fsPath
            : `${targets.length} paths`;

        const confirm = await vscode.window.showWarningMessage(
            `Revert changes in ${label}?`,
            { modal: true },
            'Rollback'
        );

        if (confirm !== 'Rollback') {
            return;
        }

        try {
            await this.gitService.revertPaths(targets.map(uri => uri.fsPath));
            await this.refresh();
            vscode.window.showInformationMessage(`Reverted ${label}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rollback: ${error}`);
        }
    }

    private async copyPatchToClipboard(item: any): Promise<void> {
        const files = this.collectFilesFromItem(item);
        if (files.length === 0) {
            vscode.window.showWarningMessage('No changes to copy');
            return;
        }

        try {
            const patch = await this.generatePatchForFiles(files);
            if (!patch.trim()) {
                vscode.window.showInformationMessage('No differences found for selected files');
                return;
            }
            await vscode.env.clipboard.writeText(patch);
            vscode.window.showInformationMessage('Patch copied to clipboard');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to copy patch: ${error}`);
        }
    }

    private async createPatchFromLocalChanges(item: any): Promise<void> {
        const files = this.collectFilesFromItem(item);
        if (files.length === 0) {
            vscode.window.showWarningMessage('No changes to export');
            return;
        }

        const defaultPath = path.join(this.gitService.getWorkspaceRoot(), 'changes.patch');
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultPath),
            filters: {
                Patch: ['patch', 'diff'],
                All: ['*']
            }
        });

        if (!uri) {
            return;
        }

        try {
            const patch = await this.generatePatchForFiles(files);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(patch, 'utf8'));
            vscode.window.showInformationMessage(`Patch saved to ${uri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save patch: ${error}`);
        }
    }

    private async showLocalChangesAsUml(item: any): Promise<void> {
        const files = this.collectFilesFromItem(item);
        if (files.length === 0) {
            vscode.window.showWarningMessage('No files selected');
            return;
        }

        try {
            const status = this.localChangesProvider.getGitStatus() ?? await this.gitService.getStatus();
            const uml = this.buildUmlDiagram(files, status);
            const doc = await vscode.workspace.openTextDocument({
                content: uml,
                language: 'plantuml'
            });
            await vscode.window.showTextDocument(doc, { preview: false });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to render UML: ${error}`);
        }
    }

    private async promptForNewChangelist(): Promise<Changelist | undefined> {
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
            return undefined;
        }

        const description = await vscode.window.showInputBox({
            prompt: 'Enter changelist description (optional)',
            placeHolder: 'Description'
        });

        const changelist = this.changelistManager.createChangelist(name, description);
        vscode.window.showInformationMessage(`Created changelist: ${name}`);
        return changelist;
    }

    private async newChangelist(): Promise<void> {
        const changelist = await this.promptForNewChangelist();
        if (changelist) {
            await this.localChangesProvider.refresh();
        }
    }

    private async moveToChangelist(item: any): Promise<void> {
        if (!item || !item.filePath) {
            return;
        }

        const changelists = this.changelistManager.getChangelists();
        type MoveTargetPick = vscode.QuickPickItem & {
            changelist?: Changelist;
            createNew?: boolean;
        };
        const items: MoveTargetPick[] = changelists.map(cl => ({
            label: cl.name,
            description: cl.active ? '(active)' : '',
            changelist: cl
        }));
        items.push({
            label: '$(plus) Create New Changelist...',
            detail: 'Create a new changelist and move the file into it',
            createNew: true
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select target changelist'
        });

        if (!selected) {
            return;
        }

        let targetChangelistId: string | undefined = selected.changelist?.id;

        if (selected.createNew) {
            const created = await this.promptForNewChangelist();
            if (!created) {
                return;
            }
            targetChangelistId = created.id;
        }

        if (!targetChangelistId) {
            return;
        }

        this.changelistManager.moveFileToChangelist(item.filePath, targetChangelistId);
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

    private async editChangelist(item: any): Promise<void> {
        if (!item || !item.changelistId) {
            return;
        }

        const changelist = this.changelistManager.getChangelist(item.changelistId);
        if (!changelist) {
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Rename changelist',
            value: changelist.name,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Name cannot be empty';
                }
                return null;
            }
        });

        if (!newName) {
            return;
        }

        const description = await vscode.window.showInputBox({
            prompt: 'Update changelist description (optional)',
            value: changelist.description ?? '',
            placeHolder: 'Leave empty to clear description'
        });

        this.changelistManager.updateChangelist(item.changelistId, {
            name: newName.trim(),
            description: description !== undefined ? description.trim() || undefined : changelist.description
        });

        await this.localChangesProvider.refresh();
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
            const restored = await this.shelfManager.unshelveChanges(item.shelvedChange.id, removeAfter);

            if (targetChangelistId) {
                const files = this.getFilesFromShelvedChange(restored);
                for (const file of files) {
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

    private async showShelvedDiff(item: any): Promise<void> {
        if (!item || !item.shelvedChange) {
            return;
        }

        try {
            const patch = this.shelfManager.getPatchContent(item.shelvedChange.id);
            const doc = await vscode.workspace.openTextDocument({
                content: patch,
                language: 'diff'
            });
            await vscode.window.showTextDocument(doc, {
                preview: true,
                viewColumn: vscode.ViewColumn.Beside
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show shelf diff: ${error}`);
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

    private async unstashChanges(): Promise<void> {
        const stashes = await this.gitService.getStashList();
        if (stashes.length === 0) {
            vscode.window.showInformationMessage('No stashes available');
            return;
        }

        const pick = await vscode.window.showQuickPick(
            stashes.map(stash => ({
                label: stash.message || stash.hash,
                description: `${stash.hash} · ${stash.date.toLocaleString()}`,
                stash
            })),
            { placeHolder: 'Select a stash to restore' }
        );

        if (!pick) {
            return;
        }

        const mode = await vscode.window.showQuickPick([
            { label: 'Apply (keep in stash)', action: 'apply' as const },
            { label: 'Pop (remove from stash)', action: 'pop' as const }
        ], {
            placeHolder: 'How would you like to restore this stash?'
        });

        if (!mode) {
            return;
        }

        try {
            if (mode.action === 'apply') {
                await this.gitService.stashApply(pick.stash.hash);
            } else {
                await this.gitService.stashPop(pick.stash.hash);
            }
            await Promise.all([
                this.localChangesProvider.refresh(),
                this.stashProvider.refresh()
            ]);
            vscode.window.showInformationMessage(`Restored stash ${pick.stash.hash}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to restore stash: ${error}`);
        }
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

    private async showBranchDetails(branch: GitBranch | { branch?: GitBranch } | undefined): Promise<void> {
        const target = (branch as any)?.branch ?? branch;
        if (!target || !target.name) {
            return;
        }

        try {
            await this.branchDetailsPanel.show(target);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open branch details: ${error}`);
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

    private async checkoutBranch(item: any): Promise<void> {
        let branchName: string | undefined =
            typeof item === 'string' ? item : item?.branch?.name;

        if (!branchName) {
            const branches = await this.gitService.getBranches();
            const pick = await vscode.window.showQuickPick(
                branches.map(branch => ({
                    label: branch.name,
                    description: branch.current
                        ? 'current branch'
                        : branch.upstream
                            ? `tracking ${branch.upstream}`
                            : branch.remote
                                ? 'remote branch'
                                : 'local branch',
                    branch
                })),
                { placeHolder: 'Select branch to checkout' }
            );
            branchName = pick?.branch.name;
        }

        if (!branchName) {
            return;
        }

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
        let branchName: string | undefined = item?.branch?.name;

        if (!branchName) {
            const branches = (await this.gitService.getBranches())
                .filter(branch => !branch.current && !branch.remote);
            const pick = await vscode.window.showQuickPick(
                branches.map(branch => ({
                    label: branch.name,
                    description: branch.upstream ? `tracking ${branch.upstream}` : '',
                    branch
                })),
                { placeHolder: 'Select branch to merge into current branch' }
            );
            branchName = pick?.branch.name;
        }

        if (!branchName) {
            return;
        }

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
        let branchName: string | undefined = item?.branch?.name;

        if (!branchName) {
            const branches = (await this.gitService.getBranches())
                .filter(branch => !branch.current && !branch.remote);
            const pick = await vscode.window.showQuickPick(
                branches.map(branch => ({
                    label: branch.name,
                    description: branch.upstream ? `tracking ${branch.upstream}` : '',
                    branch
                })),
                { placeHolder: 'Select branch to rebase onto' }
            );
            branchName = pick?.branch.name;
        }

        if (!branchName) {
            return;
        }

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

    private async pushBranch(item: any): Promise<void> {
        let branch: GitBranch | undefined = item?.branch;

        if (!branch) {
            const localBranches = (await this.gitService.getBranches()).filter(b => !b.remote);
            if (localBranches.length === 0) {
                vscode.window.showWarningMessage('No local branches available to push.');
                return;
            }

            const pick = await vscode.window.showQuickPick(
                localBranches.map(localBranch => ({
                    label: localBranch.name,
                    description: localBranch.upstream ? `tracking ${localBranch.upstream}` : 'no upstream',
                    branch: localBranch
                })),
                { placeHolder: 'Select local branch to push' }
            );
            branch = pick?.branch;
        }

        if (!branch || branch.remote) {
            if (!branch) {
                vscode.window.showWarningMessage('No branch selected to push.');
            } else {
                vscode.window.showWarningMessage('Push is only available for local branches.');
            }
            return;
        }

        try {
            await this.pushDialog.show(branch);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to open push dialog: ${message}`);
        }
    }

    private async openBranchesView(): Promise<void> {
        await vscode.commands.executeCommand('workbench.view.extension.vigit-container');
        await vscode.commands.executeCommand('vigit.branches.focus');
    }

    private async createTag(): Promise<void> {
        const tagName = await vscode.window.showInputBox({
            prompt: 'Enter tag name',
            placeHolder: 'v1.0.0',
            validateInput: (value) => !value?.trim() ? 'Tag name cannot be empty' : null
        });

        if (!tagName) {
            return;
        }

        const startPoint = await vscode.window.showInputBox({
            prompt: 'Create tag at (leave empty for HEAD)',
            placeHolder: 'HEAD, commit hash, branch name'
        });

        try {
            await this.gitService.createTag(tagName.trim(), startPoint?.trim() || undefined);
            vscode.window.showInformationMessage(`Created tag ${tagName.trim()}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create tag: ${error}`);
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

    private async compareWithBranch(resource?: vscode.Uri, resources?: vscode.Uri[]): Promise<void> {
        const branches = await this.gitService.getBranches();
        const tags = await this.gitService.getTags();

        const items = [
            ...branches.map(branch => ({
                label: branch.name,
                description: branch.current ? 'current branch' : branch.remote ? 'remote' : 'branch',
                ref: branch.name
            })),
            ...tags.map(tag => ({
                label: tag,
                description: 'tag',
                ref: tag
            }))
        ];

        if (items.length === 0) {
            vscode.window.showWarningMessage('No branches or tags available');
            return;
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select branch or tag to compare with'
        });

        if (!selected) {
            return;
        }

        const targetUri = this.resolveResource(resource, resources) ?? vscode.window.activeTextEditor?.document.uri;

        try {
            const diff = await this.gitService.compareWithBranch(selected.ref, targetUri?.fsPath);
            if (!diff.trim()) {
                vscode.window.showInformationMessage('No differences found');
                return;
            }

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
    }

    private async manageRemotes(): Promise<void> {
        const action = await vscode.window.showQuickPick([
            { label: 'Add Remote...', action: 'add' as const },
            { label: 'Change Remote URL...', action: 'update' as const },
            { label: 'Remove Remote...', action: 'remove' as const }
        ], {
            placeHolder: 'Select remote operation'
        });

        if (!action) {
            return;
        }

        const remotes = await this.gitService.getRemotes();

        const pickRemote = async (placeholder: string) => {
            if (remotes.length === 0) {
                vscode.window.showWarningMessage('No remotes configured');
                return undefined;
            }

            const remotePick = await vscode.window.showQuickPick(
                remotes.map(remote => ({
                    label: remote.name,
                    description: remote.refs.fetch ?? remote.refs.push ?? '',
                    remote
                })),
                { placeHolder: placeholder }
            );

            return remotePick?.remote;
        };

        try {
            if (action.action === 'add') {
                const name = await vscode.window.showInputBox({
                    prompt: 'Remote name',
                    placeHolder: 'origin',
                    validateInput: value => !value?.trim() ? 'Name is required' : null
                });
                if (!name) {
                    return;
                }
                const url = await vscode.window.showInputBox({
                    prompt: 'Remote URL',
                    placeHolder: 'https://github.com/user/repo.git',
                    validateInput: value => !value?.trim() ? 'URL is required' : null
                });
                if (!url) {
                    return;
                }
                await this.gitService.addRemote(name.trim(), url.trim());
                vscode.window.showInformationMessage(`Added remote ${name.trim()}`);
            } else if (action.action === 'update') {
                const remote = await pickRemote('Select remote to update');
                if (!remote) {
                    return;
                }
                const url = await vscode.window.showInputBox({
                    prompt: `New URL for ${remote.name}`,
                    value: remote.refs.fetch ?? remote.refs.push ?? '',
                    validateInput: value => !value?.trim() ? 'URL is required' : null
                });
                if (!url) {
                    return;
                }
                await this.gitService.updateRemote(remote.name, url.trim());
                vscode.window.showInformationMessage(`Updated remote ${remote.name}`);
            } else if (action.action === 'remove') {
                const remote = await pickRemote('Select remote to remove');
                if (!remote) {
                    return;
                }
                const confirm = await vscode.window.showWarningMessage(
                    `Remove remote "${remote.name}"?`,
                    { modal: true },
                    'Remove'
                );
                if (confirm !== 'Remove') {
                    return;
                }
                await this.gitService.removeRemote(remote.name);
                vscode.window.showInformationMessage(`Removed remote ${remote.name}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Remote operation failed: ${error}`);
        }
    }

    private async cloneRepository(): Promise<void> {
        await vscode.commands.executeCommand('git.clone');
    }

    private resolveResource(resource?: any, resources?: vscode.Uri[]): vscode.Uri | undefined {
        if (resource instanceof vscode.Uri) {
            return resource;
        }
        if (resource?.resourceUri instanceof vscode.Uri) {
            return resource.resourceUri;
        }
        if (resources && resources.length > 0) {
            return resources[0];
        }
        return undefined;
    }

    private resolveResourceArray(resource?: any, resources?: vscode.Uri[]): vscode.Uri[] {
        const uris: vscode.Uri[] = [];

        if (resources) {
            for (const entry of resources) {
                if (entry instanceof vscode.Uri && !uris.find(uri => uri.toString() === entry.toString())) {
                    uris.push(entry);
                }
            }
        }

        const primary = this.resolveResource(resource, resources);
        if (primary && !uris.find(uri => uri.toString() === primary.toString())) {
            uris.unshift(primary);
        }

        return uris;
    }

    private collectFilesFromItem(item: any): string[] {
        if (!item) {
            return [];
        }

        if (Array.isArray(item)) {
            return item.flatMap(child => this.collectFilesFromItem(child));
        }

        if (item.filePath) {
            return [item.filePath];
        }

        if (item.folderPath && item.changelistId) {
            const folder = this.normalizeFsPath(item.folderPath);
            return this.changelistManager
                .getFilesInChangelist(item.changelistId)
                .filter(file => this.normalizeFsPath(file).startsWith(folder));
        }

        if (item.folderPath) {
            const status = this.localChangesProvider.getGitStatus();
            if (status) {
                const folder = this.normalizeFsPath(item.folderPath);
                return status.untracked
                    .map(rel => path.join(this.gitService.getWorkspaceRoot(), rel))
                    .filter(file => this.normalizeFsPath(file).startsWith(folder));
            }
        }

        if (item.changelistId) {
            return this.changelistManager.getFilesInChangelist(item.changelistId);
        }

        if (item.children && Array.isArray(item.children)) {
            return item.children.flatMap((child: any) => this.collectFilesFromItem(child));
        }

        return [];
    }

    private normalizeFsPath(filePath: string): string {
        return path.normalize(filePath);
    }

    private async focusCommitPanel(): Promise<boolean> {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.vigit-container');
            await vscode.commands.executeCommand('vigit.commitPanel.focus');
            return true;
        } catch (error) {
            console.warn('ViGit: unable to focus commit panel, falling back to dialog', error);
            return false;
        }
    }

    private async generatePatchForFiles(files: string[]): Promise<string> {
        const uniqueFiles = Array.from(new Set(files));
        const diffs = await Promise.all(uniqueFiles.map(async file => {
            const diff = await this.gitService.getDiff(file);
            return diff;
        }));

        return diffs.filter(Boolean).join('\n');
    }

    private buildUmlDiagram(files: string[], status: GitStatus): string {
        const workspaceRoot = this.gitService.getWorkspaceRoot();
        const title = `Local Changes (${files.length} file${files.length !== 1 ? 's' : ''})`;
        const lines: string[] = ['@startuml', `title ${title}`, `package "${path.basename(workspaceRoot)}" {`];

        files.forEach((file, index) => {
            const relative = path.relative(workspaceRoot, file).replace(/\\/g, '/');
            const stereotype = this.getStatusLabelForFile(relative, status);
            const alias = `F${index}`;
            lines.push(`  class "${relative}" as ${alias} <<${stereotype}>>`);
        });

        lines.push('}');
        lines.push('@enduml');
        return lines.join('\n');
    }

    private getStatusLabelForFile(relativePath: string, status: GitStatus): string {
        const normalized = relativePath.replace(/\\/g, '/');

        if (status.untracked.includes(normalized)) {
            return 'Untracked';
        }
        if (status.deleted.includes(normalized)) {
            return 'Deleted';
        }
        if (status.modified.includes(normalized)) {
            return 'Modified';
        }
        if (status.renamed.some(entry => entry.to === normalized || entry.from === normalized)) {
            return 'Renamed';
        }
        if (status.staged && status.staged.includes(normalized)) {
            return 'Staged';
        }
        return 'Changed';
    }

    private getFilesFromShelvedChange(change: ShelvedChange): string[] {
        if (change.files && change.files.length > 0) {
            return change.files;
        }

        try {
            const patch = this.shelfManager.getPatchContent(change.id);
            const files = new Set<string>();
            const regex = /^\+\+\+\s+b\/(.+)$/gm;
            let match: RegExpExecArray | null;

            while ((match = regex.exec(patch)) !== null) {
                const relative = match[1].trim();
                if (!relative || relative === '/dev/null') {
                    continue;
                }
                files.add(path.join(this.gitService.getWorkspaceRoot(), relative.replace(/\//g, path.sep)));
            }

            return Array.from(files);
        } catch {
            return [];
        }
    }
}


