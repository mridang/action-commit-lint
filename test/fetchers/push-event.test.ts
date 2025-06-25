import nock from 'nock';
import { getOctokit } from '@actions/github';
import axios from 'axios';
import { PushEventCommitFetcher } from '../../src/fetchers/push-event.js';
import type {
  ActualPushEventCommit,
  OctokitInstance,
} from '../../src/types.js';
import { buildAxiosFetch } from './utils/nockios.js';

const createMinimalActualPushEventCommit = (
  id: string,
  message: string,
): ActualPushEventCommit => ({
  id,
  tree_id: `tree-${id}`,
  distinct: true,
  message,
  timestamp: new Date().toISOString(),
  url: `https://github.com/test-owner/test-repo/commit/${id}`,
  author: {
    name: 'Test Author',
    email: 'author@example.com',
    username: 'testauthor',
  },
  committer: {
    name: 'Test Committer',
    email: 'committer@example.com',
    username: 'testcommitter',
  },
  added: [],
  removed: [],
  modified: [],
});

beforeAll(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});

describe('PushEventCommitFetcher', () => {
  let octokit: OctokitInstance;
  const fetcher = new PushEventCommitFetcher();

  beforeEach(() => {
    octokit = getOctokit('fake-token', {
      baseUrl: 'https://api.github.com',
      request: {
        fetch: buildAxiosFetch(axios.create({})),
      },
    });
  });

  it('should fetch commits from payload for an initial push (expecting API call if fetcher logic changes)', async () => {
    const apiMockResponse = {
      commits: [
        { sha: 'commit1', commit: { message: 'Initial commit on new branch' } },
        { sha: 'commit2', commit: { message: 'Second commit on new branch' } },
      ],
    };

    nock('https://api.github.com')
      .matchHeader('accept', /application\/vnd\.github\.v3\+json/i)
      .get(
        `/repos/test-owner/test-repo/compare/0000000000000000000000000000000000000000...afterShaNewBranch`,
      )
      .query(true)
      .reply(200, apiMockResponse);

    const commits = await fetcher.fetchCommits(
      octokit,
      'test-owner',
      'test-repo',
      {
        before: '0000000000000000000000000000000000000000',
        after: 'afterShaNewBranch',
        commits: [
          createMinimalActualPushEventCommit(
            'commit1',
            'Initial commit on new branch',
          ),
          createMinimalActualPushEventCommit(
            'commit2',
            'Second commit on new branch',
          ),
        ],
      },
    );
    expect(commits).toEqual([
      { hash: 'commit1', message: 'Initial commit on new branch' },
      { hash: 'commit2', message: 'Second commit on new branch' },
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it('should fetch commits using compareCommits for a subsequent push', async () => {
    nock('https://api.github.com')
      .matchHeader('accept', /application\/vnd\.github\.v3\+json/i)
      .get(`/repos/test-owner/test-repo/compare/beforeSha123...afterSha456`)
      .query(true)
      .reply(200, {
        commits: [
          { sha: 'compareCommit1', commit: { message: 'Update A' } },
          { sha: 'compareCommit2', commit: { message: 'Fix B' } },
        ],
      });

    const commits = await fetcher.fetchCommits(
      octokit,
      'test-owner',
      'test-repo',
      {
        before: 'beforeSha123',
        after: 'afterSha456',
        commits: [],
      },
    );
    expect(commits).toEqual([
      { hash: 'compareCommit1', message: 'Update A' },
      { hash: 'compareCommit2', message: 'Fix B' },
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it('should return an empty array if compareCommits returns no commits', async () => {
    nock('https://api.github.com')
      .matchHeader('accept', /application\/vnd\.github\.v3\+json/i)
      .get(`/repos/test-owner/test-repo/compare/beforeSha789...afterSha101`)
      .query(true)
      .reply(200, { commits: [] });

    const commits = await fetcher.fetchCommits(
      octokit,
      'test-owner',
      'test-repo',
      {
        before: 'beforeSha789',
        after: 'afterSha101',
        commits: [],
      },
    );
    expect(commits).toEqual([]);
    expect(nock.isDone()).toBe(true);
  });

  it('should throw error if compareCommits fails', async () => {
    nock('https://api.github.com')
      .matchHeader('accept', /application\/vnd\.github\.v3\+json/i)
      .get(`/repos/test-owner/test-repo/compare/beforeShaFail...afterShaFail`)
      .query(true)
      .reply(500, { message: 'Server Error' });

    await expect(
      fetcher.fetchCommits(octokit, 'test-owner', 'test-repo', {
        before: 'beforeShaFail',
        after: 'afterShaFail',
        commits: [
          createMinimalActualPushEventCommit(
            'payloadFallback1',
            'Fallback commit 1',
          ),
        ],
      }),
    ).rejects.toThrow(/Failed to compare commits via API/);
    expect(nock.isDone()).toBe(true);
  });

  it('should use payload commits if before and after SHAs are identical', async () => {
    const commits = await fetcher.fetchCommits(
      octokit,
      'test-owner',
      'test-repo',
      {
        before: 'sameSha123',
        after: 'sameSha123',
        commits: [
          createMinimalActualPushEventCommit(
            'forcePushCommit',
            'Force pushed commit',
          ),
        ],
      },
    );
    expect(commits).toEqual([
      { hash: 'forcePushCommit', message: 'Force pushed commit' },
    ]);
    expect(nock.pendingMocks().length).toBe(0);
  });

  it('should return empty array if API conditions not met and no payload commits', async () => {
    const commits = await fetcher.fetchCommits(
      octokit,
      'test-owner',
      'test-repo',
      {
        before: 'identicalSha',
        after: 'identicalSha',
        commits: [],
      },
    );
    expect(commits).toEqual([]);
    expect(nock.pendingMocks().length).toBe(0);
  });
});
