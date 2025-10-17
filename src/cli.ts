#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
  CallToolRequestSchema,
  CompatibilityCallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { BitbucketClient } from './bitbucket.js';
import { getCurrentBranch, findRepoRoot } from './git.js';

async function main() {
  const config = loadConfig();
  const client = new BitbucketClient({ 
    email: config.ATLASSIAN_USER_EMAIL, 
    token: config.ATLASSIAN_API_TOKEN, 
    baseUrl: config.baseUrl,
    authType: config.authType
  });

  const getDefaultWorkspace = (args: any) => {
    const w = args?.workspace as string;
    if (!w) throw new Error('workspace parameter is required');
    return w;
  };
  const getDefaultRepoSlug = (args: any) => {
    const r = args?.repoSlug as string;
    if (!r) throw new Error('repoSlug parameter is required');
    return r;
  };

  type ToolHandler = (args: any) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>;
  type ToolDef = {
    name: string;
    description: string;
    inputSchema: any;
    handler: ToolHandler;
  };

  const tools: ToolDef[] = [];
  const addTool = (def: ToolDef) => {
    tools.push(def);
  };

  const jsonOut = (data: unknown) => [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }];

  addTool({
    name: 'repo_info',
    description: 'Get repository info. Requires workspace and repoSlug parameters.',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug'],
      properties: { workspace: { type: 'string' }, repoSlug: { type: 'string' } },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getRepo(w, r);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'pr_list',
    description: 'List pull requests for the repository. Requires workspace and repoSlug parameters. Optional state=OPEN|MERGED|DECLINED|SUPERSEDED (default OPEN).',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug'],
      properties: {
        workspace: { type: 'string' },
        repoSlug: { type: 'string' },
        state: { type: 'string', enum: ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'] },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const s = ((args?.state as string) || 'OPEN') as any;
      const data = await client.listPullRequests(w, r, s);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'pr_create',
    description: 'Create a pull request. Requires workspace and repoSlug parameters. Provide title. sourceBranch and destBranch are optional - sourceBranch defaults to current branch, destBranch defaults to configured default (usually "main").',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug', 'title'],
      properties: {
        workspace: { type: 'string' },
        repoSlug: { type: 'string' },
        title: { type: 'string' },
        sourceBranch: { type: 'string' },
        destBranch: { type: 'string' },
        description: { type: 'string' },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);

      // Get current branch as default source if not provided
      let sourceBranch = args!.sourceBranch as string;
      if (!sourceBranch) {
        try {
          const repoRoot = findRepoRoot();
          sourceBranch = getCurrentBranch(repoRoot);
        } catch (e) {
          throw new Error('sourceBranch is required or must be in a git repository');
        }
      }

      // Use configured default destination branch if not provided
      const destBranch = (args!.destBranch as string) || config.defaultDestinationBranch;

      const data = await client.createPullRequest(w, r, {
        title: args!.title as string,
        sourceBranch,
        destBranch,
        description: (args!.description as string) || '',
      });
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'branches_list',
    description: 'List branches in the repository. Requires workspace and repoSlug parameters.',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug'],
      properties: { workspace: { type: 'string' }, repoSlug: { type: 'string' } },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.listBranches(w, r);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'branch_create',
    description: 'Create a branch from a target commit hash. Requires workspace, repoSlug, name, and targetHash parameters.',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug', 'name', 'targetHash'],
      properties: {
        workspace: { type: 'string' },
        repoSlug: { type: 'string' },
        name: { type: 'string' },
        targetHash: { type: 'string' },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.createBranch(w, r, args!.name as string, args!.targetHash as string);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'workspaces_list',
    description: 'List all accessible workspaces',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args: any) => {
      const data = await client.listWorkspaces();
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'repos_list',
    description: 'List repositories in a workspace',
    inputSchema: {
      type: 'object',
      required: ['workspace'],
      properties: { workspace: { type: 'string' } },
    },
    handler: async (args: any) => {
      const data = await client.listRepositories(args!.workspace as string);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'pr_get',
    description: 'Get details of a specific pull request. Requires workspace, repoSlug, and prId parameters.',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug', 'prId'],
      properties: {
        workspace: { type: 'string' },
        repoSlug: { type: 'string' },
        prId: { type: 'number' },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getPullRequest(w, r, args!.prId as number);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'pr_diff',
    description: 'Get diff of a pull request. Requires workspace, repoSlug, and prId parameters.',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug', 'prId'],
      properties: {
        workspace: { type: 'string' },
        repoSlug: { type: 'string' },
        prId: { type: 'number' },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getPullRequestDiff(w, r, args!.prId as number);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'pr_changes',
    description: 'Get file changes in a pull request. Requires workspace, repoSlug, and prId parameters.',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug', 'prId'],
      properties: {
        workspace: { type: 'string' },
        repoSlug: { type: 'string' },
        prId: { type: 'number' },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getPullRequestChanges(w, r, args!.prId as number);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'pr_comment_add',
    description: 'Add a comment to a pull request. Requires workspace, repoSlug, prId, and text parameters.',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug', 'prId', 'text'],
      properties: {
        workspace: { type: 'string' },
        repoSlug: { type: 'string' },
        prId: { type: 'number' },
        text: { type: 'string' },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.addPullRequestComment(w, r, args!.prId as number, args!.text as string);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'file_content',
    description: 'Get content of a file at a specific commit. Requires workspace, repoSlug, filePath, and commitHash parameters.',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug', 'filePath', 'commitHash'],
      properties: {
        workspace: { type: 'string' },
        repoSlug: { type: 'string' },
        filePath: { type: 'string' },
        commitHash: { type: 'string' },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getFileContent(w, r, args!.filePath as string, args!.commitHash as string);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: 'connection_test',
    description: 'Test connection to Bitbucket API',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args: any) => {
      const success = await client.testConnection();
      return { content: [{ type: 'text', text: success ? 'Connection successful' : 'Connection failed' }] };
    },
  });

  addTool({
    name: 'commits_list',
    description: 'List commits in the repository. Requires workspace and repoSlug parameters. Optional spec (branch or commit range).',
    inputSchema: {
      type: 'object',
      required: ['workspace', 'repoSlug'],
      properties: { workspace: { type: 'string' }, repoSlug: { type: 'string' }, spec: { type: 'string' } },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const spec = args?.spec as string | undefined;
      const data = await client.listCommits(w, r, spec);
      return { content: jsonOut(data) };
    },
  });

  const server = new Server(
    { name: 'bitbucket-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } as any;
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params as any).arguments || {};
    const t = tools.find((t) => t.name === name);
    if (!t) {
      return { content: [{ type: 'text', text: `Tool not found: ${name}` }], isError: true } as any;
    }
    try {
      const result = await t.handler(args);
      return result as any;
    } catch (e: any) {
      return { content: [{ type: 'text', text: String(e?.message || e) }], isError: true } as any;
    }
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.exit(1);
});
