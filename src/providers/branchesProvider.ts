import * as vscode from 'vscode';
import { GitService, GitBranch } from '../services/gitService';

export class BranchTreeItem extends vscode.TreeItem {
    constructor(
        public label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly branch?: GitBranch,
        public readonly isCategory: boolean = false,
        public readonly categoryType?: 'local' | 'remote',
        public readonly remoteName?: string,
        private readonly padding: string = ''
    ) {
        const displayLabel = padding ? `${padding}${label}` : label;
        super(displayLabel, collapsibleState);
        this.label = displayLabel;
        
        if (branch) {
            this.contextValue = branch.remote ? 'branchRemote' : 'branchLocal';
            this.tooltip = this.createTooltip();
            this.iconPath = this.getIcon();
            this.command = {
                command: 'vigit.showBranchDetails',
                title: 'Show Branch History',
                arguments: [branch]
            };
        } else if (isCategory) {
            this.contextValue = 'category';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }

    private createTooltip(): string {
        if (!this.branch) {
            return '';
        }

        const lines: string[] = [
            `Branch: ${this.branch.name}`,
            `Commit: ${this.branch.commit}`,
            this.branch.remote ? 'Remote branch' : 'Local branch'
        ];

        if (this.branch.current) {
            lines.push('Current branch');
        }
        if (this.branch.upstream) {
            lines.push(`Upstream: ${this.branch.upstream}`);
        }
        if (typeof this.branch.ahead === 'number' || typeof this.branch.behind === 'number') {
            const ahead = this.branch.ahead ?? 0;
            const behind = this.branch.behind ?? 0;
            if (ahead > 0 || behind > 0) {
                lines.push(`Ahead/Behind: ${ahead}/${behind}`);
            }
        }

        return lines.filter(Boolean).join('\n');
    }

    private getIcon(): vscode.ThemeIcon {
        if (!this.branch) {
            return new vscode.ThemeIcon('git-branch');
        }

        if (this.branch.current) {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        } else if (this.branch.remote) {
            return new vscode.ThemeIcon('cloud');
        } else {
            return new vscode.ThemeIcon('git-branch');
        }
    }
}

export class BranchesProvider implements vscode.TreeDataProvider<BranchTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BranchTreeItem | undefined | null> = 
        new vscode.EventEmitter<BranchTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<BranchTreeItem | undefined | null> = 
        this._onDidChangeTreeData.event;

    private branches: GitBranch[] = [];
    private workspaceRoot: string;
    private gitService: GitService;
    private readonly childIconPadding = '   ';
    constructor(workspaceRoot: string, gitService: GitService) {
        this.workspaceRoot = workspaceRoot;
        this.gitService = gitService;
        this.refresh();
    }

    async refresh(): Promise<void> {
        try {
            this.branches = await this.gitService.getBranches();
            this._onDidChangeTreeData.fire(undefined);
        } catch (error) {
            console.error('Error refreshing branches:', error);
        }
    }

    getTreeItem(element: BranchTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BranchTreeItem): Promise<BranchTreeItem[]> {
        if (element) {
            if (element.isCategory) {
                if (element.categoryType === 'local') {
                    const branches = this.branches
                        .filter(b => !b.remote)
                        .sort((a, b) => {
                            if (a.current !== b.current) {
                                return a.current ? -1 : 1;
                            }
                            return a.name.localeCompare(b.name);
                        });

                    return branches.map(branch => {
                        const tracking = this.formatTracking(branch);
                        const labelCore = branch.current
                            ? `${branch.name} (current)`
                            : branch.name;
                        const label = tracking ? `${labelCore} ${tracking}` : labelCore;

                        return new BranchTreeItem(
                            label,
                            vscode.TreeItemCollapsibleState.None,
                            branch,
                            false,
                            undefined,
                            undefined,
                            this.childIconPadding
                        );
                    });
                }

                if (element.categoryType === 'remote' && !element.remoteName) {
                    const remotes = this.getRemoteGroups();
                    return remotes.map(remote => new BranchTreeItem(
                        remote,
                        vscode.TreeItemCollapsibleState.Expanded,
                        undefined,
                        true,
                        'remote',
                        remote,
                        this.childIconPadding
                    ));
                }

                if (element.categoryType === 'remote' && element.remoteName) {
                    const branches = this.branches
                        .filter(b => b.remote)
                        .filter(b => this.getRemoteName(b.name) === element.remoteName)
                        .sort((a, b) => {
                            const aShort = this.getRemoteBranchName(a.name);
                            const bShort = this.getRemoteBranchName(b.name);
                            return aShort.localeCompare(bShort);
                        });

                    return branches.map(branch => {
                        const displayName = this.getRemoteBranchName(branch.name);
                        return new BranchTreeItem(
                            displayName,
                            vscode.TreeItemCollapsibleState.None,
                            branch,
                            false,
                            undefined,
                            undefined,
                            this.childIconPadding
                        );
                    });
                }
            }
            return [];
        }

        // Root level - show categories
        const localBranches = this.branches.filter(b => !b.remote);
        const remoteBranches = this.branches.filter(b => b.remote);

        const items: BranchTreeItem[] = [];

        if (localBranches.length > 0) {
            items.push(new BranchTreeItem(
                `Local Branches (${localBranches.length})`,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                true,
                'local'
            ));
        }

        if (remoteBranches.length > 0) {
            items.push(new BranchTreeItem(
                `Remote Branches (${remoteBranches.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                true,
                'remote'
            ));
        }

        return items;
    }

    getBranches(): GitBranch[] {
        return this.branches;
    }

    private formatTracking(branch: GitBranch): string {
        if (branch.remote) {
            return '';
        }

        const parts: string[] = [];
        if (branch.ahead && branch.ahead > 0) {
            parts.push(`+${branch.ahead}`);
        }
        if (branch.behind && branch.behind > 0) {
            parts.push(`-${branch.behind}`);
        }

        return parts.length > 0 ? `[${parts.join(' ')}]` : '';
    }

    private getRemoteName(fullName: string): string {
        const stripped = fullName.replace(/^remotes\//, '');
        const index = stripped.indexOf('/');
        return index === -1 ? stripped : stripped.slice(0, index);
    }

    private getRemoteBranchName(fullName: string): string {
        const stripped = fullName.replace(/^remotes\//, '');
        const index = stripped.indexOf('/');
        return index === -1 ? stripped : stripped.slice(index + 1);
    }

    private getRemoteGroups(): string[] {
        const set = new Set<string>();
        this.branches.forEach(branch => {
            if (branch.remote) {
                set.add(this.getRemoteName(branch.name));
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }

}


