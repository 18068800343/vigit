import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { CommitFileChange, GitService } from '../services/gitService';

export class DiffViewHelper {
    static async showDiff(
        gitService: GitService,
        filePath: string,
        staged: boolean = false,
        options?: { viewColumn?: vscode.ViewColumn; preview?: boolean }
    ): Promise<void> {
        try {
            await DiffViewHelper.ensureDiffEditorConfig();
            const fileName = path.basename(filePath);
            const workspaceRoot = gitService.getWorkspaceRoot();
            const relativePath = path.relative(workspaceRoot, filePath);

            // Get the original content
            let originalContent: string;
            let originalTitle: string;

            if (staged) {
                // Compare staged with HEAD
                originalContent = await gitService.getFileContent(filePath, 'HEAD');
                originalTitle = `${fileName} (HEAD)`;
            } else {
                // Check if file is staged
                const status = await gitService.getStatus();
                const isStaged = status.staged.includes(relativePath);

                if (isStaged) {
                    // Compare working directory with index
                    originalContent = await gitService.getFileContent(filePath, ':0');
                    originalTitle = `${fileName} (Index)`;
                } else {
                    // Compare working directory with HEAD
                    originalContent = await gitService.getFileContent(filePath, 'HEAD');
                    originalTitle = `${fileName} (HEAD)`;
                }
            }

            // Create temporary document for original content
            const originalUri = vscode.Uri.parse(
                `vigit-diff:${filePath}?ref=${staged ? 'HEAD' : 'INDEX'}`
            ).with({
                scheme: 'vigit-original'
            });

            // Register text document content provider
            const provider = new DiffContentProvider(originalContent);
            const registration = vscode.workspace.registerTextDocumentContentProvider(
                'vigit-original',
                provider
            );

            // Current file URI
            const currentUri = vscode.Uri.file(filePath);

            // Open diff view
            await vscode.commands.executeCommand(
                'vscode.diff',
                originalUri,
                currentUri,
                `${originalTitle} ↔ ${fileName} (Working Directory)`,
                {
                    preview: options?.preview ?? true,
                    viewColumn: options?.viewColumn ?? vscode.ViewColumn.Active
                }
            );

            // Dispose provider after a delay
            setTimeout(() => registration.dispose(), 100);
        } catch (error) {
            console.error('Error showing diff:', error);
            throw error;
        }
    }

    static async showCommitDiff(
        gitService: GitService,
        commitHash: string,
        filePath?: string
    ): Promise<void> {
        try {
            const diff = filePath
                ? await gitService.compareWithBranch(commitHash, filePath)
                : await gitService.getCommitDiff(commitHash);

            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });

