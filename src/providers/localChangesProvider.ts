import * as vscode from 'vscode';
import * as path from 'path';
import { GitService, GitStatus } from '../services/gitService';
import { ChangelistManager, Changelist } from '../managers/changelistManager';

export class LocalChangesTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'changelist' | 'file' | 'category',
        public readonly filePath?: string,
        public readonly changelistId?: string,
        public readonly staged?: boolean
    ) {
        super(label, collapsibleState);
        
        this.contextValue = type;
        if (type === 'file') {
            this.contextValue = staged ? 'file-staged' : 'file-unstaged';
        }

        if (filePath) {
            this.resourceUri = vscode.Uri.file(filePath);
            this.command = {
                command: 'vigit.showDiff',
                title: 'Show Diff',
                arguments: [filePath, staged]
            };
        }

        this.iconPath = this.getIcon();
        this.tooltip = this.getTooltip();
    }

    private getIcon(): vscode.ThemeIcon | undefined {
        switch (this.type) {
            case 'changelist':
                return new vscode.ThemeIcon('folder');
            case 'category':
                return new vscode.ThemeIcon('folder-opened');
            case 'file':
                return vscode.ThemeIcon.File;
            default:
                return undefined;
        }
    }

    private getTooltip(): string {
        if (this.type === 'file' && this.filePath) {
            return this.filePath;
        }
        return this.label;
    }
}

export class LocalChangesProvider implements vscode.TreeDataProvider<LocalChangesTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<LocalChangesTreeItem | undefined | null> = 
        new vscode.EventEmitter<LocalChangesTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<LocalChangesTreeItem | undefined | null> = 
        this._onDidChangeTreeData.event;

    private gitStatus: GitStatus | null = null;
    private workspaceRoot: string;
    private gitService: GitService;
    private changelistManager: ChangelistManager;

    constructor(
        workspaceRoot: string,
        gitService: GitService,
        changelistManager: ChangelistManager
    ) {
        this.workspaceRoot = workspaceRoot;
        this.gitService = gitService;
        this.changelistManager = changelistManager;
        this.refresh();
    }

    async refresh(): Promise<void> {
        try {
            this.gitStatus = await this.gitService.getStatus();
            
            // Update changelists with current files
            const allChangedFiles = new Set([
                ...this.gitStatus.modified,
                ...this.gitStatus.staged,
                ...this.gitStatus.untracked,
                ...this.gitStatus.deleted
            ].map(f => path.join(this.workspaceRoot, f)));

            const config = vscode.workspace.getConfiguration('vigit');
            const autoStage = config.get<boolean>('autoStage', false);

            const filesToStage: string[] = [];

            // Auto-assign new files to active changelist
            for (const file of allChangedFiles) {
                const existing = this.changelistManager.getChangelistForFile(file);
                if (!existing) {
                    const added = this.changelistManager.addFileToChangelist(file);
                    if (added && autoStage) {
                        filesToStage.push(file);
                    }
                }
            }

            // Clean up files that no longer exist
            this.changelistManager.clearEmptyFiles(allChangedFiles);

            if (filesToStage.length > 0) {
                await this.gitService.stageFiles(filesToStage);
            }

            this._onDidChangeTreeData.fire(undefined);
        } catch (error) {
            console.error('Error refreshing local changes:', error);
        }
    }

    getTreeItem(element: LocalChangesTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: LocalChangesTreeItem): Promise<LocalChangesTreeItem[]> {
        if (!element) {
            // Root level - show changelists
            return this.getChangelistItems();
        }

        if (element.type === 'changelist') {
            // Show files in changelist
            return this.getFilesInChangelist(element.changelistId!);
        }

        if (element.type === 'category' && element.label.startsWith('Unversioned Files')) {
            return this.getUnversionedFileItems();
        }

        return [];
    }

    private getChangelistItems(): LocalChangesTreeItem[] {
        const changelists = this.changelistManager.getChangelists();
        const items: LocalChangesTreeItem[] = [];

        for (const changelist of changelists) {
            const fileCount = changelist.files.length;
            const label = changelist.active 
                ? `${changelist.name} (active) [${fileCount}]`
                : `${changelist.name} [${fileCount}]`;

            const item = new LocalChangesTreeItem(
                label,
                vscode.TreeItemCollapsibleState.Expanded,
                'changelist',
                undefined,
                changelist.id
            );

            item.contextValue = 'changelist';
            item.iconPath = new vscode.ThemeIcon(
                changelist.active ? 'folder-active' : 'folder',
                changelist.active ? new vscode.ThemeColor('charts.green') : undefined
            );

            if (changelist.description) {
                item.tooltip = `${changelist.name}\n${changelist.description}`;
            }

            items.push(item);
        }

        // Show unversioned files if enabled
        const config = vscode.workspace.getConfiguration('vigit');
        const showUnversioned = config.get<boolean>('showUnversionedFiles', true);
        
        if (showUnversioned && this.gitStatus && this.gitStatus.untracked.length > 0) {
            const unversionedFiles = this.gitStatus.untracked
                .filter(f => !changelists.some(cl => 
                    cl.files.includes(path.join(this.workspaceRoot, f))
                ));

            if (unversionedFiles.length > 0) {
                const unversionedItem = new LocalChangesTreeItem(
                    `Unversioned Files [${unversionedFiles.length}]`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'category'
                );
                items.push(unversionedItem);
            }
        }

        return items;
    }

    private getUnversionedFileItems(): LocalChangesTreeItem[] {
        if (!this.gitStatus) {
            return [];
        }

        const items: LocalChangesTreeItem[] = [];

        const files = this.gitStatus.untracked
            .map(f => path.join(this.workspaceRoot, f))
            .filter(f => !this.changelistManager.getChangelistForFile(f));

        for (const filePath of files) {
            const fileName = path.basename(filePath);
            const label = `${fileName} (Untracked)`;

            const item = new LocalChangesTreeItem(
                label,
                vscode.TreeItemCollapsibleState.None,
                'file',
                filePath
            );

            item.iconPath = new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('charts.yellow'));
            items.push(item);
        }

        return items;
    }

    private getFilesInChangelist(changelistId: string): LocalChangesTreeItem[] {
        const changelist = this.changelistManager.getChangelist(changelistId);
        if (!changelist || !this.gitStatus) {
            return [];
        }

        const items: LocalChangesTreeItem[] = [];
        const stagedFiles = this.gitStatus.staged.map(f => path.join(this.workspaceRoot, f));

        for (const filePath of changelist.files) {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            const fileName = path.basename(filePath);
            const staged = stagedFiles.includes(filePath);

            let status = '';
            if (this.gitStatus.modified.includes(relativePath)) {
                status = ' (Modified)';
            } else if (this.gitStatus.deleted.includes(relativePath)) {
                status = ' (Deleted)';
            } else if (this.gitStatus.untracked.includes(relativePath)) {
                status = ' (Untracked)';
            }

            const label = `${fileName}${status}`;
            const item = new LocalChangesTreeItem(
                label,
                vscode.TreeItemCollapsibleState.None,
                'file',
                filePath,
                changelistId,
                staged
            );

            // Set decorations
            if (staged) {
                item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            } else if (status.includes('Modified')) {
                item.iconPath = new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.blue'));
            } else if (status.includes('Deleted')) {
                item.iconPath = new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
            } else if (status.includes('Untracked')) {
                item.iconPath = new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('charts.yellow'));
            }

            items.push(item);
        }

        return items;
    }

    getGitStatus(): GitStatus | null {
        return this.gitStatus;
    }
}


