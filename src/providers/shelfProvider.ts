import * as vscode from 'vscode';
import { ShelfManager, ShelvedChange } from '../managers/shelfManager';

export class ShelfTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly shelvedChange?: ShelvedChange
    ) {
        super(label, collapsibleState);
        
        if (shelvedChange) {
            this.contextValue = 'shelf';
            this.tooltip = this.createTooltip();
            this.description = this.createDescription();
            this.iconPath = new vscode.ThemeIcon('archive');
        }
    }

    private createTooltip(): string {
        if (!this.shelvedChange) {
            return '';
        }

        const lines = [
            `Name: ${this.shelvedChange.name}`,
            `Date: ${this.shelvedChange.date.toLocaleString()}`,
            `Files: ${this.shelvedChange.files.length}`
        ];

        if (this.shelvedChange.description) {
            lines.push('', this.shelvedChange.description);
        }

        return lines.join('\n');
    }

    private createDescription(): string {
        if (!this.shelvedChange) {
            return '';
        }

        const date = this.formatDate(this.shelvedChange.date);
        const fileCount = this.shelvedChange.files.length;
        
        return `${date} · ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
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
        } else {
            return date.toLocaleDateString();
        }
    }
}

export class ShelfProvider implements vscode.TreeDataProvider<ShelfTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ShelfTreeItem | undefined | null> = 
        new vscode.EventEmitter<ShelfTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<ShelfTreeItem | undefined | null> = 
        this._onDidChangeTreeData.event;

    private shelfManager: ShelfManager;

    constructor(shelfManager: ShelfManager) {
        this.shelfManager = shelfManager;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: ShelfTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ShelfTreeItem): Promise<ShelfTreeItem[]> {
        if (element) {
            return [];
        }

        // Root level - show shelved changes
        const shelvedChanges = this.shelfManager.getShelvedChanges();
        
        if (shelvedChanges.length === 0) {
            const emptyItem = new ShelfTreeItem(
                'No shelved changes',
                vscode.TreeItemCollapsibleState.None
            );
            emptyItem.contextValue = 'empty';
            return [emptyItem];
        }

        return shelvedChanges.map(sc => {
            return new ShelfTreeItem(
                sc.name,
                vscode.TreeItemCollapsibleState.None,
                sc
            );
        });
    }
}


