import { describe, expect, jest, test } from '@jest/globals';
import { BothStrategy } from '../../src/strategies/both.js';
import { CommitsStrategy } from '../../src/strategies/commits.js';
import { PrTitleStrategy } from '../../src/strategies/pr-title.js';
import type { CommitToLint } from '../../src/types.js';
import type {
  LintTargetStrategy,
  StrategyContext,
} from '../../src/strategies/index.js';

describe('BothStrategy', () => {
  const strategy = new BothStrategy();

  test('returns [title, ...commits] when both are present', async () => {
    const commits: ReadonlyArray<CommitToLint> = [
      { hash: 'a1', message: 'feat: one' },
      { hash: 'b2', message: 'fix: two' },
    ];
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue(commits);

    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 42, title: 'feat: title' } },
    };
    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual([
      { hash: 'pr-42-title', message: 'feat: title' },
      { hash: 'a1', message: 'feat: one' },
      { hash: 'b2', message: 'fix: two' },
    ]);
    expect(fetchCommits).toHaveBeenCalledTimes(1);
  });

  test('returns just the commits when PR title is absent (push event)', async () => {
    const commits: ReadonlyArray<CommitToLint> = [
      { hash: 'c3', message: 'chore: only commits' },
    ];
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue(commits);

    const ctx: StrategyContext = { eventName: 'push', payload: {} };
    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual(commits);
    expect(fetchCommits).toHaveBeenCalledTimes(1);
  });

  test('returns just the title when commits are empty', async () => {
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue([]);

    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 7, title: 'feat: lone title' } },
    };
    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toEqual([
      { hash: 'pr-7-title', message: 'feat: lone title' },
    ]);
  });

  test('does not count the PR title towards commit-depth', async () => {
    const commits: ReadonlyArray<CommitToLint> = [
      { hash: 'a1', message: 'feat: one' },
      { hash: 'b2', message: 'fix: two' },
      { hash: 'c3', message: 'chore: three' },
    ];
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue(commits);

    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 1, title: 'feat: root' } },
    };
    const result = await strategy.resolve(ctx, fetchCommits);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      hash: 'pr-1-title',
      message: 'feat: root',
    });
  });

  test('returned array is frozen', async () => {
    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue([{ hash: 'a1', message: 'feat: one' }]);

    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 1, title: 'feat: x' } },
    };
    const result = await strategy.resolve(ctx, fetchCommits);

    expect(Object.isFrozen(result)).toBe(true);
  });

  test('delegates to injected sub-strategies via constructor', async () => {
    const prTitleResolve = jest.fn<LintTargetStrategy['resolve']>();
    prTitleResolve.mockResolvedValue([
      { hash: 'title-hash', message: 'from mock title' },
    ]);
    const commitsResolve = jest.fn<LintTargetStrategy['resolve']>();
    commitsResolve.mockResolvedValue([
      { hash: 'commit-hash', message: 'from mock commits' },
    ]);

    const prTitleMock: PrTitleStrategy = Object.assign(new PrTitleStrategy(), {
      resolve: prTitleResolve,
    });
    const commitsMock: CommitsStrategy = Object.assign(new CommitsStrategy(), {
      resolve: commitsResolve,
    });

    const composed = new BothStrategy(commitsMock, prTitleMock);

    const fetchCommits = jest.fn<() => Promise<ReadonlyArray<CommitToLint>>>();
    fetchCommits.mockResolvedValue([]);

    const ctx: StrategyContext = {
      eventName: 'pull_request',
      payload: { pull_request: { number: 1, title: 'feat: ignored' } },
    };
    const result = await composed.resolve(ctx, fetchCommits);

    expect(prTitleResolve).toHaveBeenCalledTimes(1);
    expect(commitsResolve).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { hash: 'title-hash', message: 'from mock title' },
      { hash: 'commit-hash', message: 'from mock commits' },
    ]);
  });
});
