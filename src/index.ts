/**
 * @file The action's main logic: reads the action inputs, loads the
 * commitlint configuration, fetches the commits for the event, lints them and
 * reports the outcome.
 */
import {
  debug as debugLog,
  endGroup,
  error as coreError,
  getInput,
  info,
  notice,
  setFailed as actionFailed,
  startGroup,
  warning,
} from '@actions/core';
import { cosmiconfig, type CosmiconfigResult } from 'cosmiconfig';
import type { CommitToLint, ICommitFetcher } from './types.js';

import { Linter } from './linter/index.js';
import { createLoaders } from './loaders.js';
import { context } from '@actions/github';
import getCommitFetcher from './fetchers/index.js';
import DefaultFormatter from './linter/formatter.js';
import type { Results } from './linter/result.js';
import path from 'node:path';

const Context = context.constructor as new () => typeof context;
import {
  getLintStrategy as makeLintStrategy,
  type LintStrategyName,
} from './strategies/index.js';

/**
 * Retrieves the 'commit-depth' input.
 * @returns The commit depth as a number, or `null`.
 * @example
 * ```ts
 * // With the input commit-depth set to "5", returns 5.
 * const depth = getCommitDepth();
 * ```
 */
function getCommitDepth(): number | null {
  const commitDepthString = getInput('commit-depth');
  if (!commitDepthString?.trim()) return null;
  const depth = Number.parseInt(commitDepthString, 10);
  return Number.isNaN(depth) ? null : Math.max(depth, 0);
}

/**
 * Retrieves the GitHub token from the action's 'github-token' input.
 * @returns The GitHub token.
 * @throws {Error} If the 'github-token' input is empty.
 * @example
 * ```ts
 * const token = getGithubToken();
 * ```
 */
function getGithubToken(): string {
  const token = getInput('github-token', { required: true }).trim();
  if (token) {
    return token;
  } else {
    throw new Error('The "github-token" input must not be empty.');
  }
}

/**
 * Retrieves the boolean value for the 'allow-force-install' input.
 * @returns `true` if 'allow-force-install' is 'true' or empty, `false` if 'false'.
 * @throws {Error} If the 'allow-force-install' input is an invalid value.
 * @example
 * ```ts
 * const allowForce = getAllowForceInstall();
 * ```
 */
function getAllowForceInstall(): boolean {
  const raw = getInput('allow-force-install').trim().toLowerCase();
  if (raw === 'true') {
    return true;
  } else if (raw === 'false' || raw === '') {
    return false;
  } else {
    throw new Error(
      'Invalid value for "allow-force-install". Use "true" or "false".',
    );
  }
}

/**
 * Retrieves the boolean value for the 'fail-on-warnings' input.
 * This input defaults to `false` if not provided.
 * @returns Returns `true` if the input is 'true', and `false` if empty or 'false'.
 * @throws {Error} If the input is not 'true', 'false', or empty.
 * @example
 * ```ts
 * const failOnWarnings = getFailOnWarnings();
 * ```
 */
function getFailOnWarnings(): boolean {
  const raw = getInput('fail-on-warnings').trim().toLowerCase();
  if (raw === 'true') {
    return true;
  } else if (raw === 'false' || raw === '') {
    return false;
  } else {
    throw new Error(
      `Invalid value for "fail-on-warnings". Expected 'true' or 'false', but received '${raw}'.`,
    );
  }
}

/**
 * Retrieves the boolean value for the 'fail-on-errors' input.
 * This input defaults to `true` if not provided.
 * @returns Returns `false` if the input is 'false', and `true` if empty or 'true'.
 * @throws {Error} If the input is not 'true', 'false', or empty.
 * @example
 * ```ts
 * const failOnErrors = getFailOnErrors();
 * ```
 */
function getFailOnErrors(): boolean {
  const raw = getInput('fail-on-errors').trim().toLowerCase();
  if (raw === 'false') {
    return false;
  } else if (raw === 'true' || raw === '') {
    return true;
  } else {
    throw new Error(
      `Invalid value for "fail-on-errors". Expected 'true' or 'false', but received '${raw}'.`,
    );
  }
}

/**
 * Retrieves the 'help-url' input.
 * @returns The help URL string.
 * @example
 * ```ts
 * const helpUrl = getHelpURL();
 * ```
 */
function getHelpURL(): string {
  return getInput('help-url');
}

/**
 * Retrieves the 'lint-strategy' input and narrows it to a
 * {@link LintStrategyName}. Empty input defaults to `'commits'` to
 * preserve backwards compatibility.
 * @returns The parsed strategy name.
 * @throws {Error} If the input is set to a value other than
 * `'commits'`, `'pr-title'`, `'both'`, or the empty string.
 * @example
 * ```ts
 * const strategy = getLintStrategy();
 * ```
 */
