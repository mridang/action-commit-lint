/**
 * @file Tests for the pull_request commit fetcher.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from '@jest/globals';
import nock from 'nock';
import { getOctokit } from '@actions/github';
// eslint-disable-next-line e18e/ban-dependencies -- the tests drive the fetchers through a real Axios instance and its types, so fetch would not exercise the same transport
import axios from 'axios';
import { PullRequestCommitFetcher } from '../../src/fetchers/pull-request.js';
import type { OctokitInstance } from '../../src/types.js';
import { buildAxiosFetch } from './utils/nockios.js';

beforeAll(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});

/** Matches the GitHub JSON media type sent in the accept header. */
const GITHUB_JSON_ACCEPT_PATTERN = /application\/vnd\.github\.v3\+json/i;

describe('PullRequestCommitFetcher', () => {
  let octokit: OctokitInstance;
  const fetcher = new PullRequestCommitFetcher();

  beforeEach(() => {
    octokit = getOctokit('fake-token', {
      baseUrl: 'https://api.github.com',
      request: {
        fetch: buildAxiosFetch(axios.create({})),
      },
    });
  });

  it('should fetch and map commits correctly when API returns data', async () => {
    nock('https://api.github.com')
      .matchHeader('accept', GITHUB_JSON_ACCEPT_PATTERN)
      .get(`/repos/test-owner/test-repo/pulls/123/commits`)
      .query(true)
      .reply(200, [
        {
          sha: 'sha123',
          commit: { message: 'feat: Implement feature X' },
          html_url: 'url1',
        },
        {
          sha: 'sha456',
          commit: { message: 'fix: Correct bug Y' },
          html_url: 'url2',
        },
      ]);

    const commits = await fetcher.fetchCommits(
      octokit,
      'test-owner',
      'test-repo',
      {
        action: 'opened',
        number: 123,
      },
    );

    expect(commits).toEqual([
      { hash: 'sha123', message: 'feat: Implement feature X' },
      { hash: 'sha456', message: 'fix: Correct bug Y' },
    ]);
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('should return an empty array if the API returns no commits', async () => {
    nock('https://api.github.com')
      .matchHeader('accept', GITHUB_JSON_ACCEPT_PATTERN)
      .get(`/repos/test-owner/test-repo/pulls/123/commits`)
      .query(true)
      .reply(200, []);

    const commits = await fetcher.fetchCommits(
      octokit,
      'test-owner',
      'test-repo',
      {
        action: 'opened',
        number: 123,
      },
    );

    expect(commits).toEqual([]);
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('should return an empty array if pullNumber is not provided', async () => {
    const commits = await fetcher.fetchCommits(
      octokit,
      'test-owner',
      'test-repo',
      {
        action: 'opened',
        number: 0,
      },
    );

    expect(commits).toEqual([]);
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('should throw an error if the GitHub API call fails', async () => {
    nock('https://api.github.com')
      .matchHeader('accept', GITHUB_JSON_ACCEPT_PATTERN)
      .get(`/repos/test-owner/test-repo/pulls/123/commits`)
      .query(true)
      .reply(500, { message: 'Internal Server Error' });

    await expect(
      fetcher.fetchCommits(octokit, 'test-owner', 'test-repo', {
        action: 'opened',
        number: 123,
      }),
    ).rejects.toThrow();

    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('should throw an error if API returns non-array data for commits', async () => {
    nock('https://api.github.com')
      .matchHeader('accept', GITHUB_JSON_ACCEPT_PATTERN)
      .get(`/repos/test-owner/test-repo/pulls/123/commits`)
      .query(true)
      .reply(200, { not_an_array: 'unexpected_data' });

    await expect(
      fetcher.fetchCommits(octokit, 'test-owner', 'test-repo', {
        action: 'opened',
        number: 123,
      }),
    ).rejects.toThrow();

    expect(nock.pendingMocks()).toHaveLength(0);
  });
});
