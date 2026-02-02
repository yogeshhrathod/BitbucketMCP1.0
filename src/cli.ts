#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
  CallToolRequestSchema,
  CompatibilityCallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { BitbucketClient, BitbucketError } from "./bitbucket.js";
import {
  getCurrentBranch,
  findRepoRoot,
  getRemoteUrl,
  parseBitbucketRemote,
} from "./git.js";

async function main() {
  const config = loadConfig();
  const client = new BitbucketClient({
    email: config.ATLASSIAN_USER_EMAIL,
    token: config.ATLASSIAN_API_TOKEN,
    baseUrl: config.baseUrl,
    authType: config.authType,
  });

  const getDefaultWorkspace = (args: any) => {
    const w = args?.workspace as string;
    if (!w) throw new Error("workspace parameter is required");
    return w;
  };
  const getDefaultRepoSlug = (args: any) => {
    const r = args?.repoSlug as string;
    if (!r) throw new Error("repoSlug parameter is required");
    return r;
  };

  type ToolHandler = (args: any) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
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

  const jsonOut = (data: unknown) => [
    { type: "text" as const, text: JSON.stringify(data, null, 2) },
  ];

  addTool({
    name: "repo_info",
    description:
      "Get repository info. Requires workspace and repoSlug parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getRepo(w, r);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_list",
    description:
      "List pull requests for the repository. Requires workspace and repoSlug parameters. Optional state=OPEN|MERGED|DECLINED|SUPERSEDED (default OPEN).",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        state: {
          type: "string",
          enum: ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"],
        },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const s = ((args?.state as string) || "OPEN") as any;
      const data = await client.listPullRequests(w, r, s);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_create",
    description:
      'Create a pull request. Requires workspace and repoSlug parameters. Provide title. sourceBranch and destBranch are optional - sourceBranch defaults to current branch, destBranch defaults to configured default (usually "main").',
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "title"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        title: { type: "string" },
        sourceBranch: { type: "string" },
        destBranch: { type: "string" },
        description: { type: "string" },
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
          throw new Error(
            "sourceBranch is required or must be in a git repository"
          );
        }
      }

      // Use configured default destination branch if not provided
      const destBranch =
        (args!.destBranch as string) || config.defaultDestinationBranch;

      const data = await client.createPullRequest(w, r, {
        title: args!.title as string,
        sourceBranch,
        destBranch,
        description: (args!.description as string) || "",
      });
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "branches_list",
    description:
      "List branches in the repository. Requires workspace and repoSlug parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.listBranches(w, r);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "branch_create",
    description:
      "Create a branch from a target commit hash. Requires workspace, repoSlug, name, and targetHash parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "name", "targetHash"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        name: { type: "string" },
        targetHash: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.createBranch(
        w,
        r,
        args!.name as string,
        args!.targetHash as string
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "workspaces_list",
    description: "List all accessible workspaces",
    inputSchema: { type: "object", properties: {} },
    handler: async (args: any) => {
      const data = await client.listWorkspaces();
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "repos_list",
    description: "List repositories in a workspace",
    inputSchema: {
      type: "object",
      required: ["workspace"],
      properties: { workspace: { type: "string" } },
    },
    handler: async (args: any) => {
      const data = await client.listRepositories(args!.workspace as string);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_get",
    description:
      "Get details of a specific pull request. Requires workspace, repoSlug, and prId parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
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
    name: "pr_diff",
    description:
      "Get diff of a pull request. Requires workspace, repoSlug, and prId parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
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
    name: "pr_changes",
    description:
      "Get file changes in a pull request. Requires workspace, repoSlug, and prId parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getPullRequestChanges(
        w,
        r,
        args!.prId as number
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_comment_add",
    description:
      "Add a comment to a pull request. Requires workspace, repoSlug, prId, and text parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId", "text"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
        text: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.addPullRequestComment(
        w,
        r,
        args!.prId as number,
        args!.text as string
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "file_content",
    description:
      "Get content of a file at a specific commit. Requires workspace, repoSlug, filePath, and commitHash parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "filePath", "commitHash"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        filePath: { type: "string" },
        commitHash: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getFileContent(
        w,
        r,
        args!.filePath as string,
        args!.commitHash as string
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "connection_test",
    description: "Test connection to Bitbucket API",
    inputSchema: { type: "object", properties: {} },
    handler: async (args: any) => {
      const result = await client.testConnection();
      if (result.success) {
        return {
          content: [{ type: "text", text: "Connection successful" }],
        };
      } else {
        const errorInfo = result.error
          ? {
              error: result.error.message,
              errorType: result.error.errorType,
              statusCode: result.error.statusCode,
              suggestion: result.error.suggestion,
              isRetryable: result.error.isRetryable,
            }
          : { error: "Connection failed" };
        return {
          content: [{ type: "text", text: JSON.stringify(errorInfo, null, 2) }],
          isError: true,
        };
      }
    },
  });

  addTool({
    name: "commits_list",
    description:
      "List commits in the repository. Requires workspace and repoSlug parameters. Optional spec (branch or commit range).",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        spec: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const spec = args?.spec as string | undefined;
      const data = await client.listCommits(w, r, spec);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_approve",
    description:
      "Approve a pull request. Requires workspace, repoSlug, and prId parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.approvePullRequest(w, r, args!.prId as number);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_decline",
    description:
      "Decline/reject a pull request. Requires workspace, repoSlug, and prId parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.declinePullRequest(w, r, args!.prId as number);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_merge",
    description:
      "Merge a pull request. Requires workspace, repoSlug, and prId parameters. Optional: closeSourceBranch (boolean), mergeStrategy (merge_commit|squash|fast_forward), message (string).",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
        closeSourceBranch: { type: "boolean" },
        mergeStrategy: {
          type: "string",
          enum: ["merge_commit", "squash", "fast_forward"],
        },
        message: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const options: any = {};
      if (args?.closeSourceBranch !== undefined)
        options.closeSourceBranch = args.closeSourceBranch;
      if (args?.mergeStrategy) options.mergeStrategy = args.mergeStrategy;
      if (args?.message) options.message = args.message;
      const data = await client.mergePullRequest(
        w,
        r,
        args!.prId as number,
        options
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_update",
    description:
      "Update pull request title and/or description. Requires workspace, repoSlug, and prId parameters. Optional: title, description.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
        title: { type: "string" },
        description: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const updates: any = {};
      if (args?.title) updates.title = args.title;
      if (args?.description) updates.description = args.description;
      const data = await client.updatePullRequest(
        w,
        r,
        args!.prId as number,
        updates
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_reviewers_add",
    description:
      "Add reviewers to a pull request. Requires workspace, repoSlug, prId, and reviewers (array of user UUIDs for Cloud or usernames for Server).",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId", "reviewers"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
        reviewers: { type: "array", items: { type: "string" } },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const reviewers = args!.reviewers as string[];
      if (!Array.isArray(reviewers) || reviewers.length === 0) {
        throw new Error("reviewers must be a non-empty array of strings");
      }
      const data = await client.addPullRequestReviewers(
        w,
        r,
        args!.prId as number,
        reviewers
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_comments_list",
    description:
      "List all comments on a pull request. Requires workspace, repoSlug, and prId parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.listPullRequestComments(
        w,
        r,
        args!.prId as number
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "commit_get",
    description:
      "Get details of a specific commit. Requires workspace, repoSlug, and commitHash parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "commitHash"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        commitHash: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getCommit(w, r, args!.commitHash as string);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "commit_diff",
    description:
      "Get diff for a specific commit. Requires workspace, repoSlug, and commitHash parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "commitHash"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        commitHash: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.getCommitDiff(w, r, args!.commitHash as string);
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "branch_compare",
    description:
      "Compare two branches to see differences. Requires workspace, repoSlug, source (branch name), and destination (branch name) parameters.",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "source", "destination"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        source: { type: "string" },
        destination: { type: "string" },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.compareBranches(
        w,
        r,
        args!.source as string,
        args!.destination as string
      );
      return { content: jsonOut(data) };
    },
  });

  addTool({
    name: "pr_inline_comment_add",
    description:
      "Add an inline comment to a pull request at a specific file and line. Requires workspace, repoSlug, prId, filePath, line, and text parameters. Optional: lineType (ADDED|CONTEXT|REMOVED, default ADDED).",
    inputSchema: {
      type: "object",
      required: ["workspace", "repoSlug", "prId", "filePath", "line", "text"],
      properties: {
        workspace: { type: "string" },
        repoSlug: { type: "string" },
        prId: { type: "number" },
        filePath: { type: "string" },
        line: { type: "number" },
        text: { type: "string" },
        lineType: { type: "string", enum: ["ADDED", "CONTEXT", "REMOVED"] },
      },
    },
    handler: async (args: any) => {
      const w = getDefaultWorkspace(args);
      const r = getDefaultRepoSlug(args);
      const data = await client.addInlineCommentAfterReview(
        w,
        r,
        args!.prId as number,
        args!.filePath as string,
        args!.line as number,
        args!.text as string,
        (args!.lineType as "ADDED" | "CONTEXT" | "REMOVED") || "ADDED"
      );
      return { content: jsonOut(data) };
    },
  });

  const server = new Server(
    { name: "@yogeshrathod/bitbucket-mcp", version: "1.0.1" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    } as any;
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params as any).arguments || {};
    const t = tools.find((t) => t.name === name);
    if (!t) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true,
      } as any;
    }
    try {
      const result = await t.handler(args);
      return result as any;
    } catch (e: any) {
      // Return structured error information for BitbucketError
      if (e instanceof BitbucketError) {
        const errorInfo = {
          error: e.message,
          errorType: e.errorType,
          statusCode: e.statusCode,
          suggestion: e.suggestion,
          isRetryable: e.isRetryable,
          details: e.details,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(errorInfo, null, 2) }],
          isError: true,
        } as any;
      }
      // Fallback for other errors
      return {
        content: [{ type: "text", text: String(e?.message || e) }],
        isError: true,
      } as any;
    }
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.exit(1);
});