function getLintStrategy(): LintStrategyName {
  const raw = getInput('lint-strategy').trim().toLowerCase();
  switch (raw) {
    case '':
    case 'commits': {
      return 'commits';
    }
    case 'pr-title': {
      return 'pr-title';
    }
    case 'both': {
      return 'both';
    }
    default: {
      throw new Error(
        `Invalid value for "lint-strategy". Expected 'commits', 'pr-title', or 'both', but received '${raw}'.`,
      );
    }
  }
}

/**
 * Retrieves the working directory from the action's 'working-directory' input.
 * @returns The specified working directory or the current process's
 * working directory if the input is empty.
 * @example
 * ```ts
 * const dir = getWorkingDirectory();
 * ```
 */
function getWorkingDirectory(): string {
  const dir = getInput('working-directory').trim();
  return dir || process.cwd();
}

/**
 * Sets the action's failure status with a given message.
 * In a JEST test environment, it throws an error instead of calling
 * `actionFailed`.
 * @param message - The error message or Error object.
 * @throws {Error} The message, when running inside a JEST test environment.
 * @example
 * ```ts
 * setFailed('No commits found to lint.');
 * ```
 */
function setFailed(message: string | Error): void {
  if (process.env.JEST_WORKER_ID) {
    throw message instanceof Error ? message : new Error(message);
  } else {
    actionFailed(message);
  }
}

/**
 * Writes one annotation line per error and warning of every linted commit,
 * so the reason for each failure appears in the job log.
 * @param lintResults - The aggregated results of the lint run.
 * @example
 * ```ts
 * logItemAnnotations(results);
 * ```
 */
function logItemAnnotations(lintResults: Results): void {
  for (const item of lintResults.items) {
    const head = item.input.split('\n', 1)[0].trim();
    for (const e of item.errors) {
      coreError(`${item.hash} ${head} — ${e.message}`);
    }
    for (const w of item.warnings) {
      warning(`${item.hash} ${head} — ${w.message}`);
    }
  }
}

/**
 * Marks the action as failed or warns, depending on the lint outcome and the
 * 'fail-on-errors' and 'fail-on-warnings' inputs.
 * @param lintResults - The aggregated results of the lint run.
 * @param failOnErrs - Whether commit errors should fail the action.
 * @param failOnWarns - Whether commit warnings should fail the action.
 * @example
 * ```ts
 * reportOutcome(results, true, false);
 * ```
 */
function reportOutcome(
  lintResults: Results,
  failOnErrs: boolean,
  failOnWarns: boolean,
): void {
  if (lintResults.hasErrors) {
    if (failOnErrs) {
      setFailed(
        `Found ${lintResults.errorCommitsCount} commit message${lintResults.errorCommitsCount === 1 ? '' : 's'} with errors`,
      );
    } else {
      warning(`Commit messages have errors, but 'fail-on-errors' is false.`);
    }
  } else if (lintResults.hasOnlyWarnings) {
    if (failOnWarns) {
      setFailed(
        `Found ${lintResults.warningCommitsCount} commit message${lintResults.warningCommitsCount === 1 ? '' : 's'} with warnings`,
      );
    } else {
      warning(
        `Commit messages have warnings, but 'fail-on-warnings' is false.`,
      );
    }
  } else {
    info(
      `All ${lintResults.checkedCount} commit message${lintResults.checkedCount === 1 ? ' is' : 's are'} okay.`,
    );
  }
}


/**
 * Lints the given commits with the configuration file, publishes the report
 * and reports the outcome inside a log group.
 * @param commitsToLint - The commits or items to lint.
 * @param configPath - The absolute path of the commitlint configuration file.
 * @param helpUrl - The help URL shown in the report, or an empty string.
 * @param workingDirectory - The directory used to resolve the configuration.
 * @rejects If the configuration cannot be loaded or linting fails.
 * @example
 * ```ts
 * await lintAndReport(commits, '/repo/commitlint.config.js', '', '/repo');
 * ```
 */
async function lintAndReport(
  commitsToLint: ReadonlyArray<CommitToLint>,
  configPath: string,
  helpUrl: string,
  workingDirectory: string,
): Promise<void> {
  startGroup('Running commit-lint');
  const failOnWarns = getFailOnWarnings();
  const failOnErrs = getFailOnErrors();

  const linter = new Linter(
    commitsToLint,
    configPath,
    helpUrl,
    workingDirectory,
  );
  const result1 = await linter.lint();

  await result1.format(new DefaultFormatter());

  // Surface the per-commit reason in the log (and as annotations),
  // not just the aggregate count emitted by setFailed below. The
  // detailed table is already written to the job summary, but that
  // lives on a separate tab; emitting one line per failing commit
  // here puts the reason where the log is actually read. GitHub
  // renders at most ~10 annotations of each level per step, but the
  // remaining lines still appear in the log output.
  logItemAnnotations(result1);
  reportOutcome(result1, failOnErrs, failOnWarns);
  endGroup();
}

