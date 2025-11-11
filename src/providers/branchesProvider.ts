import * as vscode from 'vscode';
import { GitService, GitBranch } from '../services/gitService';

export class BranchTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly branch?: GitBranch,
        public readonly isCategory: boolean = false
    ) {
        super(label, collapsibleState);
        
        if (branch) {
            this.contextValue = 'branch';
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
                // Show branches in this category
                const isLocal = element.label === 'Local Branches';
                const branches = this.branches.filter(b => 
                    isLocal ? !b.remote : b.remote
                );
                
                return branches.map(branch => {
                    const displayName = branch.remote 
                        ? branch.name.replace('remotes/', '')
                        : branch.name;
                    
                    const tracking = this.formatTracking(branch);
                    const labelCore = branch.current 
                        ? `${displayName} (current)`
                        : displayName;
                    const label = tracking ? `${labelCore} ${tracking}` : labelCore;

                    return new BranchTreeItem(
                        label,
                        vscode.TreeItemCollapsibleState.None,
                        branch
                    );
                });
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
                true
            ));
        }

        if (remoteBranches.length > 0) {
            items.push(new BranchTreeItem(
                `Remote Branches (${remoteBranches.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                true
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
}


