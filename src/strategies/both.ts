import type { CommitToLint } from '../types.js';
import type { LintTargetStrategy, StrategyContext } from './index.js';
import { CommitsStrategy } from './commits.js';
import { PrTitleStrategy } from './pr-title.js';

/**
 * Lints the pull request title and every commit. Composes
 * {@link PrTitleStrategy} and {@link CommitsStrategy} and concatenates
 * their results with the title first.
 *
 * Gracefully degrades on events without a `pull_request` payload: the
 * title half yields an empty list and the commits half returns whatever
 * the fetcher provides, so this strategy is equivalent to `commits` on
 * push and merge_group events.
 *
 * The PR title is never trimmed by `commit-depth`; depth is applied to
 * the commits inside the `fetchCommits` callback passed from `run()`,
 * and the title is prepended afterwards.
 */
export class BothStrategy implements LintTargetStrategy {
  private readonly commits: LintTargetStrategy;
  private readonly prTitle: LintTargetStrategy;

  /**
   * Constructs the composite strategy. Both sub-strategies have sensible
   * defaults; the parameters exist primarily so unit tests can inject
   * mocks and verify delegation.
   *
   * @param commits Strategy used to resolve the commit half of the
   * result. Defaults to a fresh {@link CommitsStrategy}.
   * @param prTitle Strategy used to resolve the title half of the
   * result. Defaults to a fresh {@link PrTitleStrategy}.
   */
  constructor(
    commits: LintTargetStrategy = new CommitsStrategy(),
    prTitle: LintTargetStrategy = new PrTitleStrategy(),
  ) {
    this.commits = commits;
    this.prTitle = prTitle;
  }

  /**
   * Resolves both halves in parallel and concatenates them, title first.
   * The two sub-strategies are invoked with the same `fetchCommits`
   * callback; in practice only the commit sub-strategy actually calls
   * it, so the underlying fetch happens at most once per `resolve()`.
   *
   * @param ctx Read-only context forwarded to both sub-strategies.
   * @param fetchCommits Callback that produces the commits for the
   * current event (already depth-limited by `run()`).
   * @returns A frozen list shaped `[title, ...commits]`. On non-PR
   * events the title half yields nothing, so the result equals the
   * commits the fetcher returned.
   */
  public async resolve(
    ctx: StrategyContext,
    fetchCommits: () => Promise<ReadonlyArray<CommitToLint>>,
  ): Promise<ReadonlyArray<CommitToLint>> {
    const [titleItems, commitItems] = await Promise.all([
      this.prTitle.resolve(ctx, fetchCommits),
      this.commits.resolve(ctx, fetchCommits),
    ]);
    return Object.freeze<CommitToLint[]>([...titleItems, ...commitItems]);
  }
}
