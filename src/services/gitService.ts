import * as vscode from 'vscode';
import simpleGit, { SimpleGit, StatusResult, LogResult, DiffResult, BranchSummary } from 'simple-git';
import * as path from 'path';

export interface GitStatus {
    modified: string[];
    staged: string[];
    untracked: string[];
    deleted: string[];
    renamed: { from: string; to: string }[];
}

export interface GitCommit {
    hash: string;
    abbrevHash: string;
    author: string;
    email: string;
    date: Date;
    message: string;
    parents: string[];
    refs: string[];
    graph?: string;
}

export interface GitBranch {
    name: string;
    current: boolean;
    remote: boolean;
    commit: string;
}

export interface GitStashEntry {
    hash: string;
    message: string;
    branch?: string;
    date: Date;
}

export class GitService {
    private git: SimpleGit;
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.git = simpleGit(workspaceRoot);
    }

    async initialize(): Promise<void> {
        try {
            await this.git.status();
        } catch (error) {
            throw new Error('Not a git repository or git is not installed');
        }
    }

    async getStatus(): Promise<GitStatus> {
        const status: StatusResult = await this.git.status();
        
        return {
            modified: [...status.modified, ...status.conflicted],
            staged: [...status.staged],
            untracked: status.not_added,
            deleted: status.deleted,
            renamed: status.renamed.map(r => ({
                from: r.from,
                to: r.to
            }))
        };
    }

    async getDiff(filePath: string, staged: boolean = false): Promise<string> {
        try {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            if (staged) {
                return await this.git.diff(['--cached', '--', relativePath]);
            } else {
                return await this.git.diff(['--', relativePath]);
            }
        } catch (error) {
            console.error('Error getting diff:', error);
            return '';
        }
    }

    async stageFile(filePath: string): Promise<void> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        await this.git.add(relativePath);
    }

    async stageFiles(filePaths: string[]): Promise<void> {
        const relativePaths = filePaths.map(p => path.relative(this.workspaceRoot, p));
        await this.git.add(relativePaths);
    }

    async unstageFile(filePath: string): Promise<void> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        await this.git.reset(['HEAD', '--', relativePath]);
    }

    async unstageFiles(filePaths: string[]): Promise<void> {
        const relativePaths = filePaths.map(p => path.relative(this.workspaceRoot, p));
        if (relativePaths.length > 0) {
            await this.git.reset(['HEAD', '--', ...relativePaths]);
        }
    }

    async revertFile(filePath: string): Promise<void> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        await this.git.checkout(['--', relativePath]);
    }

    async commit(message: string, files?: string[]): Promise<void> {
        if (files && files.length > 0) {
            const relativePaths = files.map(p => path.relative(this.workspaceRoot, p));
            await this.git.add(relativePaths);
        }
        await this.git.commit(message);
    }

    async commitAmend(message: string): Promise<void> {
        await this.git.commit(message, ['--amend']);
    }

    async push(remote: string = 'origin', branch?: string): Promise<void> {
        if (branch) {
            await this.git.push(remote, branch);
        } else {
            await this.git.push();
        }
    }

    async pull(remote: string = 'origin', branch?: string): Promise<void> {
        if (branch) {
            await this.git.pull(remote, branch);
        } else {
            await this.git.pull();
        }
    }

    async fetch(remote: string = 'origin'): Promise<void> {
        await this.git.fetch(remote);
    }

    async getLog(maxCount: number = 100, includeGraph: boolean = false): Promise<GitCommit[]> {
        const log = await this.git.log({
            maxCount
        });

        const commits: GitCommit[] = log.all.map(commit => ({
            hash: commit.hash,
            abbrevHash: commit.hash.substring(0, 7),
            author: (commit as any).author_name || '',
            email: (commit as any).author_email || '',
            date: new Date(commit.date),
            message: commit.message,
            parents: [],
            refs: (commit as any).refs ? String((commit as any).refs).split(',').map((r: string) => r.trim()).filter((r: string) => r) : []
        }));

        if (includeGraph) {
            try {
                const graphOutput = await this.git.raw([
                    'log',
                    `--max-count=${maxCount}`,
                    '--graph',
                    '--pretty=format:%H%x09%s'
                ]);

                const graphMap = new Map<string, string>();
                const lines = graphOutput.split('\n');

                for (const line of lines) {
                    const match = line.match(/([\s\|\*\\\/]+)([0-9a-f]{7,40})\t/);
                    if (!match) {
                        continue;
                    }
                    const graphPart = match[1].replace(/\s+$/g, '');
                    const hash = match[2];
                    graphMap.set(hash, graphPart.trimEnd());
                }

                commits.forEach(commit => {
                    const graph = graphMap.get(commit.hash);
                    if (graph) {
                        commit.graph = graph;
                    }
                });
            } catch (error) {
                console.error('Failed to load git graph:', error);
            }
        }

        return commits;
    }

    async getFileLog(filePath: string, maxCount: number = 100): Promise<GitCommit[]> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const log: LogResult = await this.git.log({
            file: relativePath,
            maxCount
        });

        return log.all.map(commit => ({
            hash: commit.hash,
            abbrevHash: commit.hash.substring(0, 7),
            author: (commit as any).author_name || '',
            email: (commit as any).author_email || '',
            date: new Date(commit.date),
            message: commit.message,
            parents: [],
            refs: []
        }));
    }

    async getCommitDiff(commitHash: string): Promise<string> {
        return await this.git.show([commitHash]);
    }

    async getBranches(): Promise<GitBranch[]> {
        const summary: BranchSummary = await this.git.branch(['-a']);
        const branches: GitBranch[] = [];

        for (const [name, info] of Object.entries(summary.branches)) {
            branches.push({
                name,
                current: info.current,
                remote: name.includes('remotes/'),
                commit: info.commit
            });
        }

        return branches;
    }

    async getCurrentBranch(): Promise<string> {
        const summary = await this.git.branch();
        return summary.current;
    }

    async createBranch(branchName: string, startPoint?: string): Promise<void> {
        if (startPoint) {
            await this.git.checkoutBranch(branchName, startPoint);
        } else {
            await this.git.checkoutLocalBranch(branchName);
        }
    }

    async checkoutBranch(branchName: string): Promise<void> {
        await this.git.checkout(branchName);
    }

    async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
        if (force) {
            await this.git.deleteLocalBranch(branchName, true);
        } else {
            await this.git.deleteLocalBranch(branchName);
        }
    }

    async mergeBranch(branchName: string): Promise<void> {
        await this.git.merge([branchName]);
    }

    async rebase(branchName: string): Promise<void> {
        await this.git.rebase([branchName]);
    }

    async cherryPick(commitHash: string): Promise<void> {
        await this.git.raw(['cherry-pick', commitHash]);
    }

    async reset(mode: 'soft' | 'mixed' | 'hard', target: string = 'HEAD'): Promise<void> {
        await this.git.reset([`--${mode}`, target]);
    }

    async getBlame(filePath: string): Promise<string> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        return await this.git.raw(['blame', relativePath]);
    }

    async stash(message?: string): Promise<void> {
        if (message) {
            await this.git.stash(['push', '-m', message]);
        } else {
            await this.git.stash();
        }
    }

    async stashPop(stashId?: string): Promise<void> {
        if (stashId) {
            await this.git.stash(['pop', stashId]);
        } else {
            await this.git.stash(['pop']);
        }
    }

    async stashApply(stashId?: string): Promise<void> {
        if (stashId) {
            await this.git.stash(['apply', stashId]);
        } else {
            await this.git.stash(['apply']);
        }
    }

    async stashDrop(stashId: string): Promise<void> {
        await this.git.stash(['drop', stashId]);
    }

    async getStashList(): Promise<GitStashEntry[]> {
        const result = await this.git.stashList();
        return result.all.map(entry => ({
            hash: entry.hash,
            message: entry.message,
            branch: (entry as any).branch,
            date: this.resolveStashDate(entry)
        }));
    }

    async getStashDiff(stashId: string): Promise<string> {
        return await this.git.show([stashId]);
    }

    getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }

    async getFileContent(filePath: string, ref: string = 'HEAD'): Promise<string> {
        try {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            return await this.git.show([`${ref}:${relativePath}`]);
        } catch (error) {
            return '';
        }
    }

    async compareWithBranch(branchName: string, filePath?: string): Promise<string> {
        if (filePath) {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            return await this.git.diff([branchName, '--', relativePath]);
        } else {
            return await this.git.diff([branchName]);
        }
    }

    private resolveStashDate(entry: any): Date {
        if (entry.date) {
            return new Date(entry.date);
        }

        const unixTime: number | undefined = entry.unixTime;
        if (typeof unixTime === 'number') {
            return new Date(unixTime * 1000);
        }

        return new Date();
    }
}
