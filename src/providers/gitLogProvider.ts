import * as vscode from 'vscode';
import { GitService, GitCommit } from '../services/gitService';

export class GitLogTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly commit?: GitCommit
    ) {
        super(label, collapsibleState);
        
        if (commit) {
            this.contextValue = 'commit';
            this.tooltip = this.createTooltip();
            this.description = this.createDescription();
            this.iconPath = new vscode.ThemeIcon('git-commit');
            
            this.command = {
                command: 'vigit.showCommitDetails',
                title: 'Show Commit Details',
                arguments: [commit]
            };
        }
    }

    private createTooltip(): string {
        if (!this.commit) {
            return '';
        }

        return [
            `Commit: ${this.commit.hash}`,
            `Author: ${this.commit.author} <${this.commit.email}>`,
            `Date: ${this.commit.date.toLocaleString()}`,
            '',
            this.commit.message
        ].join('\n');
    }

    private createDescription(): string {
        if (!this.commit) {
            return '';
        }

        const author = this.commit.author;
        const date = this.formatDate(this.commit.date);
        const refs = this.commit.refs.length > 0 ? ` (${this.commit.refs.join(', ')})` : '';
        
        return `${author} · ${date}${refs}`;
    }

    private formatDate(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            return 'Today';
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return `${days} days ago`;
        } else if (days < 30) {
            return `${Math.floor(days / 7)} weeks ago`;
        } else if (days < 365) {
            return `${Math.floor(days / 30)} months ago`;
        } else {
            return `${Math.floor(days / 365)} years ago`;
        }
    }
}

export class GitLogProvider implements vscode.TreeDataProvider<GitLogTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<GitLogTreeItem | undefined | null> = 
        new vscode.EventEmitter<GitLogTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<GitLogTreeItem | undefined | null> = 
        this._onDidChangeTreeData.event;

    private commits: GitCommit[] = [];
    private workspaceRoot: string;
    private gitService: GitService;

    constructor(workspaceRoot: string, gitService: GitService) {
        this.workspaceRoot = workspaceRoot;
        this.gitService = gitService;
        this.refresh();
    }

    async refresh(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('vigit');
            const logLimit = config.get<number>('logLimit', 100);
            const showGraph = config.get<boolean>('logGraph', true);

            this.commits = await this.gitService.getLog(logLimit, showGraph);
            this._onDidChangeTreeData.fire(undefined);
        } catch (error) {
            console.error('Error refreshing git log:', error);
            vscode.window.showErrorMessage(`Failed to load git log: ${error}`);
        }
    }

    getTreeItem(element: GitLogTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: GitLogTreeItem): Promise<GitLogTreeItem[]> {
        if (element) {
            return [];
        }

        // Root level - show commits
        return this.commits.map(commit => {
            const label = commit.graph
                ? `${commit.graph} ${commit.abbrevHash} ${commit.message}`
                : `${commit.abbrevHash} - ${commit.message}`;
            return new GitLogTreeItem(
                label,
                vscode.TreeItemCollapsibleState.None,
                commit
            );
        });
    }

    getCommits(): GitCommit[] {
        return this.commits;
    }
}


