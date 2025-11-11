import * as vscode from 'vscode';
import * as path from 'path';

export interface Changelist {
    id: string;
    name: string;
    files: string[];
    active: boolean;
    description?: string;
}

export class ChangelistManager {
    private changelists: Map<string, Changelist>;
    private context: vscode.ExtensionContext;
    private workspaceRoot: string;
    private readonly STORAGE_KEY = 'vigit.changelists';
    private readonly ACTIVE_CHANGELIST_KEY = 'vigit.activeChangelist';

    constructor(context: vscode.ExtensionContext, workspaceRoot: string) {
        this.context = context;
        this.workspaceRoot = workspaceRoot;
        this.changelists = new Map();
        this.loadChangelists();
    }

    private loadChangelists(): void {
        const config = vscode.workspace.getConfiguration('vigit');
        const defaultChangelistName = config.get<string>('defaultChangelist', 'Default');
        
        const stored = this.context.workspaceState.get<Changelist[]>(this.STORAGE_KEY, []);
        
        if (stored.length === 0) {
            // Create default changelist
            const defaultChangelist: Changelist = {
                id: this.generateId(),
                name: defaultChangelistName,
                files: [],
                active: true
            };
            this.changelists.set(defaultChangelist.id, defaultChangelist);
        } else {
            stored.forEach(cl => this.changelists.set(cl.id, cl));
        }

        this.saveChangelists();
    }

    private saveChangelists(): void {
        const changelistsArray = Array.from(this.changelists.values());
        this.context.workspaceState.update(this.STORAGE_KEY, changelistsArray);
    }

    private generateId(): string {
        return `cl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    getChangelists(): Changelist[] {
        return Array.from(this.changelists.values());
    }

    getChangelist(id: string): Changelist | undefined {
        return this.changelists.get(id);
    }

    getActiveChangelist(): Changelist {
        const active = Array.from(this.changelists.values()).find(cl => cl.active);
        if (active) {
            return active;
        }
        
        // If no active changelist, make the first one active
        const first = Array.from(this.changelists.values())[0];
        if (first) {
            first.active = true;
            this.saveChangelists();
            return first;
        }
        
        // Create default changelist if none exist
        const config = vscode.workspace.getConfiguration('vigit');
        const defaultChangelistName = config.get<string>('defaultChangelist', 'Default');
        const defaultChangelist: Changelist = {
            id: this.generateId(),
            name: defaultChangelistName,
            files: [],
            active: true
        };
        this.changelists.set(defaultChangelist.id, defaultChangelist);
        this.saveChangelists();
        return defaultChangelist;
    }

    createChangelist(name: string, description?: string): Changelist {
        const changelist: Changelist = {
            id: this.generateId(),
            name,
            files: [],
            active: false,
            description
        };
        this.changelists.set(changelist.id, changelist);
        this.saveChangelists();
        return changelist;
    }

    deleteChangelist(id: string): boolean {
        const changelist = this.changelists.get(id);
        if (!changelist) {
            return false;
        }

        // Don't allow deleting the last changelist
        if (this.changelists.size <= 1) {
            vscode.window.showWarningMessage('Cannot delete the last changelist');
            return false;
        }

        // If deleting active changelist, make another one active
        if (changelist.active) {
            const other = Array.from(this.changelists.values()).find(cl => cl.id !== id);
            if (other) {
                other.active = true;
            }
        }

        // Move files to active changelist
        const active = this.getActiveChangelist();
        if (active && active.id !== id) {
            changelist.files.forEach(file => {
                if (!active.files.includes(file)) {
                    active.files.push(file);
                }
            });
        }

        this.changelists.delete(id);
        this.saveChangelists();
        return true;
    }

    setActiveChangelist(id: string): boolean {
        const changelist = this.changelists.get(id);
        if (!changelist) {
            return false;
        }

        // Deactivate all changelists
        this.changelists.forEach(cl => cl.active = false);
        
        // Activate the selected one
        changelist.active = true;
        this.saveChangelists();
        return true;
    }

    addFileToChangelist(filePath: string, changelistId?: string): boolean {
        const targetId = changelistId || this.getActiveChangelist().id;
        const changelist = this.changelists.get(targetId);
        
        if (!changelist) {
            return false;
        }

        const alreadyPresent = changelist.files.includes(filePath);

        // Remove file from all other changelists
        this.changelists.forEach(cl => {
            cl.files = cl.files.filter(f => f !== filePath);
        });

        // Add to target changelist
        if (!alreadyPresent) {
            changelist.files.push(filePath);
        }

        this.saveChangelists();
        return !alreadyPresent;
    }

    removeFileFromChangelist(filePath: string, changelistId: string): void {
        const changelist = this.changelists.get(changelistId);
        if (!changelist) {
            return;
        }

        changelist.files = changelist.files.filter(f => f !== filePath);
        this.saveChangelists();
    }

    getChangelistForFile(filePath: string): Changelist | undefined {
        return Array.from(this.changelists.values()).find(cl => 
            cl.files.includes(filePath)
        );
    }

    moveFileToChangelist(filePath: string, targetChangelistId: string): void {
        // Remove from current changelist
        this.changelists.forEach(cl => {
            cl.files = cl.files.filter(f => f !== filePath);
        });

        // Add to target changelist
        const targetChangelist = this.changelists.get(targetChangelistId);
        if (targetChangelist && !targetChangelist.files.includes(filePath)) {
            targetChangelist.files.push(filePath);
        }

        this.saveChangelists();
    }

    renameChangelist(id: string, newName: string): boolean {
        const changelist = this.changelists.get(id);
        if (!changelist) {
            return false;
        }

        changelist.name = newName;
        this.saveChangelists();
        return true;
    }

    clearEmptyFiles(existingFiles: Set<string>): void {
        // Remove files that no longer exist from all changelists
        this.changelists.forEach(cl => {
            cl.files = cl.files.filter(f => existingFiles.has(f));
        });
        this.saveChangelists();
    }

    updateChangelist(
        id: string,
        updates: Partial<Pick<Changelist, 'name' | 'description'>>
    ): boolean {
        const changelist = this.changelists.get(id);
        if (!changelist) {
            return false;
        }

        if (typeof updates.name === 'string') {
            changelist.name = updates.name;
        }
        if (typeof updates.description === 'string') {
            changelist.description = updates.description;
        }

        this.saveChangelists();
        return true;
    }

    getFilesInChangelist(changelistId: string): string[] {
        const changelist = this.changelists.get(changelistId);
        return changelist ? [...changelist.files] : [];
    }
}


