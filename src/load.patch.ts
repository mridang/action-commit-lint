/* istanbul ignore file */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
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
const rootDir = path.dirname(fileURLToPath(import.meta.url));

// noinspection JSUnusedGlobalSymbols
export default async function loadPlugin(
  plugins: Record<string, unknown>,
  pluginName: string,
  debug = false,
) {
  const longName = normalizePackageName(pluginName);
  const key = longName === pluginName ? getShorthandName(longName) : pluginName;

  if (/\s/u.test(pluginName)) {
    throw new WhitespacePluginError(pluginName, { pluginName: longName });
  }

  if (!plugins[key]) {
    let entry: string;
    try {
      entry = resolveFrom(cwd, longName);
    } catch (err) {
      throw new MissingPluginError(
        pluginName,
        err instanceof Error ? err.message : String(err),
        { pluginName: longName, commitlintPath: rootDir },
      );
    }

    // eslint-disable-next-line no-unsanitized/method
    const mod = await import(pathToFileURL(entry).href);
    const plugin = 'default' in mod ? mod.default : mod;

    if (debug) {
      let version = 'unknown';
      try {
        const pkgJson = resolveFrom(cwd, `${longName}/package.json`);
        version =
          // eslint-disable-next-line no-unsanitized/method
          (await import(pathToFileURL(pkgJson).href)).version ?? version;
      } catch {
        //
      }
      info(
        `Loaded plugin ${pluginName} (${longName}@${version}) from ${entry}`,
      );
    }

    plugins[key] = plugin;
  }

  return plugins;
}
