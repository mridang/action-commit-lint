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
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- the action runs on Node 24 (action.yml), where import.meta.dirname is supported
const rootDir = import.meta.dirname;

/* eslint-disable jsdoc/check-tag-names -- jsdoc/check-tag-names does not recognise @rejects, which jsdoc/require-rejects requires */

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

  if (/\s/u.test(pluginName)) {
    throw new WhitespacePluginError(pluginName, { pluginName: longName });
  }

  if (!plugins[key]) {
    let entry: string;
    try {
      entry = resolveFrom(cwd, longName);
    } catch (error) {
      throw new MissingPluginError(
        pluginName,
        error instanceof Error ? error.message : String(error),
        { pluginName: longName, commitlintPath: rootDir },
      );
    }

    // eslint-disable-next-line no-unsanitized/method -- the plugin path is resolved from the installed package, not user input
    const mod = await import(pathToFileURL(entry).href);
    const plugin = 'default' in mod ? mod.default : mod;

    if (debug) {
      let version = 'unknown';
      try {
        const pkgJson = resolveFrom(cwd, `${longName}/package.json`);
        // eslint-disable-next-line no-unsanitized/method -- the package.json path is resolved from the installed package, not user input
        const pkgModule = await import(pathToFileURL(pkgJson).href);
        version = pkgModule.version ?? version;
      } catch {
        // The version is informational only, so keep the default when the
        // package.json cannot be imported.
      }
      info(
        `Loaded plugin ${pluginName} (${longName}@${version}) from ${entry}`,
      );
    }

    plugins[key] = plugin;
  }

  return plugins;
}
/* eslint-enable jsdoc/check-tag-names -- closes the @rejects exemption above */
