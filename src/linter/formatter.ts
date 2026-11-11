/**
 * @file Default formatter that writes the lint results to the GitHub Actions
 * job summary.
 */
import { summary as summarizer } from '@actions/core';
// @ts-expect-error since these are not exported
import type { Summary, SummaryTableRow } from '@actions/core/lib/summary';
import { Formatter } from './index.js';
import { Results } from './result.js';

const ICON_BASE_URL =
  'https://raw.githubusercontent.com/mridang/action-commit-lint/refs/heads/master/res';

/**
 * Returns the status icon image tag for a commit, based on whether it has
 * errors, only warnings, or neither.
 * @param isError - Whether the commit has at least one error.
 * @param isWarning - Whether the commit has warnings but no errors.
 * @returns An HTML image tag pointing at the matching icon.
 * @example
 * ```ts
 * const icon = statusIcon(false, true); // the warning icon
 * ```
 */
function statusIcon(isError: boolean, isWarning: boolean): string {
  if (isError) {
    return `<img src="${ICON_BASE_URL}/cross.svg" width="18">`;
  }
  if (isWarning) {
    return `<img src="${ICON_BASE_URL}/warn.svg" width="18">`;
  }
  return `<img src="${ICON_BASE_URL}/check.svg" width="18">`;
}

/**
 * The default formatter for presenting linting results in a readable
 * GitHub Actions Summary.
 */
export default class DefaultFormatter implements Formatter {
  /**
   * Writes the complete lint report to the GitHub Actions job summary.
   * @param results - The lint results to render.
   * @example
   * ```ts
   * await new DefaultFormatter().format(results);
   * ```
   */
  public async format(results: Results): Promise<void> {
    const summary = summarizer;
    summary.addHeading('Commit Lint Report', 2);
    this.formatSummary(results, summary);
    this.formatTable(results, summary);
    this.formatFooter(results, summary);
    await summary.write();
  }

  /**
   * Adds the one-paragraph overview of how many commits passed, warned or
   * failed.
   * @param results - The lint results to summarise.
   * @param summary - The job summary to write into.
   * @example
   * ```ts
   * this.formatSummary(results, summary);
   * ```
   */
  private formatSummary(results: Results, summary: Summary): void {
    const errorCommitsCount = results.errorCommitsCount;
    const warningOnlyCommitsCount = results.items.filter(
      (item) => item.errors.length === 0 && item.warnings.length > 0,
    ).length;
    const cleanCommitsCount =
      results.checkedCount - errorCommitsCount - warningOnlyCommitsCount;

    const headlineNoun =
      results.checkedCount === 1 ? 'message was' : 'messages were';
    const cleanNoun = cleanCommitsCount === 1 ? 'message' : 'messages';
    const cleanVerb = cleanCommitsCount === 1 ? 'follows' : 'follow';
    const warnNoun =
      warningOnlyCommitsCount === 1 ? 'message has' : 'messages have';
    const errorNoun = errorCommitsCount === 1 ? 'message' : 'messages';
    const summaryLines = [
      `The following ${results.checkedCount} ${headlineNoun} analyzed.`,
      cleanCommitsCount > 0 &&
        `${cleanCommitsCount} ${cleanNoun} passed commitlint checks and ${cleanVerb} the conventional commit format.`,
      warningOnlyCommitsCount > 0 &&
        `${warningOnlyCommitsCount} ${warnNoun} warnings that should be reviewed.`,
      errorCommitsCount > 0 &&
        `${errorCommitsCount} ${errorNoun} failed and must be corrected.`,
    ]
      .filter((line): line is string => typeof line === 'string')
      .join(' ');

    summary.addRaw(summaryLines).addEOL().addBreak().addBreak();
  }

  /**
   * Adds the per-commit table with status, hash, message and first note.
   * Writes nothing when there are no results.
   * @param results - The lint results to tabulate.
   * @param summary - The job summary to write into.
   * @example
   * ```ts
   * this.formatTable(results, summary);
   * ```
   */
  private formatTable(results: Results, summary: Summary): void {
    if (results.checkedCount === 0) {
      return;
    }

    const header: SummaryTableRow = [
      { data: 'Status', header: true },
      { data: 'ID', header: true },
      { data: 'Message', header: true },
      { data: 'Notes', header: true },
    ];

    const rows: SummaryTableRow[] = results.items.map((item) => {
      const isError = item.errors.length > 0;
      const isWarning = !isError && item.warnings.length > 0;

      // noinspection HtmlRequiredAltAttribute
      const status = statusIcon(isError, isWarning);
      const notes = isError ? item.errors : item.warnings;
      const note = notes.length > 0 ? notes[0].message : '';
      const sha = `<code>${item.hash}</code>`;
      const message = `<code>${item.input.split('\n', 1)[0].trim()}</code>`;

      return [status, sha, message, note];
    });

    summary.addTable([header, ...rows]);
  }

  /**
   * Adds the separator, the help link to the Conventional Commits
   * specification and a tip on fixing commits locally.
   * @param results - The lint results, used for the help URL.
   * @param summary - The job summary to write into.
   * @example
   * ```ts
   * this.formatFooter(results, summary);
   * ```
   */
  private formatFooter(results: Results, summary: Summary): void {
    const helpUrl =
      results.helpUrl || 'https://www.conventionalcommits.org/en/v1.0.0/';

    summary.addSeparator();
    summary
      .addRaw('For help fixing your commit messages, see the ')
      .addLink('Conventional Commits specification', helpUrl)
      .addRaw(
        '. The Conventional Commits specification is a lightweight convention on top of commit messages. It provides an easy set of rules for creating an explicit commit history; which makes it easier to write automated tools on top of. This convention dovetails with SemVer, by describing the features, fixes, and breaking changes made in commit messages.',
      )
      .addEOL()
      .addEOL();
    summary.addQuote(
      `💡 Tip: Use \`git commit --amend\` or \`git rebase -i\` to fix commits locally.`,
    );
  }
}
