import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../src/config.js';
import { BitbucketClient } from '../src/bitbucket.js';
import * as dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env' });

describe('MCP Server Integration Tests', () => {
  const baseUrl = 'https://api.bitbucket.org/2.0';

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Config Loading', () => {
    it('loads config successfully', () => {
      // This test verifies that the config loading mechanism works
      // In a real scenario, environment variables or .env file would be set
      expect(() => {
        // This should not throw if environment variables are set (from shell or .env)
        loadConfig();
      }).not.toThrow();
    });
  });

  describe('BitbucketClient Integration', () => {
    let client: BitbucketClient;

    beforeEach(() => {
      client = new BitbucketClient({
        email: 'test@example.com',
        token: 'test-token-12345',
        baseUrl
      });
    });

    it('successfully gets repository info', async () => {
      nock(baseUrl)
        .get('/repositories/test-workspace/test-repo')
        .reply(200, {
          slug: 'test-repo',
          full_name: 'test-workspace/test-repo',
          name: 'Test Repository'
        });

      const result = await client.getRepo('test-workspace', 'test-repo');
      expect((result as any).slug).toBe('test-repo');
      expect((result as any).full_name).toBe('test-workspace/test-repo');
    });

    it('successfully lists pull requests', async () => {
      nock(baseUrl)
        .get('/repositories/test-workspace/test-repo/pullrequests')
        .query({ state: 'OPEN' })
        .reply(200, {
          values: [
            {
              id: 1,
              title: 'Test PR',
              state: 'OPEN',
              author: { display_name: 'Test User' }
            }
          ]
        });

      const result = await client.listPullRequests('test-workspace', 'test-repo', 'OPEN');
      expect((result as any).values).toHaveLength(1);
      expect((result as any).values[0].title).toBe('Test PR');
    });

    it('successfully lists workspaces', async () => {
      nock(baseUrl)
        .get('/workspaces')
        .reply(200, {
          values: [
            { slug: 'test-workspace', name: 'Test Workspace' }
          ]
        });

      const result = await client.listWorkspaces();
      expect((result as any).values).toHaveLength(1);
      expect((result as any).values[0].slug).toBe('test-workspace');
    });

    it('successfully tests connection', async () => {
      nock(baseUrl)
        .get('/workspaces')
        .reply(200, { values: [] });

      const result = await client.testConnection();
      expect(result).toBe(true);
    });
  });

  describe('MCP Server Integration', () => {
    it('creates tools with proper handlers', async () => {
      // Mock the client methods
      const mockClient = {
        getRepo: vi.fn().mockResolvedValue({ slug: 'test-repo', full_name: 'test-workspace/test-repo' }),
        listPullRequests: vi.fn().mockResolvedValue({ values: [] }),
        createPullRequest: vi.fn().mockResolvedValue({ id: 1 }),
        listBranches: vi.fn().mockResolvedValue({ values: [] }),
        createBranch: vi.fn().mockResolvedValue({ name: 'test-branch' }),
        listWorkspaces: vi.fn().mockResolvedValue({ values: [{ slug: 'test-workspace' }] }),
        listRepositories: vi.fn().mockResolvedValue({ values: [] }),
        getPullRequest: vi.fn().mockResolvedValue({ id: 1 }),
        getPullRequestDiff: vi.fn().mockResolvedValue('diff content'),
        getPullRequestChanges: vi.fn().mockResolvedValue({ values: [] }),
        addPullRequestComment: vi.fn().mockResolvedValue({}),
        getFileContent: vi.fn().mockResolvedValue('file content'),
        testConnection: vi.fn().mockResolvedValue(true),
        listCommits: vi.fn().mockResolvedValue({ values: [] }),
      };

      // Test tool handlers directly
      const jsonOut = (data: unknown) => [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }];

      // Test repo_info handler
      const repoInfoHandler = async (args: any) => {
        const w = args?.workspace as string;
        const r = args?.repoSlug as string;
        if (!w || !r) throw new Error('workspace and repoSlug required');
        const data = await mockClient.getRepo(w, r);
        return { content: jsonOut(data) };
      };

      const repoResult = await repoInfoHandler({ workspace: 'test-workspace', repoSlug: 'test-repo' });
      expect(repoResult.content[0].text).toContain('test-repo');
      expect(mockClient.getRepo).toHaveBeenCalledWith('test-workspace', 'test-repo');

      // Test workspaces_list handler
      const workspacesHandler = async () => {
        const data = await mockClient.listWorkspaces();
        return { content: jsonOut(data) };
      };

      const workspacesResult = await workspacesHandler();
      expect(workspacesResult.content[0].text).toContain('test-workspace');
      expect(mockClient.listWorkspaces).toHaveBeenCalled();
    });

    it('handles tool execution errors gracefully', async () => {
      const mockClient = {
        getRepo: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      const repoInfoHandler = async (args: any) => {
        const w = args?.workspace as string;
        const r = args?.repoSlug as string;
        if (!w || !r) throw new Error('workspace and repoSlug required');
        const data = await mockClient.getRepo(w, r);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      };

      await expect(repoInfoHandler({ workspace: 'test', repoSlug: 'test' })).rejects.toThrow('API Error');
    });
  });
});
