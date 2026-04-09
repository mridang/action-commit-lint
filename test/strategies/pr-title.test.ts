import { describe, expect, jest, test } from '@jest/globals';
import { PrTitleStrategy } from '../../src/strategies/pr-title.js';
import type { CommitToLint } from '../../src/types.js';
import type { StrategyContext } from '../../src/strategies/index.js';

describe('PrTitleStrategy', () => {
  const strategy = new PrTitleStrategy();

  const makeFetcher = () => {
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockImplementation(() => {
      throw new Error(
        'PrTitleStrategy must not invoke fetchCommits (no API call allowed)',
      );
    });
    return fetchCommits;
  };

  test('returns a single frozen item with the PR title', async () => {
    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 42, title: 'feat: hello world' } },
    };
    const fetchCommits = makeFetcher();

    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual([
      { hash: 'pr-42-title', message: 'feat: hello world' },
    ]);
    expect(fetchCommits).toHaveBeenCalledTimes(0);
  });

  test('never calls fetchCommits', async () => {
    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 1, title: 'fix: bug' } },
    };
    const fetchCommits = makeFetcher();

    await strategy.resolve(ctx, fetchCommits);

    expect(fetchCommits).not.toHaveBeenCalled();
  });

  test('returns an empty list when payload.pull_request is missing', async () => {
    const ctx: StrategyContext = { eventName: 'push', payload: {} };
    const fetchCommits = makeFetcher();

    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual([]);
    expect(fetchCommits).not.toHaveBeenCalled();
  });

  test('returns an empty list when PR title is an empty string', async () => {
    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 5, title: '' } },
    };
    const fetchCommits = makeFetcher();

    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual([]);
  });

  test('returns an empty list when PR title is not a string', async () => {
    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 5 } },
    };
    const fetchCommits = makeFetcher();

    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual([]);
  });

  test('returned array and items are frozen', async () => {
    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 99, title: 'feat: immutable' } },
    };
    const fetchCommits = makeFetcher();

    const result = await strategy.resolve(ctx, fetchCommits);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });

  test('empty-path result is also frozen', async () => {
    const ctx: StrategyContext = { eventName: 'push', payload: {} };
    const fetchCommits = makeFetcher();

    const result = await strategy.resolve(ctx, fetchCommits);

    expect(Object.isFrozen(result)).toBe(true);
  });
});
