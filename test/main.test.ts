import { describe, test } from '@jest/globals';
import fs, { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path, { join } from 'node:path';
// noinspection ES6PreferShortImport
import { withTempDir } from './helpers/with-temp-dir.js';
import { withEnvVars } from './helpers/with-env-vars.js';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { rollup } from 'rollup';
import jwt from 'jsonwebtoken';
import { constants as VM } from 'vm';
import * as os from 'node:os';

/**
 * Bundle the project using the local rollup.config.mjs and write the output
 * to "<outputDir>/.test-bundles/bundle-<timestamp>.cjs".
 * Returns the absolute path to the generated bundle so tests can load it
 * with `fs.readFileSync`, `vm.runInContext`, etc.
 *
 * @returns Absolute path of the generated CommonJS bundle.
 */
export async function bundleToPath(): Promise<string> {
  // eslint-disable-next-line no-unsanitized/method
  const { default: createRollupConfig } = await import(
    pathToFileURL(path.resolve('rollup.config.mjs')).href
  );

  const testConfig = createRollupConfig({
    typescript: {
      outDir: undefined,
      declaration: false,
      sourceMap: true,
    },
  });

  const bundle = await rollup(testConfig);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-bundle-'));
  const outputFile = path.join(tempDir, `bundle-${Date.now()}.cjs`);

  fs.copyFileSync(
    path.join(process.cwd(), 'tsconfig.json'),
    path.join(tempDir, 'tsconfig.json'),
  );
  try {
    await bundle.write({ ...testConfig.output, file: outputFile });
  } finally {
    await bundle.close();
  }

  return outputFile;
}

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
 * @returns A promise that resolves with the action's result or void.
 */
async function runAction(
  inputs: Record<string, string>,
  extraEnv: Record<string, string | undefined> = {},
  eventPayload: unknown = {},
): Promise<{ summary: string }> {
  const summaryDir = mkdtempSync(join(tmpdir(), 'test-'));
  const summaryPath = join(summaryDir, 'summary.md');
  writeFileSync(summaryPath, '');

  const eventDir = mkdtempSync(join(tmpdir(), 'test-'));
  const eventPath = join(eventDir, 'event.json');
  writeFileSync(eventPath, JSON.stringify(eventPayload));

  const env = {
    ...extraEnv,
    ...Object.fromEntries(
      Object.entries(inputs).map(([key, value]) => [
        `INPUT_${key.replace(/ /g, '_').toUpperCase()}`,
        value,
      ]),
    ),
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_STEP_SUMMARY: summaryPath,
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_SHA: '03ab23e',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ID: '1',
    ACTIONS_STEP_DEBUG: '1',
    RUNNER_DEBUG: '1',
    ACTIONS_RUNTIME_TOKEN: jwt.sign(
      {
        scp: 'Actions.Results:some-run-id:some-job-id',
      },
      'dummy-secret',
    ),
    ACTIONS_RESULTS_URL: 'http://results.local:8080',
  };

  try {
    const wrappedRun = withEnvVars(env, async () => {
      const actionScript = await bundleToPath();
      const script = fs.readFileSync(actionScript, 'utf8');

      const context = {
        ...process.env,
        require: createRequire(import.meta.url),
        global: {},
        __filename: actionScript,
        __dirname: path.dirname(actionScript),
        module: { exports: {} },
      };
      Object.defineProperties(
        context,
        Object.getOwnPropertyDescriptors(globalThis),
      );
      vm.createContext(context);
      const result = vm.runInContext(script, context, {
        filename: actionScript,
        importModuleDynamically: VM.USE_MAIN_CONTEXT_DEFAULT_LOADER,
      }) as unknown;

      await result;
      return '';
    });
    await wrappedRun();
  } finally {
    //
  }

  const summaryContent = readFileSync(summaryPath, 'utf8');
  return { summary: summaryContent };
}

describe('Commitlint Action Integration Tests', () => {
  const testMatrix = [
    {
      description:
        'Imperative config, invalid commit but failOnErrors=false, should pass',
      configFileName: 'commitlint.config.js',
      configFileContent:
        "module.exports = { rules: { 'subject-empty': [2, 'never'] } };",
      createPkgJson: true,
      inputs: { 'fail-on-errors': 'false' },
      event: { name: 'test', payload: {} },
      commits: [{ sha: 'impErr2', message: 'fix:' }],
      expectToThrow: false,
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

      await runAction(
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
      );
    })();
  });
});
