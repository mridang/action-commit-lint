import { describe, expect, jest, test } from '@jest/globals';
import { CommitsStrategy } from '../../src/strategies/commits.js';
import type { CommitToLint } from '../../src/types.js';
import type { StrategyContext } from '../../src/strategies/index.js';

describe('CommitsStrategy', () => {
  const strategy = new CommitsStrategy();

  test('delegates to fetchCommits and returns its result verbatim', async () => {
    const commits: ReadonlyArray<CommitToLint> = [
      { hash: 'a1', message: 'feat: one' },
      { hash: 'b2', message: 'fix: two' },
    ];
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue(commits);

    const ctx: StrategyContext = { eventName: 'push', payload: {} };
    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual(commits);
    expect(fetchCommits).toHaveBeenCalledTimes(1);
  });

  test('ignores payload.pull_request even when present', async () => {
    const commits: ReadonlyArray<CommitToLint> = [
      { hash: 'c3', message: 'chore: three' },
    ];
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue(commits);

    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: {
        pull_request: { number: 7, title: 'feat: from title' },
      },
    };
    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual(commits);
    expect(result).not.toContainEqual({
      hash: 'pr-7-title',
      message: 'feat: from title',
    });
  });

  test('returns an empty list when fetcher returns empty', async () => {
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue([]);

    const ctx: StrategyContext = { eventName: 'push', payload: {} };
    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual([]);
    expect(fetchCommits).toHaveBeenCalledTimes(1);
  });
});
