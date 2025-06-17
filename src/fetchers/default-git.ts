/* eslint-disable testing-library/no-debugging-utils */
import { execSync } from 'child_process';
import { debug, error as coreError } from '@actions/core';
import { ICommitFetcher } from '../types.js';

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
  /**
   * Fetches commits from the local git repository using `execSync`.
   *
   * It executes `git log` with a specified format and parses the output.
   * The range of commits to fetch can be specified with the `commitRange`
   * parameter.
   *
   * @returns A promise that resolves to an array of {@link CommitToLint}
   * objects.
   * @throws If the `git log` command fails (e.g., if not in a git repository).
   */
  public async fetchCommits(): Promise<CommitToLint[]> {
    const command = `git log --pretty=format:"%H%x1E%s"`;
    debug(`Attempting to fetch commits via git log with command: "${command}"`);

    try {
      const stdout = execSync(command, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      if (!stdout) {
        debug('git log returned no output. No commits found.');
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

      debug(`Found ${commits.length} commits via git log.`);
      return commits;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const detailedError = `Failed to list commits using 'git log': ${errorMessage}`;
      coreError(detailedError);
      throw new Error(detailedError);
    }
  }
}
