import { summary as summarizer } from '@actions/core';
// @ts-expect-error since these are not exported
import type { Summary, SummaryTableRow } from '@actions/core/lib/summary';
import { Formatter } from './index.js';
import { Results } from './result.js';

/**
 * The default formatter for presenting linting results in a readable
 * GitHub Actions Summary.
 */
export default class DefaultFormatter implements Formatter {
  public async format(results: Results): Promise<void> {
    const summary = summarizer;
    summary.addHeading('Commit Lint Report', 2);
    this.formatSummary(results, summary);
    this.formatTable(results, summary);
    this.formatFooter(results, summary);
    await summary.write();
  }

  private formatSummary(results: Results, summary: Summary): void {
    summary
      .addRaw(
        `The following ${results.checkedCount} commits were analyzed as part of this push.`,
      )
      .addEOL()
      .addBreak()
      .addEOL();

    const errorCommitsCount = results.items.filter(
      (item) => item.errors.length > 0,
    ).length;
    const warningOnlyCommitsCount = results.items.filter(
      (item) => item.errors.length === 0 && item.warnings.length > 0,
    ).length;
    const cleanCommitsCount =
      results.checkedCount - errorCommitsCount - warningOnlyCommitsCount;

    const summaryLines = [
      cleanCommitsCount > 0 &&
        `🟢 ${cleanCommitsCount} commits passed commitlint checks and follow the conventional commit format.`,
      warningOnlyCommitsCount > 0 &&
        `🟡 ${warningOnlyCommitsCount} commit${warningOnlyCommitsCount > 1 ? 's have' : ' has'} warnings that should be reviewed.`,
      errorCommitsCount > 0 &&
        `🔴 ${errorCommitsCount} commit${errorCommitsCount > 1 ? 's' : ''} failed and must be corrected before merging.`,
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n');

    if (summaryLines) {
      summary.addRaw(summaryLines).addEOL();
    }
  }

  private formatTable(results: Results, summary: Summary): void {
    if (results.checkedCount === 0) {
      return;
    }

    const header: SummaryTableRow = [
      { data: 'Status', header: true },
      { data: 'SHA', header: true },
      { data: 'Message', header: true },
      { data: 'Notes', header: true },
    ];

    const rows: SummaryTableRow[] = results.items.map((item) => {
      const isError = item.errors.length > 0;
      const isWarning = !isError && item.warnings.length > 0;

      const status = isError ? '  🔴  ' : isWarning ? '  🟡  ' : '  🟢  ';
      const note = isError
        ? item.errors[0].message
        : isWarning
          ? item.warnings[0].message
          : '';
      const sha = `<code>${item.hash}</code>`;
      const message = `<code>${item.input.split('\n')[0].trim()}</code>`;

      return [status, sha, message, note];
    });

    summary.addTable([header, ...rows]);
  }

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
