import * as vscode from 'vscode';
import { GitService, GitStashEntry } from '../services/gitService';

export class StashTreeItem extends vscode.TreeItem {
    constructor(
        public readonly stash: GitStashEntry
    ) {
        super(stash.hash, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'stash';

        const descriptionParts: string[] = [];
        if (stash.branch) {
            descriptionParts.push(stash.branch);
        }
        descriptionParts.push(stash.message);

        this.description = descriptionParts.join(' · ');
        this.tooltip = this.createTooltip();
        this.iconPath = new vscode.ThemeIcon('archive');
    }

    private createTooltip(): string {
        const lines = [
            `Stash: ${this.stash.hash}`,
            `Date: ${this.stash.date.toLocaleString()}`
        ];
        if (this.stash.branch) {
            lines.push(`Branch: ${this.stash.branch}`);
        }
        if (this.stash.message) {
            lines.push('', this.stash.message);
        }
        return lines.join('\n');
    }
}

export class StashProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null> =
        new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null> =
        this._onDidChangeTreeData.event;

    private gitService: GitService;
    private stashes: GitStashEntry[] = [];

    constructor(gitService: GitService) {
        this.gitService = gitService;
    }

    async refresh(): Promise<void> {
        try {
            this.stashes = await this.gitService.getStashList();
            this._onDidChangeTreeData.fire(undefined);
        } catch (error) {
            console.error('Error loading stash list:', error);
            vscode.window.showErrorMessage(`Failed to load stash list: ${error}`);
        }
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            return [];
        }

        if (this.stashes.length === 0) {
            const item = new vscode.TreeItem('No stashes', vscode.TreeItemCollapsibleState.None);
            item.contextValue = 'stash-empty';
            item.iconPath = new vscode.ThemeIcon('inbox');
            return [item];
        }

        return this.stashes.map(stash => new StashTreeItem(stash));
    }
}
