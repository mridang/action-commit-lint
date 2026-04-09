import type { WebhookPayload } from '@actions/github/lib/interfaces.js';
import type { CommitToLint } from '../types.js';
import { CommitsStrategy } from './commits.js';
import { PrTitleStrategy } from './pr-title.js';
import { BothStrategy } from './both.js';

/**
 * The set of valid `lint-strategy` input values.
 */
export type LintStrategyName = 'commits' | 'pr-title' | 'both';

/**
 * Read-only context passed to every strategy. The payload is the raw
 * webhook payload from `@actions/github`; strategies are responsible for
 * narrowing any specific fields they consume.
 */
export interface StrategyContext {
  readonly eventName: string;
  readonly payload: Readonly<WebhookPayload>;
}

/**
 * Contract for a strategy that decides which items a run of the action
 * should lint. Strategies are orthogonal to the event-specific commit
 * fetchers: fetchers produce raw commits for the event, strategies turn
 * those commits (plus payload-derived items such as the PR title) into
 * the final list handed to the linter.
 *
 * Implementations may choose not to invoke the `fetchCommits` callback,
 * which avoids a GitHub API round-trip when the strategy has no use for
 * the fetched commits (e.g. `pr-title`).
 */
export interface LintTargetStrategy {
  /**
   * Produces the final list of items to lint for the current run.
   *
   * @param ctx Read-only context derived from the GitHub workflow run.
   * @param fetchCommits Lazily-evaluated callback that returns the
   * commits produced by the event-specific fetcher (already trimmed by
   * `commit-depth` if set). Implementations may choose not to invoke
   * the callback to skip the underlying API call.
   * @returns A frozen, read-only list of items handed to the linter. An
   * empty list triggers the action's "No commits found to lint" failure
   * path in `run()`.
   */
  resolve(
    ctx: StrategyContext,
    fetchCommits: () => Promise<ReadonlyArray<CommitToLint>>,
  ): Promise<ReadonlyArray<CommitToLint>>;
}

/**
 * Constructs a {@link LintTargetStrategy} for the given name. The caller
 * is responsible for validating the input value before invoking this
 * factory; all three valid names are handled exhaustively.
 *
 * @param name The parsed `lint-strategy` input value.
 * @returns A ready-to-use strategy instance.
 */
export function getLintStrategy(name: LintStrategyName): LintTargetStrategy {
  switch (name) {
    case 'commits':
      return new CommitsStrategy();
    case 'pr-title':
      return new PrTitleStrategy();
    case 'both':
      return new BothStrategy();
  }
}

export { CommitsStrategy, PrTitleStrategy, BothStrategy };
