import { Octokit } from 'octokit';
import { db } from '../db/index.js';
import { files } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ProjectFile } from '@cavaticus/shared';

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Parse GitHub repo URL (https://github.com/owner/repo) to owner and repo
   */
  static parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s.]+?)(?:\.git)?$/);
    if (!match || !match[1] || !match[2]) {
      throw new Error('Invalid GitHub repository URL');
    }
    return { owner: match[1], repo: match[2] };
  }

  /**
   * Verify repo exists and is accessible
   */
  async verifyRepo(): Promise<void> {
    try {
      await this.octokit.rest.repos.get({
        owner: this.octokit.auth.constructor.name === 'OctokitAuthUser'
          ? (await this.octokit.rest.users.getAuthenticated()).data.login
          : '',
        repo: '',
      });
    } catch (err) {
      throw new Error(`GitHub repo verification failed: ${err}`);
    }
  }

  /**
   * Clone repository files into project
   */
  async cloneRepo(
    owner: string,
    repo: string,
    branch: string,
    projectId: string,
  ): Promise<void> {
    // Get repo tree
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const { data: treeData } = await this.octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: ref.object.sha,
      recursive: '1',
    });

    // Fetch each blob content
    const fileChanges: Array<{ path: string; content: string; mimeType: string }> = [];
    for (const item of treeData.tree) {
      if (item.type === 'blob' && item.url && item.sha) {
        const { data: blob } = await this.octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: item.sha,
        });

        const path = item.path || '';
        const isTextFile = !path.match(/\.(png|jpg|jpeg|gif|webp|ico|svg|woff|ttf|eot)$/i);
        const content = isTextFile && blob.encoding === 'base64'
          ? Buffer.from(blob.content, 'base64').toString('utf-8')
          : blob.content;

        fileChanges.push({
          path,
          content,
          mimeType: getMimeType(path),
        });
      }
    }

    // Insert or update files in DB
    for (const file of fileChanges) {
      await db
        .insert(files)
        .values({
          projectId: projectId as any,
          path: file.path,
          content: file.content,
          mimeType: file.mimeType,
        })
        .onConflictDoUpdate({
          target: [files.projectId, files.path],
          set: {
            content: file.content,
            mimeType: file.mimeType,
            updatedAt: new Date(),
          },
        });
    }
  }

  /**
   * Commit project files to GitHub
   */
  async commitFiles(
    owner: string,
    repo: string,
    branch: string,
    projectId: string,
    message: string,
  ): Promise<string> {
    // Get current branch ref
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const baseSha = ref.object.sha;

    // Get current tree
    const { data: currentTree } = await this.octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: baseSha,
      recursive: '1',
    });

    // Fetch current project files
    const projectFiles = await db
      .select()
      .from(files)
      .where(eq(files.projectId, projectId as any));

    // Build new tree entries
    const treeEntries: any[] = projectFiles.map((file) => {
      const path = file.path || '';
      return {
        path,
        mode: '100644',
        type: 'blob',
        content: file.content,
      };
    });

    // Create new tree
    const { data: newTree } = await this.octokit.rest.git.createTree({
      owner,
      repo,
      tree: treeEntries,
      base_tree: baseSha,
    });

    // Create commit
    const { data: commit } = await this.octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [baseSha],
    });

    // Update branch ref
    await this.octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.sha,
    });

    return commit.sha;
  }

  /**
   * Pull latest commits from GitHub into project
   */
  async pullFromGitHub(
    owner: string,
    repo: string,
    branch: string,
    projectId: string,
  ): Promise<string> {
    // Get latest commit SHA
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const commitSha = ref.object.sha;

    // Get tree for latest commit
    const { data: treeData } = await this.octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: commitSha,
      recursive: '1',
    });

    // Fetch and upsert files
    for (const item of treeData.tree) {
      if (item.type === 'blob' && item.url && item.sha) {
        const { data: blob } = await this.octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: item.sha,
        });

        const path = item.path || '';
        const isTextFile = !path.match(/\.(png|jpg|jpeg|gif|webp|ico|svg|woff|ttf|eot)$/i);
        const content = isTextFile && blob.encoding === 'base64'
          ? Buffer.from(blob.content, 'base64').toString('utf-8')
          : blob.content;

        await db
          .insert(files)
          .values({
            projectId: projectId as any,
            path,
            content,
            mimeType: getMimeType(path),
          })
          .onConflictDoUpdate({
            target: [files.projectId, files.path],
            set: {
              content,
              mimeType: getMimeType(path),
              updatedAt: new Date(),
            },
          });
      }
    }

    return commitSha;
  }
}

function getMimeType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'application/javascript';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'text/typescript';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.md')) return 'text/markdown';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'text/plain';
}
