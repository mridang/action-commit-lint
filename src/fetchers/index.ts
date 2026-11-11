/**
 * @file Chooses the commit fetcher that matches the GitHub event being linted.
 */
import { MergeGroupCommitFetcher } from './merge-group.js';
import { PullRequestCommitFetcher } from './pull-request.js';
import { PushEventCommitFetcher } from './push-event.js';
import { ICommitFetcher } from '../types.js';
import { GenericCommitFetcher } from './default-git.js';

/**
 * Selects and returns the appropriate commit fetcher based on the event name.
 * @param eventName - The name of the current GitHub event.
 * @returns An instance of {@link ICommitFetcher} or `null`.
 * @example
 * ```ts
 * const fetcher = getCommitFetcher('pull_request');
 * const commits = await fetcher?.fetchCommits(token, owner, repo, payload);
 * ```
 */
export default function getCommitFetcher(
  eventName: string | undefined,
): ICommitFetcher | null {
  switch (eventName) {
    case 'merge_group': {
      return new MergeGroupCommitFetcher();
    }
    case 'pull_request':
    case 'pull_request_target': {
      return new PullRequestCommitFetcher();
    }
    case 'push': {
      return new PushEventCommitFetcher();
    }
    default: {
      return new GenericCommitFetcher();
    }
  }
}
