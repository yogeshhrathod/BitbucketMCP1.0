import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { BitbucketClient } from '../src/bitbucket.js';

describe('BitbucketClient', () => {
  const baseUrl = 'https://api.bitbucket.org/2.0';
  const client = new BitbucketClient({ email: 'user@example.com', token: 'apitoken', baseUrl });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('gets repo', async () => {
    nock(baseUrl)
      .get('/repositories/ws/repo')
      .reply(200, { slug: 'repo', full_name: 'ws/repo' });

    const r = await client.getRepo('ws', 'repo');
    expect((r as any).slug).toBe('repo');
  });

  it('lists PRs', async () => {
    nock(baseUrl)
      .get('/repositories/ws/repo/pullrequests')
      .query({ state: 'OPEN' })
      .reply(200, { values: [] });

    const r = await client.listPullRequests('ws', 'repo', 'OPEN');
    expect((r as any).values).toBeDefined();
  });

  describe('getPullRequestDiffFile', () => {
    it('gets per-file diff for Cloud', async () => {
      // Mock PR details to get commit hashes
      nock(baseUrl)
        .get('/repositories/ws/repo/pullrequests/123')
        .reply(200, {
          id: 123,
          source: { commit: { hash: 'abc123' } },
          destination: { commit: { hash: 'def456' } },
        });

      // Mock diff request
      nock(baseUrl)
        .get('/repositories/ws/repo/diff/abc123..def456')
        .query({ path: 'src/file.js', context: '3', topic: 'true' })
        .reply(200, 'diff content here');

      const result = await client.getPullRequestDiffFile('ws', 'repo', 123, 'src/file.js', 3);
      expect(result.pull_request_id).toBe(123);
      expect(result.file_path).toBe('src/file.js');
      expect(result.diff).toBe('diff content here');
      expect(result.truncated).toBe(false);
    });

    it('handles file not found gracefully', async () => {
      nock(baseUrl)
        .get('/repositories/ws/repo/pullrequests/123')
        .reply(200, {
          id: 123,
          source: { commit: { hash: 'abc123' } },
          destination: { commit: { hash: 'def456' } },
        });

      nock(baseUrl)
        .get('/repositories/ws/repo/diff/abc123..def456')
        .query({ path: 'missing.js', context: '3', topic: 'true' })
        .reply(404);

      const result = await client.getPullRequestDiffFile('ws', 'repo', 123, 'missing.js', 3);
      expect(result.diff).toBeNull();
      expect(result.message).toBe('File not found in repository');
    });

    it('rejects path traversal attempts', async () => {
      await expect(
        client.getPullRequestDiffFile('ws', 'repo', 123, '../../../etc/passwd', 3)
      ).rejects.toThrow('path traversal');
    });

    it('rejects empty file path', async () => {
      await expect(
        client.getPullRequestDiffFile('ws', 'repo', 123, '', 3)
      ).rejects.toThrow('file_path parameter cannot be empty');
    });
  });

  describe('createTaskWithInlineComment', () => {
    it('creates inline comment with task on Cloud', async () => {
      // Mock comment creation
      nock(baseUrl)
        .post('/repositories/ws/repo/pullrequests/123/comments', {
          content: { raw: 'Fix this issue' },
          inline: { to: 42, path: 'src/file.js' },
        })
        .reply(200, { id: 999 });

      // Mock task creation
      nock(baseUrl)
        .post('/repositories/ws/repo/pullrequests/123/tasks', {
          content: { raw: 'Fix this issue' },
          comment: { id: 999 },
        })
        .reply(200, { id: 888 });

      const result = await client.createTaskWithInlineComment(
        'ws',
        'repo',
        123,
        'src/file.js',
        42,
        'ADDED',
        'Fix this issue'
      );

      expect(result.status).toBe('success');
      expect(result.comment_id).toBe(999);
      expect(result.task_id).toBe(888);
      expect(result.file_path).toBe('src/file.js');
      expect(result.line_number).toBe(42);
    });

    it('handles partial success when task creation fails', async () => {
      // Mock comment creation
      nock(baseUrl)
        .post('/repositories/ws/repo/pullrequests/123/comments')
        .reply(200, { id: 999 });

      // Mock task creation failure
      nock(baseUrl)
        .post('/repositories/ws/repo/pullrequests/123/tasks')
        .reply(403, { error: 'Forbidden' });

      const result = await client.createTaskWithInlineComment(
        'ws',
        'repo',
        123,
        'src/file.js',
        42,
        'ADDED',
        'Fix this issue'
      );

      expect(result.status).toBe('partial');
      expect(result.comment_id).toBe(999);
      expect(result.task_id).toBeNull();
      if (result.status === 'partial') {
        expect(result.task_error).toBeDefined();
      }
    });

    it('validates line type', async () => {
      await expect(
        client.createTaskWithInlineComment(
          'ws',
          'repo',
          123,
          'src/file.js',
          42,
          'INVALID' as any,
          'Fix this'
        )
      ).rejects.toThrow('Invalid line_type');
    });
  });
});
