import { resolve } from 'node:path';
import loadConfig from '@commitlint/load';

// The absolute path to your test project's directory
const projectBasePath = '/Users/mridang/Junk/scratch.git';
const configFileName = 'commitlint.config.js';
const configPath = resolve(projectBasePath, configFileName);

console.log(`Attempting to load config from: ${configPath}`);
console.log(`Setting current working directory (cwd) to: ${projectBasePath}`);

async function testload() {
  try {
    const config = await loadConfig(
      {},
      { cwd: projectBasePath, file: configPath },
    );
    console.log('\n✅ Configuration loaded successfully:');
    console.dir(config, { depth: null });
  } catch (error) {
    console.error('\n❌ Failed to load configuration:');
    console.error(error);
  }
}

testload();
