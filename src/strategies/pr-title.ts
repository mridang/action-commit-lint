import type { CommitToLint } from '../types.js';
import type { LintTargetStrategy, StrategyContext } from './index.js';

/**
 * Lints only the pull request title read from the webhook payload. Does
 * not invoke the commit fetcher, so no GitHub API call is made on behalf
 * of this strategy. On events without a `pull_request` payload (push,
 * merge_group) it returns an empty list; the caller then triggers the
 * action's standard "No commits found to lint" failure path.
 *
 * The synthetic hash is shaped `pr-{number}-title` so it renders
 * distinctly from a real SHA in the job summary.
 *
 * Reads `payload.pull_request` directly from `WebhookPayload`. The
 * upstream type guarantees `number: number` when `pull_request` is
 * present, but `title` arrives via the `[key: string]: any` index
 * signature, so it is captured as `unknown` and runtime-checked before
 * use to keep `any` from leaking into the rest of the code.
 */
export class PrTitleStrategy implements LintTargetStrategy {
  /**
   * Builds a single-element list containing the pull request title as a
   * synthetic {@link CommitToLint}, or an empty list when the payload
   * has no usable PR title. Never invokes `fetchCommits`, so the
   * underlying GitHub API call is skipped entirely when this strategy
   * is selected.
   *
   * @param ctx Read-only context whose `payload.pull_request` is
   * inspected for `title`.
   * @returns A frozen list with one frozen item on PR events with a
   * non-empty title, otherwise a frozen empty list.
   */
  public async resolve(
    ctx: StrategyContext,
  ): Promise<ReadonlyArray<CommitToLint>> {
    const pr = ctx.payload.pull_request;
    if (pr === undefined || pr === null) {
      return Object.freeze<CommitToLint[]>([]);
    }
    const title: unknown = pr.title;
    if (typeof title !== 'string' || title.length === 0) {
      return Object.freeze<CommitToLint[]>([]);
    }
    const item: Readonly<CommitToLint> = Object.freeze({
      message: title,
      hash: `pr-${pr.number}-title`,
    });
    return Object.freeze<CommitToLint[]>([item]);
  }
}