            await vscode.window.showTextDocument(doc, {
                preview: false,
                viewColumn: vscode.ViewColumn.Active
            });
        } catch (error) {
            console.error('Error showing commit diff:', error);
            throw error;
        }
    }

    static async showCommitFileDiff(
        gitService: GitService,
        commitHash: string,
        parentHash: string | undefined,
        change: CommitFileChange
    ): Promise<void> {
        await DiffViewHelper.ensureDiffEditorConfig();
        const statusCode = change.status.charAt(0);
        const workspaceRoot = gitService.getWorkspaceRoot();
        const normalizedChangePath = change.path.replace(/\\/g, '/');
        const normalizedPreviousPath = (change.previousPath ?? change.path).replace(/\\/g, '/');
        const currentFsPath = path.join(workspaceRoot, change.path);
        const previousFsPath = path.join(
            workspaceRoot,
            change.previousPath ?? change.path
        );

        const workspaceFileExists = await DiffViewHelper.fileExists(currentFsPath);

        // Prefer comparing against the workspace copy so the user sees local impact immediately
        if (workspaceFileExists) {
            const commitRef = statusCode === 'D' ? parentHash : commitHash;
            const commitPath = statusCode === 'D' ? previousFsPath : currentFsPath;
            const commitContent = commitRef
                ? await gitService.getFileContent(commitPath, commitRef)
                : '';

            const commitScheme = `vigit-commit-${Date.now()}`;
            const commitUri = vscode.Uri.from({
                scheme: commitScheme,
                path: `/${statusCode === 'D' ? normalizedPreviousPath : normalizedChangePath}`
            });
            const commitProvider = new DiffContentProvider(commitContent);
            const commitRegistration = vscode.workspace.registerTextDocumentContentProvider(
                commitScheme,
                commitProvider
            );

            try {
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    commitUri,
                    vscode.Uri.file(currentFsPath),
                    `${path.basename(change.path)} (${commitHash.substring(0, 7)} -> Working Tree)`,
                    { preview: false, viewColumn: vscode.ViewColumn.Active }
                );
            } finally {
                setTimeout(() => commitRegistration.dispose(), 100);
            }
            return;
        }

        // Fall back to the original intra-commit diff (parent vs commit) if the workspace file is missing
        let leftContent = '';
        let rightContent = '';

        if (statusCode !== 'A' && parentHash) {
            leftContent = await gitService.getFileContent(previousFsPath, parentHash);
        }

        if (statusCode !== 'D') {
            rightContent = await gitService.getFileContent(currentFsPath, commitHash);
        }

        const leftLabel = statusCode === 'A'
            ? `${path.basename(change.path)} (before)`
            : `${path.basename(change.previousPath ?? change.path)} (${parentHash?.substring(0, 7) ?? 'no-parent'})`;
        const rightLabel = statusCode === 'D'
            ? `${path.basename(change.path)} (after removed)`
            : `${path.basename(change.path)} (${commitHash.substring(0, 7)})`;

        const leftScheme = `vigit-commit-left-${Date.now()}`;
        const rightScheme = `vigit-commit-right-${Date.now()}`;

        const leftUri = vscode.Uri.from({
            scheme: leftScheme,
            path: `/${statusCode === 'A' ? normalizedChangePath : normalizedPreviousPath}`
        });
        const rightUri = vscode.Uri.from({
            scheme: rightScheme,
            path: `/${normalizedChangePath}`
        });

        const leftProvider = new DiffContentProvider(leftContent);
        const rightProvider = new DiffContentProvider(rightContent);

        const leftRegistration = vscode.workspace.registerTextDocumentContentProvider(leftScheme, leftProvider);
        const rightRegistration = vscode.workspace.registerTextDocumentContentProvider(rightScheme, rightProvider);

        try {
            await vscode.commands.executeCommand(
                'vscode.diff',
                leftUri,
                rightUri,
                `${path.basename(change.path)} (${commitHash.substring(0, 7)})`,
                { preview: false, viewColumn: vscode.ViewColumn.Active }
            );
        } finally {
            setTimeout(() => {
                leftRegistration.dispose();
                rightRegistration.dispose();
            }, 100);
        }
    }

    static async showBranchDiff(
        gitService: GitService,
        branchName: string,
        filePath?: string
    ): Promise<void> {
        try {
            const diff = await gitService.compareWithBranch(branchName, filePath);

            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });

            const title = filePath
                ? `${path.basename(filePath)} - Diff with ${branchName}`
                : `Diff with ${branchName}`;

            await vscode.window.showTextDocument(doc, {
                preview: false,
                viewColumn: vscode.ViewColumn.Active
            });
        } catch (error) {
            console.error('Error showing branch diff:', error);
            throw error;
        }
    }

    private static async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private static async ensureDiffEditorConfig(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('diffEditor');
            const updates: Thenable<void>[] = [];
            const ensure = (key: string, value: boolean) => {
                if (config.get<boolean>(key) !== value) {
                    updates.push(config.update(key, value, vscode.ConfigurationTarget.Workspace));
                }
            };

            ensure('renderIndicators', true);
            ensure('renderMarginRevertIcon', true);
            ensure('showMoves', true);
            ensure('renderSideBySide', true);

            if (updates.length > 0) {
                await Promise.all(updates);
            }
        } catch (error) {
            console.warn('Unable to update diff editor settings', error);
        }
    }
}

class DiffContentProvider implements vscode.TextDocumentContentProvider {
    private content: string;

    constructor(content: string) {
        this.content = content;
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.content;
    }
}


