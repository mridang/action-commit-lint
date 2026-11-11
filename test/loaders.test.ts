/**
 * @file Tests for the cosmiconfig loaders that install configuration dependencies.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cosmiconfig } from 'cosmiconfig';
import { createLoaders } from '../src/loaders.js';
import { stringify as yamlStringify } from 'yaml';
import { withTempDir } from './helpers/with-temp-dir.js';

const baseConfig = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    ['@mridang/semantic-release-peer-version', { repo: 'github/github' }],
  ],
};

it.each([
  ['.releaserc.json', true, JSON.stringify(baseConfig, null, 2)],
  ['.releaserc.yaml', true, yamlStringify(baseConfig)],
  ['.releaserc.yml', true, yamlStringify(baseConfig)],
  ['.releaserc', true, yamlStringify(baseConfig)],
  ['release.config.js', false, `module.exports = {};`],
  ['release.config.cjs', false, `module.exports = {};`],
  ['release.config.mjs', false, `export default {};`],
  ['release.config.ts', false, `export default {};`],
])(
  'correctly handles %s config with isDeclarative = %s',
  (filename, isDeclarative, contents) =>
    withTempDir(async ({ tmp }) => {
      const filepath = path.join(tmp, filename);
      await writeFile(filepath, contents);

      if (!isDeclarative) {
        await writeFile(
          path.join(tmp, 'package.json'),
          JSON.stringify(
            {
              name: 'imperative',
              version: '1.0.0',
              devDependencies: {
                '@semantic-release/commit-analyzer': '*',
                '@mridang/semantic-release-peer-version': '*',
              },
            },
            null,
            2,
          ),
        );
      }

      const explorer = cosmiconfig('release', {
        stopDir: tmp,
        loaders: createLoaders(),
      });

      const result = await explorer.search(tmp);
      expect(result?.filepath).toBe(filepath);

      const pkgJsonPath = path.join(tmp, 'package.json');
      const pkgLockPath = path.join(tmp, 'package-lock.json');

      await expect(access(pkgJsonPath)).resolves.toBeUndefined();
      await expect(access(pkgLockPath)).resolves.toBeUndefined();

      const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
      const deps = pkgJson.dependencies || pkgJson.devDependencies;
      expect(deps).toMatchObject({
        '@semantic-release/commit-analyzer': '*',
        '@mridang/semantic-release-peer-version': '*',
      });

      const pkgLock = JSON.parse(await readFile(pkgLockPath, 'utf8'));
      expect(pkgLock.packages).toHaveProperty(
        'node_modules/@semantic-release/commit-analyzer',
      );
      expect(pkgLock.packages).toHaveProperty(
        'node_modules/@mridang/semantic-release-peer-version',
      );
    })(),
);

it('pins an unversioned @commitlint/* config to the bundled engine major', () =>
  withTempDir(async ({ tmp }) => {
    const filepath = path.join(tmp, '.commitlintrc.json');
    await writeFile(
      filepath,
      JSON.stringify({ extends: ['@commitlint/config-conventional'] }, null, 2),
    );

    const explorer = cosmiconfig('commitlint', {
      stopDir: tmp,
      loaders: createLoaders(),
    });

    const result = await explorer.search(tmp);
    expect(result?.filepath).toBe(filepath);

    const pkgJson = JSON.parse(
      await readFile(path.join(tmp, 'package.json'), 'utf8'),
    );
    const deps = pkgJson.dependencies || pkgJson.devDependencies;
    // Must NOT be '*' (which resolves to config-conventional@20, ESM-only and
    // incompatible with the bundled v19 engine — breaks `feat!:` parsing, #37).
    expect(deps['@commitlint/config-conventional']).toBe('^19');
  })());
