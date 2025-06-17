import alias from '@rollup/plugin-alias';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';
import { dirname, resolve as r, resolve as pathResolve } from 'node:path';
import { readFileSync } from 'node:fs';

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
      /require\((['"`])(.+?(?:package\.json|commitlint\.schema\.json))\1\)/g;

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

// noinspection JSUnusedGlobalSymbols
export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/main.cjs',
    format: 'cjs',
    sourcemap: false,
    inlineDynamicImports: true,
  },
  onwarn(w, warn) {
    if (w.code !== 'CIRCULAR_DEPENDENCY') warn(w);
  },

  plugins: [
    alias({
      entries: [
        {
          find: './utils/load-plugin.js',
          replacement: patched,
        },
      ],
      log: (msg) => console.log('🔄  alias hit →', msg),
    }),

    esbuild({
      target: 'node20',
      tsconfig: './tsconfig.json',
      format: 'esm',
    }),

    {
      name: 'empty-json',
      resolveId(id) {
        return id === '\0empty-json' ? id : null;
      },
      load(id) {
        if (id === '\0empty-json') return 'export default {};';
      },
    },

    inlineHbsPlugin,
    inlinePackageJsonPlugin,

    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node', 'default'],
    }),
    commonjs({
      include: [/node_modules/],
      requireReturnsDefault: 'auto',
    }),
    json({ preferConst: true, compact: true }),
  ],

  external: [],
};
