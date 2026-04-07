import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, userSettings, projectGithub } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { encrypt, decrypt } from '../services/crypto.js';
import { GitHubService } from '../services/github.js';

const connectGitHubSchema = z.object({
  repoUrl: z.string().url(),
  branch: z.string().default('main'),
});

const commitSchema = z.object({
  message: z.string().min(1),
});

export async function githubRoutes(app: FastifyInstance) {
  // OAuth callback (simplified - in production, use OAuth library)
  app.post('/api/v1/auth/github/callback', async (req, reply) => {
    const { code } = z.object({ code: z.string() }).parse(req.body);

    if (!process.env['GITHUB_CLIENT_ID'] || !process.env['GITHUB_CLIENT_SECRET']) {
      return reply.status(500).send({ error: 'GitHub OAuth not configured' });
    }

    // Exchange code for token (simplified)
    // In production, use a proper OAuth library like @octokit/oauth-app
    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          client_id: process.env['GITHUB_CLIENT_ID'],
          client_secret: process.env['GITHUB_CLIENT_SECRET'],
          code,
        }),
      });

      const tokenData = (await tokenRes.json()) as any;
      if (tokenData.error) {
        return reply.status(401).send({ error: 'GitHub OAuth failed' });
      }

      const accessToken = tokenData.access_token;

      // Get authenticated user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      const githubUser = (await userRes.json()) as any;

      // Find or create user
      let user = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, githubUser.email))
        .limit(1);

      if (user.length === 0) {
        // Create new user (GitHub OAuth signup)
        const [newUser] = await db
          .insert(users)
          .values({
            email: githubUser.email,
            passwordHash: '', // OAuth users have no password
          })
          .returning({ id: users.id });

        await db.insert(userSettings).values({ userId: newUser!.id });
        user = [newUser!];
      }

      // Store encrypted GitHub token in session (or in a new table)
      req.session.userId = user[0]!.id;
      (req.session as any).githubToken = accessToken;
      (req.session as any).githubUsername = githubUser.login;

      return reply.send({
        user: { id: user[0]!.id },
        githubUsername: githubUser.login,
      });
    } catch (err) {
      return reply.status(500).send({ error: 'GitHub auth failed' });
    }
  });

  // Connect GitHub repo to project
  app.post('/api/v1/projects/:projectId/github/connect', async (req, reply) => {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { projectId } = z.object({ projectId: z.string() }).parse(req.params);
    const { repoUrl, branch } = connectGitHubSchema.parse(req.body);

    // Verify project ownership
    const project = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId as any))
      .limit(1);

    if (project.length === 0) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Get GitHub token from session (should be encrypted in DB in production)
    const githubToken = (req.session as any).githubToken;
    if (!githubToken) {
      return reply.status(401).send({ error: 'GitHub not authenticated' });
    }

    try {
      const { owner, repo } = GitHubService.parseRepoUrl(repoUrl);

      // Encrypt token and store
      const { ciphertext, iv, authTag } = encrypt(githubToken);

      // Upsert github connection
      await db
        .insert(projectGithub)
        .values({
          projectId: projectId as any,
          repoUrl,
          branch,
          githubUsername: (req.session as any).githubUsername,
          encryptedToken: ciphertext,
          iv,
          authTag,
        })
        .onConflictDoUpdate({
          target: [projectGithub.projectId],
          set: {
            repoUrl,
            branch,
            githubUsername: (req.session as any).githubUsername,
            encryptedToken: ciphertext,
            iv,
            authTag,
            updatedAt: new Date(),
          },
        });

      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(400).send({ error: `Failed to connect repo: ${err}` });
    }
  });

  // Clone repo into project
  app.post('/api/v1/projects/:projectId/github/clone', async (req, reply) => {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { projectId } = z.object({ projectId: z.string() }).parse(req.params);

    try {
      const [githubConn] = await db
        .select()
        .from(projectGithub)
        .where(eq(projectGithub.projectId, projectId as any))
        .limit(1);

      if (!githubConn) {
        return reply.status(404).send({ error: 'GitHub not connected' });
      }

      const token = decrypt(
        githubConn.encryptedToken,
        githubConn.iv,
        githubConn.authTag,
      );

      const { owner, repo } = GitHubService.parseRepoUrl(githubConn.repoUrl);
      const service = new GitHubService(token);

      await service.cloneRepo(owner, repo, githubConn.branch, projectId);

      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(400).send({ error: `Clone failed: ${err}` });
    }
  });

  // Commit to GitHub
  app.post('/api/v1/projects/:projectId/github/commit', async (req, reply) => {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { projectId } = z.object({ projectId: z.string() }).parse(req.params);
    const { message } = commitSchema.parse(req.body);

    try {
      const [githubConn] = await db
        .select()
        .from(projectGithub)
        .where(eq(projectGithub.projectId, projectId as any))
        .limit(1);

      if (!githubConn) {
        return reply.status(404).send({ error: 'GitHub not connected' });
      }

      const token = decrypt(
        githubConn.encryptedToken,
        githubConn.iv,
        githubConn.authTag,
      );

      const { owner, repo } = GitHubService.parseRepoUrl(githubConn.repoUrl);
      const service = new GitHubService(token);

      const commitSha = await service.commitFiles(
        owner,
        repo,
        githubConn.branch,
        projectId,
        message,
      );

      // Update last commit SHA
      await db
        .insert(projectGithub)
        .values({ projectId: projectId as any, lastCommitSha: commitSha } as any)
        .onConflictDoUpdate({
          target: [projectGithub.projectId],
          set: { lastCommitSha: commitSha },
        });

      return reply.send({ ok: true, commitSha });
    } catch (err) {
      return reply.status(400).send({ error: `Commit failed: ${err}` });
    }
  });

  // Pull from GitHub
  app.post('/api/v1/projects/:projectId/github/pull', async (req, reply) => {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { projectId } = z.object({ projectId: z.string() }).parse(req.params);

    try {
      const [githubConn] = await db
        .select()
        .from(projectGithub)
        .where(eq(projectGithub.projectId, projectId as any))
        .limit(1);

      if (!githubConn) {
        return reply.status(404).send({ error: 'GitHub not connected' });
      }

      const token = decrypt(
        githubConn.encryptedToken,
        githubConn.iv,
        githubConn.authTag,
      );

      const { owner, repo } = GitHubService.parseRepoUrl(githubConn.repoUrl);
      const service = new GitHubService(token);

      const commitSha = await service.pullFromGitHub(owner, repo, githubConn.branch, projectId);

      // Update last commit SHA
      await db
        .insert(projectGithub)
        .values({ projectId: projectId as any, lastCommitSha: commitSha } as any)
        .onConflictDoUpdate({
          target: [projectGithub.projectId],
          set: { lastCommitSha: commitSha },
        });

      return reply.send({ ok: true, commitSha });
    } catch (err) {
      return reply.status(400).send({ error: `Pull failed: ${err}` });
    }
  });
}
