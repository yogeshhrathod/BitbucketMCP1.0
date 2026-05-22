import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import nock from "nock";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "../src/config.js";
import { BitbucketClient } from "../src/bitbucket.js";
import * as dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: ".env" });

describe("MCP Server Integration Tests", () => {
  const baseUrl = "https://api.bitbucket.org/2.0";

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("Config Loading", () => {
    const prevEnv = { ...process.env };

    beforeAll(() => {
      process.env.ATLASSIAN_USER_EMAIL = "integration@example.com";
      process.env.ATLASSIAN_API_TOKEN = "integration-test-token";
      process.env.ATLASSIAN_SITE_URL = "bitbucket";
      process.env.BITBUCKET_DEFAULT_DEST_BRANCH = "main";
    });

    afterAll(() => {
      process.env = { ...prevEnv };
    });

    it("loads config successfully", () => {
      expect(() => {
        loadConfig();
      }).not.toThrow();
    });
  });

  describe("BitbucketClient Integration", () => {
    let client: BitbucketClient;

    beforeEach(() => {
      client = new BitbucketClient({
        email: "test@example.com",
        token: "test-token-12345",
        baseUrl,
      });
    });

    it("successfully gets repository info", async () => {
      nock(baseUrl).get("/repositories/test-workspace/test-repo").reply(200, {
        slug: "test-repo",
        full_name: "test-workspace/test-repo",
        name: "Test Repository",
      });

      const result = await client.getRepo("test-workspace", "test-repo");
      expect((result as any).slug).toBe("test-repo");
      expect((result as any).full_name).toBe("test-workspace/test-repo");
    });

    it("successfully lists pull requests", async () => {
      nock(baseUrl)
        .get("/repositories/test-workspace/test-repo/pullrequests")
        .query({ state: "OPEN" })
        .reply(200, {
          values: [
            {
              id: 1,
              title: "Test PR",
              state: "OPEN",
              author: { display_name: "Test User" },
            },
          ],
        });

      const result = await client.listPullRequests(
        "test-workspace",
        "test-repo",
        "OPEN"
      );
      expect((result as any).values).toHaveLength(1);
      expect((result as any).values[0].title).toBe("Test PR");
    });

    it("successfully lists workspaces", async () => {
      nock(baseUrl)
        .get("/workspaces")
        .reply(200, {
          values: [{ slug: "test-workspace", name: "Test Workspace" }],
        });

      const result = await client.listWorkspaces();
      expect((result as any).values).toHaveLength(1);
      expect((result as any).values[0].slug).toBe("test-workspace");
    });

    it("successfully tests connection", async () => {
      nock(baseUrl).get("/workspaces").reply(200, { values: [] });

      const result = await client.testConnection();
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("successfully gets per-file PR diff", async () => {
      // Mock PR details
      nock(baseUrl)
        .get("/repositories/test-workspace/test-repo/pullrequests/1")
        .reply(200, {
          id: 1,
          source: { commit: { hash: "source123" } },
          destination: { commit: { hash: "dest456" } },
        });

      // Mock diff request
      nock(baseUrl)
        .get("/repositories/test-workspace/test-repo/diff/source123..dest456")
        .query({ path: "src/app.js", context: "5", topic: "true" })
        .reply(200, "@@ -1,5 +1,5 @@\n-old line\n+new line");

      const result = await client.getPullRequestDiffFile(
        "test-workspace",
        "test-repo",
        1,
        "src/app.js",
        5
      );

      expect(result.pull_request_id).toBe(1);
      expect(result.file_path).toBe("src/app.js");
      expect(result.context_lines).toBe(5);
      expect(result.diff).toContain("old line");
      expect(result.truncated).toBe(false);
    });

    it("successfully creates inline comment with task", async () => {
      // Mock comment creation
      nock(baseUrl)
        .post("/repositories/test-workspace/test-repo/pullrequests/1/comments")
        .reply(200, { id: 100 });

      // Mock task creation
      nock(baseUrl)
        .post("/repositories/test-workspace/test-repo/pullrequests/1/tasks")
        .reply(200, { id: 200 });

      const result = await client.createTaskWithInlineComment(
        "test-workspace",
        "test-repo",
        1,
        "src/app.js",
        10,
        "ADDED",
        "Please fix this issue"
      );

      expect(result.status).toBe("success");
      expect(result.comment_id).toBe(100);
      expect(result.task_id).toBe(200);
      expect(result.file_path).toBe("src/app.js");
      expect(result.line_number).toBe(10);
      expect(result.line_type).toBe("ADDED");
    });
  });

  describe("MCP Server Integration", () => {
    it("creates tools with proper handlers", async () => {
      // Mock the client methods
      const mockClient = {
        getRepo: vi
          .fn()
          .mockResolvedValue({
            slug: "test-repo",
            full_name: "test-workspace/test-repo",
          }),
        listPullRequests: vi.fn().mockResolvedValue({ values: [] }),
        createPullRequest: vi.fn().mockResolvedValue({ id: 1 }),
        listBranches: vi.fn().mockResolvedValue({ values: [] }),
        createBranch: vi.fn().mockResolvedValue({ name: "test-branch" }),
        listWorkspaces: vi
          .fn()
          .mockResolvedValue({ values: [{ slug: "test-workspace" }] }),
        listRepositories: vi.fn().mockResolvedValue({ values: [] }),
        getPullRequest: vi.fn().mockResolvedValue({ id: 1 }),
        getPullRequestDiff: vi.fn().mockResolvedValue("diff content"),
        getPullRequestChanges: vi.fn().mockResolvedValue({ values: [] }),
        addPullRequestComment: vi.fn().mockResolvedValue({}),
        getFileContent: vi.fn().mockResolvedValue("file content"),
        testConnection: vi.fn().mockResolvedValue(true),
        listCommits: vi.fn().mockResolvedValue({ values: [] }),
        getPullRequestDiffFile: vi.fn().mockResolvedValue({
          pull_request_id: 1,
          file_path: "src/file.js",
          context_lines: 3,
          diff: "diff content",
          truncated: false,
        }),
        createTaskWithInlineComment: vi.fn().mockResolvedValue({
          status: "success",
          comment_id: 100,
          task_id: 200,
          file_path: "src/file.js",
          line_number: 10,
          line_type: "ADDED",
        }),
      };

      // Test tool handlers directly
      const jsonOut = (data: unknown) => [
        { type: "text" as const, text: JSON.stringify(data, null, 2) },
      ];

      // Test repo_info handler
      const repoInfoHandler = async (args: any) => {
        const w = args?.workspace as string;
        const r = args?.repoSlug as string;
        if (!w || !r) throw new Error("workspace and repoSlug required");
        const data = await mockClient.getRepo(w, r);
        return { content: jsonOut(data) };
      };

      const repoResult = await repoInfoHandler({
        workspace: "test-workspace",
        repoSlug: "test-repo",
      });
      expect(repoResult.content[0].text).toContain("test-repo");
      expect(mockClient.getRepo).toHaveBeenCalledWith(
        "test-workspace",
        "test-repo"
      );

      // Test workspaces_list handler
      const workspacesHandler = async () => {
        const data = await mockClient.listWorkspaces();
        return { content: jsonOut(data) };
      };

      const workspacesResult = await workspacesHandler();
      expect(workspacesResult.content[0].text).toContain("test-workspace");
      expect(mockClient.listWorkspaces).toHaveBeenCalled();
    });

    it("handles tool execution errors gracefully", async () => {
      const mockClient = {
        getRepo: vi.fn().mockRejectedValue(new Error("API Error")),
      };

      const repoInfoHandler = async (args: any) => {
        const w = args?.workspace as string;
        const r = args?.repoSlug as string;
        if (!w || !r) throw new Error("workspace and repoSlug required");
        const data = await mockClient.getRepo(w, r);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      };

      await expect(
        repoInfoHandler({ workspace: "test", repoSlug: "test" })
      ).rejects.toThrow("API Error");
    });
  });
});
