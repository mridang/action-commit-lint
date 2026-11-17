/**
 * @file Patched plugin loader for commitlint that resolves and imports plugins
 * relative to the working directory of the action.
 */
/* istanbul ignore file */
import { pathToFileURL } from 'node:url';
import resolveFrom from 'resolve-from';
import {
  normalizePackageName,
  getShorthandName,
} from '@commitlint/load/lib/utils/plugin-naming.js';

import {
  WhitespacePluginError,
  MissingPluginError,
} from '@commitlint/load/lib/utils/plugin-errors.js';
import { info } from '@actions/core';

const cwd = process.cwd();
const rootDir = new URL('.', import.meta.url).pathname;

/** Matches any whitespace, which is not allowed in a plugin name. */
const WHITESPACE_PATTERN = /\s/u;

/**
 * Checks whether an imported package.json carries a string version.
 * @param value - The imported module.
 * @returns True when the module has a string `version`.
 * @example
 * ```ts
 * hasStringVersion({ version: '1.0.0' }); // true
 * ```
 */
function hasStringVersion(value: unknown): value is { version: string } {
  return (
    value instanceof Object &&
    'version' in value &&
    typeof value.version === 'string'
  );
}

/**
 * Loads a commitlint plugin by name and registers it in the given plugin
 * record, resolving the package from the working directory.
 * @param plugins - The record of already loaded plugins, updated in place.
 * @param pluginName - The plugin name as written in the configuration.
 * @param debug - When true, logs the resolved plugin name, version and path.
 * @returns The same plugin record, now containing the requested plugin.
 * @throws {WhitespacePluginError} If the plugin name contains whitespace.
 * @throws {MissingPluginError} If the plugin cannot be resolved.
 * @rejects If the plugin module cannot be imported.
 * @example
 * ```ts
 * const plugins = await loadPlugin({}, '@commitlint/plugin-lint', true);
 * ```
 */
export default async function loadPlugin(
  plugins: Record<string, unknown>,
  pluginName: string,
  debug = false,
): Promise<Record<string, unknown>> {
  const longName = normalizePackageName(pluginName);
  const key = longName === pluginName ? getShorthandName(longName) : pluginName;

  if (WHITESPACE_PATTERN.test(pluginName)) {
    throw new WhitespacePluginError(pluginName, { pluginName: longName });
  }

  if (!plugins[key]) {
    const entry = ((): string => {
      try {
        return resolveFrom(cwd, longName);
      } catch (error) {
        throw new MissingPluginError(
          pluginName,
          error instanceof Error ? error.message : String(error),
          { pluginName: longName, commitlintPath: rootDir },
        );
      }
    })();

    // eslint-disable-next-line no-unsanitized/method -- the plugin path is resolved from the installed package, not user input
    const loadedModule: unknown = await import(pathToFileURL(entry).href);
    const plugin =
      typeof loadedModule === 'object' &&
      loadedModule !== null &&
      'default' in loadedModule
        ? loadedModule.default
        : loadedModule;

    if (debug) {
      const version = await (async (): Promise<string> => {
        try {
          const pkgJson = resolveFrom(cwd, `${longName}/package.json`);
          // eslint-disable-next-line no-unsanitized/method -- the package.json path is resolved from the installed package, not user input
          const pkgModule: unknown = await import(pathToFileURL(pkgJson).href);
          return hasStringVersion(pkgModule) ? pkgModule.version : 'unknown';
        } catch {
          // The version is informational only, so keep the default when the
          // package.json cannot be imported.
          return 'unknown';
        }
      })();
      info(
        `Loaded plugin ${pluginName} (${longName}@${version}) from ${entry}`,
      );
    }

    // eslint-disable-next-line functional/immutable-data, require-atomic-updates -- commitlint relies on this loader registering the plugin in the shared record it passes in
    plugins[key] = plugin;
  }

  return plugins;
}
