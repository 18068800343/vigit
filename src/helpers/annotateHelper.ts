import * as vscode from 'vscode';
import { GitService } from '../services/gitService';

interface BlameInfo {
    line: number;
    hash: string;
    author: string;
    date: string;
    message: string;
}

export class AnnotateHelper {
    private static decorationType: vscode.TextEditorDecorationType | null = null;
    private static isAnnotating: boolean = false;

    static async showAnnotations(
        gitService: GitService,
        editor: vscode.TextEditor
    ): Promise<void> {
        const filePath = editor.document.uri.fsPath;

        if (this.isAnnotating) {
            // Toggle off
            this.clearAnnotations();
            return;
        }

        try {
            const blameOutput = await gitService.getBlame(filePath);
            const blameInfo = this.parseBlameOutput(blameOutput);

            this.decorationType = vscode.window.createTextEditorDecorationType({
                isWholeLine: false,
                before: {
                    margin: '0 1em 0 0',
                    color: new vscode.ThemeColor('editorLineNumber.foreground')
                }
            });

            const decorations: vscode.DecorationOptions[] = [];

            for (const info of blameInfo) {
                const line = editor.document.lineAt(info.line);
                const decoration: vscode.DecorationOptions = {
                    range: new vscode.Range(info.line, 0, info.line, 0),
                    renderOptions: {
                        before: {
                            contentText: this.formatBlameInfo(info),
                            color: new vscode.ThemeColor('editorLineNumber.foreground')
                        }
                    },
                    hoverMessage: this.createHoverMessage(info)
                };

                decorations.push(decoration);
            }

            editor.setDecorations(this.decorationType, decorations);
            this.isAnnotating = true;

            // Auto-clear when editor changes
            const disposable = vscode.window.onDidChangeActiveTextEditor(() => {
                this.clearAnnotations();
                disposable.dispose();
            });
        } catch (error) {
            throw new Error(`Failed to get blame information: ${error}`);
        }
    }

    private static parseBlameOutput(output: string): BlameInfo[] {
        const lines = output.split('\n');
        const blameInfo: BlameInfo[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) {
                continue;
            }

            // Git blame format: hash (author date lineNumber) content
            const match = line.match(/^([0-9a-f]+)\s+\((.*?)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\s+(\d+)\)/);
            
            if (match) {
                const [, hash, author, date, lineNum] = match;
                blameInfo.push({
                    line: parseInt(lineNum) - 1, // Convert to 0-based
                    hash: hash.substring(0, 8),
                    author: author.trim(),
                    date: this.formatDate(date),
                    message: ''
                });
            }
        }

        return blameInfo;
    }

    private static formatBlameInfo(info: BlameInfo): string {
        const author = info.author.length > 15 
            ? info.author.substring(0, 12) + '...'
            : info.author.padEnd(15);
        
        return `${info.hash} ${author} ${info.date}`;
    }

    private static createHoverMessage(info: BlameInfo): vscode.MarkdownString {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**Commit:** \`${info.hash}\`\n\n`);
        markdown.appendMarkdown(`**Author:** ${info.author}\n\n`);
        markdown.appendMarkdown(`**Date:** ${info.date}\n\n`);
        return markdown;
    }

    private static formatDate(dateStr: string): string {
        try {
            const date = new Date(dateStr);
            return date.toISOString().split('T')[0]; // YYYY-MM-DD
        } catch {
            return dateStr.substring(0, 10);
        }
    }

    static clearAnnotations(): void {
        if (this.decorationType) {
            this.decorationType.dispose();
            this.decorationType = null;
        }
        this.isAnnotating = false;
    }
}


