/**
 * @file Rollup build configuration that bundles the action into a single
 * CommonJS file, inlining its templates and package metadata.
 */
import resolve from '@rollup/plugin-node-resolve';
import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';

const NODE_BUILTINS = builtinModules.reduce(
  (acc, name) => [...acc, name, `node:${name}`],
  [],
);

const patched = path.resolve('src/load.patch.ts');

const inlineHbsPlugin = {
  name: 'inline-hbs',
  transform(code, id) {
    const readFilePattern =
      /readFile\s*\(\s*resolve\s*\(\s*__dirname\s*,\s*(['"`])(.+?\.hbs)\1\s*\)\s*,\s*['"`]utf-8['"`]\s*\)/g;

    const newCode = code.replaceAll(
      readFilePattern,
      (match, _quote, hbsPath) => {
        try {
          const filePath = path.resolve(path.dirname(id), hbsPath);
          // eslint-disable-next-line n/no-sync -- the bundler inlines templates synchronously inside replaceAll
          const fileContent = readFileSync(filePath, 'utf8');
          return JSON.stringify(fileContent);
        } catch (error) {
          // eslint-disable-next-line unicorn/no-this-outside-of-class -- rollup binds the plugin context to this in transform hooks
          this.warn(
            `Failed to inline '${hbsPath}' for ${id}: ${error.message}`,
          );
          return match;
        }
      },
    );

    if (newCode !== code) {
      return {
        code: newCode,
        map: null,
      };
    }

    return null;
  },
};

const inlinePackageJsonPlugin = {
  name: 'inline-json',
  transform(code, id) {
    if (!id.includes('node_modules')) {
      return null;
    }

    const requirePattern =
      /require\((['"`])([-./\w]+?(?:package\.json|commitlint\.schema\.json))\1\)/g;

    const newCode = code.replaceAll(
      requirePattern,
      (match, _quote, requiredPath) => {
        try {
          const filePath = path.resolve(path.dirname(id), requiredPath);
          // eslint-disable-next-line n/no-sync -- the bundler inlines package metadata synchronously inside replaceAll
          return readFileSync(filePath, 'utf8');
        } catch (error) {
          // eslint-disable-next-line unicorn/no-this-outside-of-class -- rollup binds the plugin context to this in transform hooks
          this.warn(
            `Failed to inline '${requiredPath}' for ${id}: ${error.message}`,
          );
          return match;
        }
      },
    );

    return {
      code: newCode,
      map: null,
    };
  },
};

/**
 * Builds the Rollup configuration for the action bundle.
 * @param {object} [configOverrides] - Options merged into the plugin setup,
 * such as overrides for the TypeScript plugin.
 * @returns {object} The Rollup input and output configuration.
 * @example
 * ```js
 * import createRollupConfig from './rollup.config.mjs';
 * const config = createRollupConfig({ typescript: { declaration: false } });
 * ```
 */
const createRollupConfig = (configOverrides = {}) => ({
  input: 'src/main.ts',
  output: {
    file: 'dist/main.cjs',
    format: 'cjs',
    sourcemap: true,
    inlineDynamicImports: true,
    interop: (id) => {
      // For Node.js built-in modules (e.g., 'buffer', 'fs/promises'):
      // Return 'default' to ensure they are treated as pure CommonJS modules,
      // without extra '.default' wrappers, matching Node.js's native behavior.
      if (NODE_BUILTINS.includes(id)) {
        return 'default'; // CHANGED from `false` to `'default'`
      }
      // For all other modules (e.g., 'jwt-decode'), return 'esModule' to ensure
      // they get the `__esModule: true` flag, allowing `import Foo from 'foo'` to work.
      return 'esModule';
    },
  },
  onwarn(warning, warn) {
    switch (warning.code) {
      case 'CIRCULAR_DEPENDENCY':
      case 'THIS_IS_UNDEFINED': {
        return;
      }
      default: {
        warn(warning);
      }
    }
  },
  plugins: [
    json({
      preferConst: true,
      compact: true,
    }),
    alias({
      entries: [
        {
          find: './utils/load-plugin.js',
          replacement: patched,
        },
      ],
    }),
    inlineHbsPlugin,
    inlinePackageJsonPlugin,
    resolve({
      exportConditions: ['node', 'default'],
      preferBuiltins: true,
    }),
    commonjs({
      include: /node_modules/,
      requireReturnsDefault: () => {
        return 'auto';
      },
      ignore: NODE_BUILTINS,
    }),
    typescript({
      tsconfig: './tsconfig.json',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      ...configOverrides.typescript,
    }),
  ],
  external: NODE_BUILTINS,
});

export default createRollupConfig;
