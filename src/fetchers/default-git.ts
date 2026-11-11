/**
 * @file Commit fetcher that reads the commit history of the local git
 * repository, used for events that have no provider-specific payload.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { debug as debugLog, error as coreError } from '@actions/core';
import { ICommitFetcher } from '../types.js';

const execAsync = promisify(exec);

/**
 * Represents a commit that needs to be linted.
 */
interface CommitToLint {
  message: string;
  hash: string;
}

/**
 * Implements {@link ICommitFetcher} to retrieve commits from the local
 * git repository using the `git log` command.
 *
 * This fetcher is generic and relies on the local git environment rather
 * than a specific event payload from a provider like GitHub.
 */
export class GenericCommitFetcher implements ICommitFetcher<string> {
  /* eslint-disable jsdoc/check-tag-names -- jsdoc/check-tag-names does not recognise @rejects, which jsdoc/require-rejects requires */

  /**
   * Fetches commits from the local git repository using `git log`.
   *
   * It executes `git log` with a specified format and parses the output.
   * The range of commits to fetch can be specified with the `commitRange`
   * parameter.
   * @returns A promise that resolves to an array of {@link CommitToLint}
   * objects.
   * @throws If the `git log` command fails (e.g., if not in a git repository).
   * @rejects If the `git log` command fails (e.g., if not in a git repository).
   * @example
   * ```ts
   * const fetcher = new GenericCommitFetcher();
   * const commits = await fetcher.fetchCommits();
   * console.log(commits[0]?.hash, commits[0]?.message);
   * ```
   */
  public async fetchCommits(): Promise<CommitToLint[]> {
    const command = `git log --pretty=format:"%H%x1E%s"`;
    debugLog(
      `Attempting to fetch commits via git log with command: "${command}"`,
    );

    try {
      const { stdout } = await execAsync(command, {
        encoding: 'utf8',
      });

      if (!stdout) {
        debugLog('git log returned no output. No commits found.');
        return [];
      }

      const commits = stdout
        .trim()
        .split('\n')
        .map((line) => {
          const [hash, message] = line.split('\u001E');
          return {
            message: message?.trim() || '',
            hash: hash?.trim() || 'unknown_sha',
          };
        })
        .filter((commit) => commit.hash && commit.message);

      debugLog(`Found ${commits.length} commits via git log.`);
      return commits;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const detailedError = `Failed to list commits using 'git log': ${errorMessage}`;
      coreError(detailedError);
      throw new Error(detailedError);
    }
  }
  /* eslint-enable jsdoc/check-tag-names -- closes the @rejects exemption above */
}
