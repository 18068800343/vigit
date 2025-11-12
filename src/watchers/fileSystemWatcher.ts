import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/gitService';
import { LocalChangesProvider } from '../providers/localChangesProvider';
import { ChangelistManager } from '../managers/changelistManager';

export class FileSystemWatcher implements vscode.Disposable {
    private fileWatcher: vscode.FileSystemWatcher;
    private gitService: GitService;
    private localChangesProvider: LocalChangesProvider;
    private changelistManager: ChangelistManager;
    private workspaceRoot: string;
    private refreshTimeout: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_DELAY = 500; // ms

    constructor(
        workspaceRoot: string,
        gitService: GitService,
        localChangesProvider: LocalChangesProvider,
        changelistManager: ChangelistManager
    ) {
        this.workspaceRoot = workspaceRoot;
        this.gitService = gitService;
        this.localChangesProvider = localChangesProvider;
        this.changelistManager = changelistManager;

        // Watch for file changes
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

        this.setupWatchers();
    }

    private setupWatchers(): void {
        // File created
        this.fileWatcher.onDidCreate(uri => {
            this.handleFileChange(uri, 'created');
        });

        // File changed
        this.fileWatcher.onDidChange(uri => {
            this.handleFileChange(uri, 'changed');
        });

        // File deleted
        this.fileWatcher.onDidDelete(uri => {
            this.handleFileChange(uri, 'deleted');
        });

        // Listen to git repository changes
        vscode.workspace.onDidSaveTextDocument(() => {
            this.scheduleRefresh();
        });
    }

    private handleFileChange(uri: vscode.Uri, type: 'created' | 'changed' | 'deleted'): void {
        const filePath = uri.fsPath;

        // Ignore changes in .git directory and node_modules
        if (filePath.includes('.git') || filePath.includes('node_modules')) {
            return;
        }

        // Check if auto-refresh is enabled
        const config = vscode.workspace.getConfiguration('vigit');
        const autoRefresh = config.get<boolean>('autoRefresh', true);
        const autoStage = config.get<boolean>('autoStage', false);

        if (autoRefresh) {
            this.scheduleRefresh();
        }

        // Auto-add new files to active changelist
        if (type === 'created') {
            const activeChangelist = this.changelistManager.getActiveChangelist();
            if (activeChangelist) {
                const added = this.changelistManager.addFileToChangelist(filePath, activeChangelist.id);
                if (added && autoStage) {
                    this.gitService.stageFile(filePath).catch(error => {
                        console.error('Auto-stage failed:', error);
                    });
                }
            }
        }

        // Remove deleted files from changelists
        if (type === 'deleted') {
            const changelist = this.changelistManager.getChangelistForFile(filePath);
            if (changelist) {
                this.changelistManager.removeFileFromChangelist(filePath, changelist.id);
            }
        }
    }

    private scheduleRefresh(): void {
        // Debounce refresh to avoid too many updates
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }

        this.refreshTimeout = setTimeout(() => {
            this.localChangesProvider.refresh();
            this.refreshTimeout = null;
        }, this.DEBOUNCE_DELAY);
    }

    dispose(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.fileWatcher.dispose();
    }
}


