import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GitService } from '../services/gitService';

export interface ShelvedChange {
    id: string;
    name: string;
    description?: string;
    date: Date;
    files: string[];
    patch: string;
}

export class ShelfManager {
    private shelvedChanges: Map<string, ShelvedChange>;
    private context: vscode.ExtensionContext;
    private workspaceRoot: string;
    private gitService: GitService;
    private readonly STORAGE_KEY = 'vigit.shelvedChanges';
    private readonly SHELF_DIR = '.vigit-shelf';

    constructor(context: vscode.ExtensionContext, workspaceRoot: string, gitService: GitService) {
        this.context = context;
        this.workspaceRoot = workspaceRoot;
        this.gitService = gitService;
        this.shelvedChanges = new Map();
        this.initializeShelfDirectory();
        this.loadShelvedChanges();
    }

    private initializeShelfDirectory(): void {
        const shelfDir = path.join(this.workspaceRoot, this.SHELF_DIR);
        if (!fs.existsSync(shelfDir)) {
            fs.mkdirSync(shelfDir, { recursive: true });
        }
    }

    private loadShelvedChanges(): void {
        const stored = this.context.workspaceState.get<ShelvedChange[]>(this.STORAGE_KEY, []);
        stored.forEach(sc => {
            // Convert date string back to Date object
            sc.date = new Date(sc.date);
            this.shelvedChanges.set(sc.id, sc);
        });
    }

    private saveShelvedChanges(): void {
        const changesArray = Array.from(this.shelvedChanges.values());
        this.context.workspaceState.update(this.STORAGE_KEY, changesArray);
    }

    private generateId(): string {
        return `shelf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private getShelfFilePath(id: string): string {
        return path.join(this.workspaceRoot, this.SHELF_DIR, `${id}.patch`);
    }

    async shelveChanges(name: string, files: string[], description?: string): Promise<ShelvedChange> {
        try {
            // Generate patches for the files
            const patches: string[] = [];
            
            for (const file of files) {
                const diff = await this.gitService.getDiff(file, false);
                if (diff) {
                    patches.push(diff);
                }
            }

            const combinedPatch = patches.join('\n');
            const id = this.generateId();
            const shelfFilePath = this.getShelfFilePath(id);

            // Save patch to file
            fs.writeFileSync(shelfFilePath, combinedPatch, 'utf8');

            const shelvedChange: ShelvedChange = {
                id,
                name,
                description,
                date: new Date(),
                files: [...files],
                patch: combinedPatch
            };

            this.shelvedChanges.set(id, shelvedChange);
            this.saveShelvedChanges();

            // Revert the changes in working directory
            for (const file of files) {
                try {
                    await this.gitService.revertFile(file);
                } catch (error) {
                    console.error(`Error reverting file ${file}:`, error);
                }
            }

            return shelvedChange;
        } catch (error) {
            throw new Error(`Failed to shelve changes: ${error}`);
        }
    }

    async unshelveChanges(id: string, removeAfterApply: boolean = false): Promise<void> {
        const shelvedChange = this.shelvedChanges.get(id);
        if (!shelvedChange) {
            throw new Error('Shelved change not found');
        }

        try {
            const shelfFilePath = this.getShelfFilePath(id);
            
            if (!fs.existsSync(shelfFilePath)) {
                throw new Error('Shelf file not found');
            }

            // Apply the patch
            const patch = fs.readFileSync(shelfFilePath, 'utf8');
            
            // Write patch to temp file and apply
            const tempPatchFile = path.join(this.workspaceRoot, '.vigit-temp.patch');
            fs.writeFileSync(tempPatchFile, patch, 'utf8');

            try {
                // Apply patch using git apply
                const { exec } = require('child_process');
                await new Promise<void>((resolve, reject) => {
                    exec(`git apply "${tempPatchFile}"`, { cwd: this.workspaceRoot }, (error: any) => {
                        if (error) {
                            reject(new Error(`Failed to apply patch: ${error.message}`));
                        } else {
                            resolve();
                        }
                    });
                });
            } finally {
                // Clean up temp file
                if (fs.existsSync(tempPatchFile)) {
                    fs.unlinkSync(tempPatchFile);
                }
            }

            if (removeAfterApply) {
                await this.deleteShelvedChange(id);
            }

            vscode.window.showInformationMessage(`Unshelved: ${shelvedChange.name}`);
        } catch (error) {
            throw new Error(`Failed to unshelve changes: ${error}`);
        }
    }

    async deleteShelvedChange(id: string): Promise<boolean> {
        const shelvedChange = this.shelvedChanges.get(id);
        if (!shelvedChange) {
            return false;
        }

        // Delete shelf file
        const shelfFilePath = this.getShelfFilePath(id);
        if (fs.existsSync(shelfFilePath)) {
            fs.unlinkSync(shelfFilePath);
        }

        this.shelvedChanges.delete(id);
        this.saveShelvedChanges();
        return true;
    }

    getShelvedChanges(): ShelvedChange[] {
        return Array.from(this.shelvedChanges.values()).sort((a, b) => 
            b.date.getTime() - a.date.getTime()
        );
    }

    getShelvedChange(id: string): ShelvedChange | undefined {
        return this.shelvedChanges.get(id);
    }

    async exportShelf(id: string, targetPath: string): Promise<void> {
        const shelvedChange = this.shelvedChanges.get(id);
        if (!shelvedChange) {
            throw new Error('Shelved change not found');
        }

        const shelfFilePath = this.getShelfFilePath(id);
        if (!fs.existsSync(shelfFilePath)) {
            throw new Error('Shelf file not found');
        }

        fs.copyFileSync(shelfFilePath, targetPath);
    }

    async importShelf(sourcePath: string, name: string, description?: string): Promise<ShelvedChange> {
        if (!fs.existsSync(sourcePath)) {
            throw new Error('Source file not found');
        }

        const patch = fs.readFileSync(sourcePath, 'utf8');
        const id = this.generateId();
        const shelfFilePath = this.getShelfFilePath(id);

        fs.writeFileSync(shelfFilePath, patch, 'utf8');

        const shelvedChange: ShelvedChange = {
            id,
            name,
            description,
            date: new Date(),
            files: [],
            patch
        };

        this.shelvedChanges.set(id, shelvedChange);
        this.saveShelvedChanges();

        return shelvedChange;
    }
}


