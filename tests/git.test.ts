import { describe, it, expect } from 'vitest';
import { parseBitbucketRemote } from '../src/git.js';

describe('parseBitbucketRemote', () => {
  it('parses ssh remote', () => {
    const r = parseBitbucketRemote('git@bitbucket.org:myteam/my-repo.git');
    expect(r.host).toBe('bitbucket.org');
    expect(r.workspace).toBe('myteam');
    expect(r.repoSlug).toBe('my-repo');
  });

  it('parses https remote without user', () => {
    const r = parseBitbucketRemote('https://bitbucket.org/myteam/my-repo.git');
    expect(r.host).toBe('bitbucket.org');
    expect(r.workspace).toBe('myteam');
    expect(r.repoSlug).toBe('my-repo');
  });

  it('parses https remote with user', () => {
    const r = parseBitbucketRemote('https://user@bitbucket.org/myteam/my-repo');
    expect(r.host).toBe('bitbucket.org');
    expect(r.workspace).toBe('myteam');
    expect(r.repoSlug).toBe('my-repo');
  });
});
