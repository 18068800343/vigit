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
            
            if (!branch.remote) {
                this.command = {
                    command: 'vigit.checkoutBranch',
                    title: 'Checkout Branch',
                    arguments: [branch.name]
                };
            }
        } else if (isCategory) {
            this.contextValue = 'category';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }

    private createTooltip(): string {
        if (!this.branch) {
            return '';
        }

        return [
            `Branch: ${this.branch.name}`,
            `Commit: ${this.branch.commit}`,
            this.branch.current ? 'Current branch' : '',
            this.branch.remote ? 'Remote branch' : 'Local branch'
        ].filter(s => s).join('\n');
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
                    
                    const label = branch.current 
                        ? `${displayName} (current)`
                        : displayName;

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
}


