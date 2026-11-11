/**
 * @file Cosmiconfig loaders that install the dependencies a commitlint
 * configuration declares before the configuration is used.
 */
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  startGroup,
  endGroup,
  info,
  debug as debugLog,
  error as coreError,
} from '@actions/core';
import type { Loader } from 'cosmiconfig';
import { defaultLoaders } from 'cosmiconfig';

const execAsync = promisify(exec);

/**
 * Major version of the commitlint engine this action bundles (see the
 * `@commitlint/*` entries in package.json). Keep in sync when bumping them.
 */
const COMMITLINT_ENGINE_RANGE = '^19';

/**
 * Default version range for a detected config/plugin that was declared
 * without an explicit one (e.g. `extends: ["@commitlint/config-conventional"]`).
 *
 * Most packages default to `*` (latest). The exception is the `@commitlint/*`
 * scope: those configs ship a `parserPreset` consumed by the bundled
 * commitlint engine, so installing a newer major than the engine breaks
 * config loading. Concretely, `@commitlint/config-conventional@20` is ESM-only
 * and its parser preset is not loaded by the v19 engine, which makes the
 * conventional breaking-change `!` (e.g. `feat!: ...`) parse as an empty
 * header and fail with "type/subject may not be empty". Pin the scope to the
 * engine's major so the resolved config always matches. See issue #37.
 * @param name - The package name as declared in the configuration.
 * @returns The version range to install for the package.
 * @example
 * ```ts
 * defaultVersionFor('@commitlint/config-conventional'); // '^19'
 * defaultVersionFor('commitlint-plugin-jira'); // '*'
 * ```
 */
function defaultVersionFor(name: string): string {
  return name.startsWith('@commitlint/') ? COMMITLINT_ENGINE_RANGE : '*';
}

/**
 * Reports whether a file or directory exists at the given path.
 * @param target - The absolute path to check.
 * @returns `true` if the path is accessible, otherwise `false`.
 * @example
 * ```ts
 * if (await pathExists('/repo/package.json')) {
 *   console.log('package.json is present');
 * }
 * ```
 */
async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs a shell command in a directory with its standard streams inherited
 * from the action, so the installer output appears in the job log.
 * @param command - The shell command to run.
 * @param cwd - The directory the command runs in.
 * @returns A promise that resolves when the command exits with code 0.
 * @rejects If the command cannot be started or exits with a non-zero code.
 * @example
 * ```ts
 * await runInheritedCommand('npm install --no-audit', '/repo');
 * ```
 */
function runInheritedCommand(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}: ${command}`));
      }
    });
  });
}

/**
 * Creates a loader that extracts plugin dependencies from declarative configs
 * and generates a package.json file with versions if specified.
 *
 * Will throw if a package.json already exists in the directory.
 * @param loader - The base loader to parse the configuration file.
 * @returns A loader that prepares a package.json for npm install.
 * @rejects If the configuration is not an object or a package.json already exists.
 * @example
 * ```ts
 * const loader = declarativeLoader(defaultLoaders['.json']);
 * const config = await loader('/repo/.commitlintrc.json', content);
 * ```
 */
function declarativeLoader(loader: Loader): Loader {
  return async (filepath, content) => {
    const config = await loader(filepath, content);

    if (typeof config !== 'object' || config === null) {
      throw new Error('Expected declarative config object');
    } else {
      const cwd = path.dirname(filepath);

      const dependencies = ['plugins', 'extends']
        .flatMap((k) => {
          // The loaded config is untyped, so each key is read dynamically.
          const v: unknown = (config as Record<string, unknown>)[k];

          if (typeof v === 'string') {
            return [v.trim()];
          } else {
            return Array.isArray(v)
              ? v
                  .map((x) => {
                    return Array.isArray(x) ? x[0] : x;
                  })
                  .filter((x): x is string => typeof x === 'string')
                  .map((x) => x.trim())
              : [];
          }
        })
        .map((pkg) => {
          debugLog(`Detected package "${pkg}"`);
          return pkg;
        })
        .reduce<Record<string, string>>((acc, entry) => {
          const at = entry.lastIndexOf('@');
          const name =
            at > 0 && entry.startsWith('@') ? entry.slice(0, at) : entry;

          if (!acc[name]) {
            acc[name] =
              at > 0 && entry.startsWith('@')
                ? entry.slice(at + 1)
                : defaultVersionFor(name);
          }

          return acc;
        }, {});

      if (Object.entries(dependencies).length > 0) {
        const pkgPath = path.join(cwd, 'package.json');
        if (await pathExists(pkgPath)) {
          throw new Error(`File package.json in ${cwd} already exists.`);
        } else {
          await writeFile(
            pkgPath,
            JSON.stringify(
              { name: 'temp', devDependencies: dependencies },
              null,
              2,
            ),
          );
        }
      }

      return config;
    }
  };
}

/**
 * Creates a loader that runs `npm install` in the config file's directory.
 * If allowForce is true, it will use the --force flag.
 * @param loader - The base loader to parse the configuration file.
 * @param allowForce - Whether to use `npm install --force`.
 * @returns A loader that installs dependencies using npm.
 * @rejects If the npm install or npm ls command fails.
 * @example
 * ```ts
 * const loader = imperativeLoader(defaultLoaders['.js'], false);
 * const config = await loader('/repo/commitlint.config.js', content);
 * ```
 */
function imperativeLoader(loader: Loader, allowForce: boolean): Loader {
  return async (filepath, content) => {
    debugLog(`Loading imperative config: ${filepath}`);
    const config = await loader(filepath, content);
    const cwd = path.dirname(filepath);

    startGroup('Installing dependencies');
    try {
      const command = allowForce
        ? 'npm install --force --no-audit --no-progress --no-fund --quiet'
        : 'npm install --no-audit --no-progress --no-fund --quiet';

      info(`Running command: ${command}`);
      await runInheritedCommand(command, cwd);

      const { stdout } = await execAsync('npm ls --parseable', {
        cwd,
        encoding: 'utf8',
      });
      stdout.split(/\r?\n/).forEach((line) => debugLog(line));
    } catch (error) {
      if (error instanceof Error || typeof error === 'string') {
        coreError(error);
      }
      throw new Error('Installing the configuration dependencies failed.');
    } finally {
      endGroup();
    }

    return config;
  };
}

/**
 * Creates the loaders object for cosmiconfig, configured with the
 * allowForce flag.
 * @param allowForce - If true, enables force-install and overwriting package.json.
 * @returns A cosmiconfig loaders object.
 * @example
 * ```ts
 * const explorer = cosmiconfig('commitlint', {
 *   loaders: createLoaders(false),
 * });
 * ```
 */
export function createLoaders(allowForce = false) {
  const dLoader = (loader: Loader) => declarativeLoader(loader);
  const iLoader = (loader: Loader) => imperativeLoader(loader, allowForce);

  return {
    ...defaultLoaders,
    '.json': iLoader(dLoader(defaultLoaders['.json'])),
    '.yaml': iLoader(dLoader(defaultLoaders['.yaml'])),
    '.yml': iLoader(dLoader(defaultLoaders['.yml'])),
    noExt: iLoader(dLoader(defaultLoaders['.yaml'])),
    '.js': iLoader(defaultLoaders['.js']),
    '.cjs': iLoader(defaultLoaders['.cjs']),
    '.mjs': iLoader(defaultLoaders['.mjs']),
    '.ts': iLoader(defaultLoaders['.ts']),
  };
}
