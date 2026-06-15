import { describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// noinspection ES6PreferShortImport
import { run } from '../src/index.js';
import type { CommitToLint, ICommitFetcher } from '../src/types.js';
import { withTempDir } from './helpers/with-temp-dir.js';
import { withEnvVars } from './helpers/with-env-vars.js';
import { tmpdir } from 'node:os';

/**
 * A test helper to execute the main action script (`run`) within a
 * controlled environment. It simulates the GitHub Actions runtime by
 * preparing environment variables and mocking necessary features like
 * Job Summaries.
 *
 * @param inputs A record of key-value pairs representing the action's
 * inputs, equivalent to the `with` block in a workflow YAML file.
 * @param extraEnv A record of additional environment variables to set
 * during the action's execution, used to simulate workflow context
 * like `GITHUB_REF` or `GITHUB_EVENT_NAME`.
 * @param eventPayload
 * @param commitFetcherFactory
 * @returns A promise that resolves with the action's result or void.
 */
async function runAction(
  inputs: Record<string, string>,
  extraEnv: Record<string, string | undefined> = {},
  eventPayload: unknown,
  commitFetcherFactory: (event: string) => ICommitFetcher | null,
): Promise<string | void> {
  const summaryDir = mkdtempSync(join(tmpdir(), 'test-'));
  const summaryPath = join(summaryDir, 'summary.md');
  writeFileSync(summaryPath, '');

  const eventDir = mkdtempSync(join(tmpdir(), 'test-'));
  const eventPath = join(eventDir, 'event.json');
  writeFileSync(eventPath, JSON.stringify(eventPayload));

  const wrapped = withEnvVars(
    {
      ...extraEnv,
      ...Object.fromEntries(
        Object.entries(inputs).map(([key, value]) => [
          `INPUT_${key.replace(/ /g, '_').toUpperCase()}`,
          value,
        ]),
      ),
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_EVENT_PATH: eventPath,
    },
    () => run(undefined, commitFetcherFactory),
  );
  return await wrapped();
}

describe('Commitlint Action Integration Tests', () => {
  const testMatrix = [
    {
      description: 'Declarative config, valid commit, should pass',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['feat']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true' },
      event: { name: 'push', payload: {} },
      commits: [{ sha: 'valid1', message: 'feat: a valid commit' }],
      expectToThrow: false,
    },
    {
      description: 'Declarative config, invalid commit, should fail',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['fix']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true' },
      event: { name: 'push', payload: {} },
      commits: [{ sha: 'err1', message: 'feat: an invalid type' }],
      expectToThrow: true,
      expectedErrorMessage: 'Found 1 commit message with errors',
    },
    {
      description: 'Imperative config, valid commit, should pass',
      configFileName: 'commitlint.config.js',
      configFileContent:
        "module.exports = { rules: { 'type-enum': [2, 'always', ['feat']] } };",
      createPkgJson: true,
      inputs: { 'fail-on-errors': 'true' },
      event: { name: 'push', payload: {} },
      commits: [
        { sha: 'impValid1', message: 'feat: a valid imperative commit' },
      ],
      expectToThrow: false,
    },
    {
      description:
        'Imperative config, invalid commit but failOnErrors=false, should pass',
      configFileName: 'commitlint.config.js',
      configFileContent:
        "module.exports = { rules: { 'subject-empty': [2, 'never'] } };",
      createPkgJson: true,
      inputs: { 'fail-on-errors': 'false' },
      event: { name: 'push', payload: {} },
      commits: [{ sha: 'impErr2', message: 'fix:' }],
      expectToThrow: false,
    },
    {
      description:
        'lint-strategy=pr-title on pull_request with valid title, should pass and not call fetcher',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['feat']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true', 'lint-strategy': 'pr-title' },
      event: {
        name: 'pull_request',
        payload: {
          action: 'opened',
          number: 42,
          pull_request: { number: 42, title: 'feat: a valid pr title' },
        },
      },
      commits: [],
      expectFetcherCalled: false,
      expectToThrow: false,
    },
    {
      description:
        'lint-strategy=pr-title on pull_request with invalid title, should fail',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['fix']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true', 'lint-strategy': 'pr-title' },
      event: {
        name: 'pull_request',
        payload: {
          action: 'opened',
          number: 7,
          pull_request: { number: 7, title: 'feat: wrong type' },
        },
      },
      commits: [],
      expectFetcherCalled: false,
      expectToThrow: true,
      expectedErrorMessage: 'Found 1 commit message with errors',
    },
    {
      description:
        'lint-strategy=pr-title on push event should skip gracefully without throwing',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['feat']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true', 'lint-strategy': 'pr-title' },
      event: { name: 'push', payload: {} },
      commits: [{ sha: 'ignored', message: 'feat: ignored' }],
      expectFetcherCalled: false,
      expectToThrow: false,
    },
    {
      description:
        'lint-strategy=pr-title on merge_group event should skip gracefully without throwing',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['feat']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true', 'lint-strategy': 'pr-title' },
      event: { name: 'merge_group', payload: {} },
      commits: [{ sha: 'ignored', message: 'feat: ignored' }],
      expectFetcherCalled: false,
      expectToThrow: false,
    },
    {
      description:
        'lint-strategy=pr-title with pull_request literally null should skip gracefully',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['feat']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true', 'lint-strategy': 'pr-title' },
      event: { name: 'pull_request', payload: { pull_request: null } },
      commits: [{ sha: 'ignored', message: 'feat: ignored' }],
      expectFetcherCalled: false,
      expectToThrow: false,
    },
    {
      description:
        'lint-strategy=both on pull_request with valid title and valid commits, should pass',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['feat']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true', 'lint-strategy': 'both' },
      event: {
        name: 'pull_request',
        payload: {
          action: 'opened',
          number: 11,
          pull_request: { number: 11, title: 'feat: a valid title' },
        },
      },
      commits: [{ sha: 'cmt1', message: 'feat: a valid commit' }],
      expectFetcherCalled: true,
      expectToThrow: false,
    },
    {
      description:
        'lint-strategy=both on pull_request with invalid title but valid commits, should fail on title',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['feat']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true', 'lint-strategy': 'both' },
      event: {
        name: 'pull_request',
        payload: {
          action: 'opened',
          number: 12,
          pull_request: { number: 12, title: 'bad: wrong type' },
        },
      },
      commits: [{ sha: 'cmt2', message: 'feat: a valid commit' }],
      expectFetcherCalled: true,
      expectToThrow: true,
      expectedErrorMessage: 'Found 1 commit message with errors',
    },
    {
      description:
        'lint-strategy=garbage should throw an input validation error',
      configFileName: '.commitlintrc.json',
      configFileContent: {
        extends: ['@commitlint/config-conventional'],
        rules: { 'type-enum': [2, 'always', ['feat']] },
      },
      createPkgJson: false,
      inputs: { 'fail-on-errors': 'true', 'lint-strategy': 'nonsense' },
      event: { name: 'push', payload: {} },
      commits: [{ sha: 'valid1', message: 'feat: a valid commit' }],
      expectFetcherCalled: false,
      expectToThrow: true,
      expectedErrorMessage: 'Invalid value for "lint-strategy"',
    },
  ];

  test.each(testMatrix)('$description', (params) => {
    return withTempDir(async ({ tmp }) => {
      writeFileSync(
        join(tmp, params.configFileName),
        typeof params.configFileContent === 'string'
          ? params.configFileContent
          : JSON.stringify(params.configFileContent, null, 2),
      );

      if (params.createPkgJson) {
        writeFileSync(
          join(tmp, 'package.json'),
          JSON.stringify({ name: 'test-project', private: true }),
        );
      }

      const action = () =>
        runAction(
          {
            'github-token': 'fake-token',
            'working-directory': tmp,
            ...params.inputs,
          },
          {
            GITHUB_WORKSPACE: tmp,
            GITHUB_EVENT_NAME: params.event.name,
            GITHUB_REPOSITORY: 'test-owner/test-repo',
          },
          params.event.payload,
          (): ICommitFetcher | null => {
            return {
              fetchCommits: async (): Promise<CommitToLint[]> => {
                if (
                  'expectFetcherCalled' in params &&
                  params.expectFetcherCalled === false
                ) {
                  throw new Error(
                    'fetchCommits was called but the test asserted it must not be',
                  );
                }
                const transformedCommits = params.commits.map((commit) => ({
                  hash: commit.sha,
                  message: commit.message,
                }));

                return Promise.resolve(transformedCommits);
              },
            };
          },
        );

      if (params.expectToThrow) {
        await expect(action()).rejects.toThrow(params.expectedErrorMessage);
      } else {
        await expect(action()).resolves.not.toThrow();
      }
    })();
  });

  test('emits a workflow notice when lint-strategy=pr-title skips on a non-PR event', () => {
    return withTempDir(async ({ tmp }) => {
      writeFileSync(
        join(tmp, '.commitlintrc.json'),
        JSON.stringify({
          extends: ['@commitlint/config-conventional'],
          rules: { 'type-enum': [2, 'always', ['feat']] },
        }),
      );

      const stdoutChunks: string[] = [];
      const stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(((chunk: string | Uint8Array): boolean => {
          stdoutChunks.push(
            typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
          );
          return true;
        }) as typeof process.stdout.write);

      try {
        await runAction(
          {
            'github-token': 'fake-token',
            'working-directory': tmp,
            'fail-on-errors': 'true',
            'lint-strategy': 'pr-title',
          },
          {
            GITHUB_WORKSPACE: tmp,
            GITHUB_EVENT_NAME: 'push',
            GITHUB_REPOSITORY: 'test-owner/test-repo',
          },
          {},
          (): ICommitFetcher | null => ({
            fetchCommits: async (): Promise<CommitToLint[]> => {
              throw new Error(
                'fetchCommits must not be invoked on the skip path',
              );
            },
          }),
        );
      } finally {
        stdoutSpy.mockRestore();
      }

      const allOutput = stdoutChunks.join('');
      expect(allOutput).toContain('::notice::');
      expect(allOutput).toContain('lint-strategy=pr-title');
      expect(allOutput).toContain("event 'push'");
    })();
  });

  test('emits one error line per failing commit with the rule reason', () => {
    return withTempDir(async ({ tmp }) => {
      writeFileSync(
        join(tmp, '.commitlintrc.json'),
        JSON.stringify({
          extends: ['@commitlint/config-conventional'],
          rules: { 'body-max-line-length': [2, 'always', 200] },
        }),
      );

      const longLine = 'x'.repeat(201);
      const stdoutChunks: string[] = [];
      const stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(((chunk: string | Uint8Array): boolean => {
          stdoutChunks.push(
            typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
          );
          return true;
        }) as typeof process.stdout.write);

      try {
        await expect(
          runAction(
            {
              'github-token': 'fake-token',
              'working-directory': tmp,
              'fail-on-errors': 'true',
            },
            {
              GITHUB_WORKSPACE: tmp,
              GITHUB_EVENT_NAME: 'push',
              GITHUB_REPOSITORY: 'test-owner/test-repo',
            },
            {},
            (): ICommitFetcher | null => ({
              fetchCommits: async (): Promise<CommitToLint[]> => [
                {
                  hash: 'aaa1111',
                  message: `fix(deps): bump dep\n\n${longLine}`,
                },
                { hash: 'bbb2222', message: `fix: another\n\n${longLine}` },
              ],
            }),
          ),
        ).rejects.toThrow('Found 2 commit messages with errors');
      } finally {
        stdoutSpy.mockRestore();
      }

      const allOutput = stdoutChunks.join('');
      // One annotation per failing commit, each carrying the rule reason and
      // the commit hash — not just the aggregate setFailed count.
      const errorLines = allOutput
        .split('\n')
        .filter((line) => line.startsWith('::error::'));
      expect(errorLines).toHaveLength(2);
      expect(allOutput).toContain('::error::aaa1111 fix(deps): bump dep');
      expect(allOutput).toContain('::error::bbb2222 fix: another');
      expect(allOutput).toContain(
        "body's lines must not be longer than 200 characters",
      );
    })();
  });
});
