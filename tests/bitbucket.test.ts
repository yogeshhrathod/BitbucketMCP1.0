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
});
