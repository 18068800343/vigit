import * as vscode from 'vscode';
import * as path from 'path';
import { GitService, GitStatus } from '../services/gitService';
import { ChangelistManager, Changelist } from '../managers/changelistManager';

interface FileNode {
    type: 'file';
    filePath: string;
}

interface FolderNode {
    type: 'folder';
    name: string;
    path: string;
    children: Map<string, TreeNode>;
}

type TreeNode = FileNode | FolderNode;

interface StatusIndex {
    modified: Set<string>;
    deleted: Set<string>;
    untracked: Set<string>;
    renamed: { from: string; to: string }[];
}

interface FileTreeOptions {
    changelistId?: string;
    stagedFiles?: Set<string>;
    statusIndex?: StatusIndex | null;
    expandFolders?: boolean;
}

export class LocalChangesTreeItem extends vscode.TreeItem {
    children?: LocalChangesTreeItem[];
    folderPath?: string;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'changelist' | 'file' | 'category' | 'folder',
        public readonly filePath?: string,
        public readonly changelistId?: string,
        public readonly staged?: boolean
    ) {
        super(label, collapsibleState);
        
        this.contextValue = type;
        if (type === 'file') {
            this.contextValue = staged ? 'file-staged' : 'file-unstaged';
        } else if (type === 'folder') {
            this.contextValue = 'folder';
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
            case 'folder':
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
        if (this.type === 'folder' && this.folderPath) {
            return this.folderPath;
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

        if (element.type === 'folder') {
            return element.children ?? [];
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

        const files = this.gitStatus.untracked
            .map(f => path.join(this.workspaceRoot, f))
            .filter(f => !this.changelistManager.getChangelistForFile(f));

        return this.buildFileTree(files, {
            statusIndex: this.buildStatusIndex(),
            expandFolders: true
        });
    }

    private getFilesInChangelist(changelistId: string): LocalChangesTreeItem[] {
        const changelist = this.changelistManager.getChangelist(changelistId);
        if (!changelist) {
            return [];
        }

        const stagedFiles = this.gitStatus
            ? new Set(this.gitStatus.staged.map(f => path.join(this.workspaceRoot, f)))
            : new Set<string>();

        const statusIndex = this.buildStatusIndex();

        return this.buildFileTree(changelist.files, {
            changelistId,
            stagedFiles,
            statusIndex
        });
    }

    private buildFileTree(files: string[], options: FileTreeOptions): LocalChangesTreeItem[] {
        if (!files || files.length === 0) {
            return [];
        }

        const root = new Map<string, TreeNode>();
        for (const filePath of files) {
            this.insertFileNode(root, filePath);
        }

        return this.convertTreeLevel(root, options);
    }

    private insertFileNode(level: Map<string, TreeNode>, filePath: string): void {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const segments = relativePath.split(/[\\/]/).filter(segment => segment.length > 0);

        if (segments.length === 0) {
            return;
        }

        let currentLevel = level;
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const isLeaf = i === segments.length - 1;

            if (isLeaf) {
                currentLevel.set(segment, {
                    type: 'file',
                    filePath
                } as FileNode);
            } else {
                let existing = currentLevel.get(segment) as FolderNode | undefined;
                if (!existing || existing.type !== 'folder') {
                    const folderPath = path.join(this.workspaceRoot, segments.slice(0, i + 1).join(path.sep));
                    existing = {
                        type: 'folder',
                        name: segment,
                        path: folderPath,
                        children: new Map()
                    };
                    currentLevel.set(segment, existing);
                }
                currentLevel = existing.children;
            }
        }
    }

    private convertTreeLevel(level: Map<string, TreeNode>, options: FileTreeOptions): LocalChangesTreeItem[] {
        const entries = Array.from(level.entries()).sort((a, b) => {
            const aIsFolder = a[1].type === 'folder';
            const bIsFolder = b[1].type === 'folder';
            if (aIsFolder !== bIsFolder) {
                return aIsFolder ? -1 : 1;
            }
            return a[0].localeCompare(b[0]);
        });

        const items: LocalChangesTreeItem[] = [];
        for (const [, node] of entries) {
            if (node.type === 'folder') {
                const childItems = this.convertTreeLevel(node.children, options);
                const folderItem = new LocalChangesTreeItem(
                    node.name,
                    options.expandFolders
                        ? vscode.TreeItemCollapsibleState.Expanded
                        : vscode.TreeItemCollapsibleState.Collapsed,
                    'folder',
                    undefined,
                    options.changelistId
                );
                folderItem.children = childItems;
                folderItem.folderPath = node.path;
                folderItem.tooltip = node.path;
                const fileCount = this.countDescendantFiles(childItems);
                folderItem.description = fileCount > 0 ? `${fileCount} file${fileCount !== 1 ? 's' : ''}` : undefined;
                items.push(folderItem);
            } else {
                items.push(this.createFileItem(node.filePath, options));
            }
        }
        return items;
    }

    private createFileItem(filePath: string, options: FileTreeOptions): LocalChangesTreeItem {
        const fileName = path.basename(filePath);
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const staged = options.stagedFiles?.has(filePath) ?? false;
        const statusInfo = this.describeFileStatus(relativePath, options.statusIndex);

        const label = statusInfo?.suffix
            ? `${fileName} (${statusInfo.suffix})`
            : fileName;

        const item = new LocalChangesTreeItem(
            label,
            vscode.TreeItemCollapsibleState.None,
            'file',
            filePath,
            options.changelistId,
            staged
        );

        if (staged) {
            item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        } else if (statusInfo?.icon) {
            item.iconPath = statusInfo.icon;
        }

        return item;
    }

    private describeFileStatus(relativePath: string, statusIndex?: StatusIndex | null): { suffix?: string; icon?: vscode.ThemeIcon } | undefined {
        if (!statusIndex) {
            return undefined;
        }

        const normalized = this.normalizeRelativePath(relativePath);
        if (statusIndex.untracked.has(normalized)) {
            return {
                suffix: 'Untracked',
                icon: new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('charts.yellow'))
            };
        }
        if (statusIndex.deleted.has(normalized)) {
            return {
                suffix: 'Deleted',
                icon: new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'))
            };
        }
        if (statusIndex.modified.has(normalized)) {
            return {
                suffix: 'Modified',
                icon: new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.blue'))
            };
        }

        const renamed = statusIndex.renamed.find(entry => entry.to === normalized || entry.from === normalized);
        if (renamed) {
            const fromLabel = renamed.from === normalized ? renamed.to : renamed.from;
            return {
                suffix: renamed.to === normalized ? `Renamed from ${fromLabel}` : 'Renamed',
                icon: new vscode.ThemeIcon('sync')
            };
        }

        return undefined;
    }

    private buildStatusIndex(): StatusIndex | null {
        if (!this.gitStatus) {
            return null;
        }

        return {
            modified: new Set(this.gitStatus.modified.map(rel => this.normalizeRelativePath(rel))),
            deleted: new Set(this.gitStatus.deleted.map(rel => this.normalizeRelativePath(rel))),
            untracked: new Set(this.gitStatus.untracked.map(rel => this.normalizeRelativePath(rel))),
            renamed: this.gitStatus.renamed.map(entry => ({
                from: this.normalizeRelativePath(entry.from),
                to: this.normalizeRelativePath(entry.to)
            }))
        };
    }

    private normalizeRelativePath(relativePath: string): string {
        return relativePath.replace(/\\/g, '/');
    }

    private countDescendantFiles(items: LocalChangesTreeItem[]): number {
        return items.reduce((count, item) => {
            if (item.type === 'file') {
                return count + 1;
            }
            if (item.children && item.children.length > 0) {
                return count + this.countDescendantFiles(item.children);
            }
            return count;
        }, 0);
    }

    getGitStatus(): GitStatus | null {
        return this.gitStatus;
    }
}


