import type { CommitToLint } from '../types.js';
import type { LintTargetStrategy, StrategyContext } from './index.js';

/**
 * Lints every commit returned by the event's fetcher. This is the default
 * behaviour and preserves backwards compatibility with workflows that do
 * not specify a `lint-strategy` input.
 */
export class CommitsStrategy implements LintTargetStrategy {
  /**
   * Invokes the supplied fetcher callback and returns its result
   * verbatim. Ignores the strategy context entirely; the event-specific
   * fetcher is the sole source of items.
   *
   * @param _ctx Unused; present to satisfy the {@link LintTargetStrategy}
   * contract.
   * @param fetchCommits Callback that produces the commits for the
   * current event (already depth-limited by `run()`).
   * @returns The commits returned by `fetchCommits`, unchanged.
   */
  public async resolve(
    _ctx: StrategyContext,
    fetchCommits: () => Promise<ReadonlyArray<CommitToLint>>,
  ): Promise<ReadonlyArray<CommitToLint>> {
    return fetchCommits();
  }
}
