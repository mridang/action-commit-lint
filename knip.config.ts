export default {
  entry: ['src/main.ts', 'src/load.patch.ts'],
  ignore: ['knip.config.ts'],
  ignoreDependencies: [
    /^@semantic-release\//,
    /^@commitlint\/config-conventional$/,
  ],
};
