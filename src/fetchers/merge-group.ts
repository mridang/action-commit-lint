/**
 * @file Commit fetcher for GitHub `merge_group` events, which lints the head
 * commit of the merge queue entry.
 */
import type {
  CommitToLint,
  ICommitFetcher,
  MergeGroupEventPayloadSubset,
  OctokitInstance,
} from '../types.js';
import { warning, debug as debugLog } from '@actions/core';

/**
 * Implements {@link ICommitFetcher} to retrieve the head commit from a GitHub
 * `merge_group` event. It expects a subset of the `MergeGroupEvent` payload.
 */
export class MergeGroupCommitFetcher implements ICommitFetcher<MergeGroupEventPayloadSubset> {
  /**
   * Fetches the head commit from a `merge_group` event payload subset.
   * @param _token - The GitHub token for API authentication.
   * @param _owner - The owner of the repository.
   * @param _repo - The name of the repository.
   * @param eventPayloadSubset - A subset of the GitHub `MergeGroupEvent`
   * payload, containing the `merge_group` object with `head_sha` and
   * `head_commit`.
   * @returns A promise that resolves to an array containing a single
   * {@link CommitToLint} object for the head commit, or an empty array if the
   * required information is not present in the payload subset.
   * @example
   * ```ts
   * const fetcher = new MergeGroupCommitFetcher();
   * const commits = await fetcher.fetchCommits('', '', '', {
   *   merge_group: { head_sha: 'abc123', head_commit: { message: 'feat: x' } },
   * });
   * ```
   */
  public async fetchCommits(
    _token: string | OctokitInstance,
    _owner: string,
    _repo: string,
    eventPayloadSubset: MergeGroupEventPayloadSubset,
  ): Promise<CommitToLint[]> {
    const mergeGroup = eventPayloadSubset.merge_group;
    debugLog(
      `Merge group event payload subset merge_group object: ${JSON.stringify(mergeGroup)}`,
    );

    if (mergeGroup?.head_commit?.message && mergeGroup?.head_sha) {
      debugLog(`Found head commit for merge group: SHA ${mergeGroup.head_sha}`);
      return [
        {
          message: mergeGroup.head_commit.message,
          hash: mergeGroup.head_sha,
        },
      ];
    }

    warning(
      'Merge group payload subset did not contain expected head_commit information (merge_group.head_commit.message and merge_group.head_sha).',
    );
    return [];
  }
}
