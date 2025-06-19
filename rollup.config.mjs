import resolve from '@rollup/plugin-node-resolve';
import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import { dirname, resolve as r, resolve as pathResolve } from 'node:path';
import { readFileSync } from 'node:fs';
import * as nodules from 'node:module';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';

const NODE_BUILTINS = nodules.builtinModules.reduce(
  (acc, name) => acc.concat([name, `node:${name}`]),
  [],
);

const patched = pathResolve('src/load.patch.ts');

const inlineHbsPlugin = {
  name: 'inline-hbs',
  transform(code, id) {
    const readFilePattern =
      /readFile\s*\(\s*resolve\s*\(\s*__dirname\s*,\s*(['"`])(.+?\.hbs)\1\s*\)\s*,\s*['"`]utf-8['"`]\s*\)/g;

    const newCode = code.replace(readFilePattern, (match, quote, hbsPath) => {
      try {
        const filePath = r(dirname(id), hbsPath);
        const fileContent = readFileSync(filePath, 'utf-8');
        return JSON.stringify(fileContent);
      } catch (e) {
        this.warn(`Failed to inline '${hbsPath}' for ${id}: ${e.message}`);
        return match;
      }
    });

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
      /require\((['"`])([-.\/\w]+?(?:package\.json|commitlint\.schema\.json))\1\)/g;

    const newCode = code.replace(
      requirePattern,
      (match, quote, requiredPath) => {
        try {
          const filePath = r(dirname(id), requiredPath);
          return readFileSync(filePath, 'utf-8');
        } catch (e) {
          this.warn(
            `Failed to inline '${requiredPath}' for ${id}: ${e.message}`,
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

// noinspection JSUnusedGlobalSymbols,SpellCheckingInspection
export default {
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
      case 'THIS_IS_UNDEFINED':
        return;
      default:
        warn(warning);
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
    }),
  ],
  external: NODE_BUILTINS,
};
