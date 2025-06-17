import { GenericCommitFetcher } from '../../src/fetchers/default-git.js';

describe('GenericCommitFetcher (real git repo)', () => {
  it('fetches commits from the current repository', async () => {
    const fetcher = new GenericCommitFetcher();
    const commits = await fetcher.fetchCommits();

    expect(Array.isArray(commits)).toBe(true);
    expect(commits.length).toBeGreaterThan(0);

    for (const c of commits) {
      expect(typeof c.hash).toBe('string');
      expect(c.hash).not.toHaveLength(0);

      expect(typeof c.message).toBe('string');
      expect(c.message).not.toHaveLength(0);
    }
  });
});