/**
 * Checks that cosmiconfig found a usable, non-empty configuration file.
 * @param result - The result of the cosmiconfig search, or `null`.
 * @throws {Error} If no configuration was found, it is not an object, or it is empty.
 * @example
 * ```ts
 * assertUsableConfig(await explorer.search(workingDirectory));
 * ```
 */
function assertUsableConfig(
  result: CosmiconfigResult,
): asserts result is NonNullable<CosmiconfigResult> {
  if (result === null) {
    throw new Error('No configuration file found.');
  }
  if (
    typeof result.config !== 'object' ||
    result.config === null ||
    !result.filepath
  ) {
    throw new Error('Invalid commit-lint configuration.');
  }
  if (result.isEmpty) {
    throw new Error(`Configuration file "${result.filepath}" is empty.`);
  }
}

/**
 * The main entry point for the action.
 * @param ghCtx - The GitHub context, defaults to a new Context().
 * @param commitFetcherFactory - An optional factory function that returns a
 * commit fetcher. Used for testing. Defaults to the real implementation.
 * @returns A promise that resolves once the action has finished, with `undefined`.
 * @example
 * ```ts
 * await run();
 * ```
 */
export async function run(
  ghCtx = new Context(),
  commitFetcherFactory: (event: string) => ICommitFetcher | null = (
    event: string,
  ) => getCommitFetcher(event),
): Promise<string | void> {
  try {
    const workingDirectory: string = getWorkingDirectory();
    if (process.env.JEST_WORKER_ID === undefined) {
      const absoluteWorkingDirectory = path.resolve(workingDirectory);
      const projectNodeModules = path.join(
        absoluteWorkingDirectory,
        'node_modules',
      );

      info(`Adding ${projectNodeModules} to Node.js module search path.`);
      // The bundled build runs as CommonJS, so the project's node_modules must be added to its module search path.
      // eslint-disable-next-line unicorn/prefer-module -- module.paths is the only way to extend the CommonJS search path
      module.paths.push(projectNodeModules);
      // eslint-disable-next-line unicorn/prefer-module -- module.paths is the only way to extend the CommonJS search path
      debugLog(`Module search paths now: ${module.paths.join(', ')}`);
    }

    const helpUrl = getHelpURL();
    const commitDepth = getCommitDepth();
    const githubToken = getGithubToken();

    debugLog(`Current working directory: ${workingDirectory}`);
    const explorer = cosmiconfig('commitlint', {
      loaders: createLoaders(getAllowForceInstall()),
    });

    const result = await explorer.search(workingDirectory);
    assertUsableConfig(result);

    info(`Fetching commits for event: ${ghCtx.eventName}`);
    const commitFetcher = commitFetcherFactory(ghCtx.eventName);
    if (!commitFetcher) {
      setFailed(`No suitable commit fetcher found for event.`);
      return;
    }

    const lintStrategyName = getLintStrategy();
    if (lintStrategyName === 'pr-title' && !ghCtx.payload.pull_request) {
      notice(
        `lint-strategy=pr-title: event '${ghCtx.eventName}' has no pull request in its payload, skipping. This is expected on events without a pull request context (e.g. 'push' fired after a squash-merge lands on the default branch, or 'merge_group' from the merge queue).`,
      );
      return;
    }

    const strategy = makeLintStrategy(lintStrategyName);

    const fetchAndLimit = async (): Promise<ReadonlyArray<CommitToLint>> => {
      const all = await commitFetcher.fetchCommits(
        githubToken,
        ghCtx.repo.owner,
        ghCtx.repo.repo,
        ghCtx.payload,
      );
      return commitDepth && all.length > commitDepth
        ? all.slice(0, commitDepth)
        : all;
    };

    const commitsToLint = await strategy.resolve(
      { eventName: ghCtx.eventName, payload: ghCtx.payload },
      fetchAndLimit,
    );

    if (commitsToLint.length === 0) {
      setFailed('No commits found to lint.');
      return;
    }

    await lintAndReport(
      commitsToLint,
      result.filepath,
      helpUrl,
      workingDirectory,
    );
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error);
    } else {
      setFailed(error as unknown as string);
    }
  }
}
