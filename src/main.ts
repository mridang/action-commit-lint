/**
 * @file The entrypoint for the action. This file simply imports and runs the
 * action's main logic.
 */
import { run } from './index.js';

/* istanbul ignore next */
// noinspection JSUnusedGlobalSymbols
// eslint-disable-next-line unicorn/prefer-top-level-await -- the bundle is emitted as CommonJS, which has no top-level await
export default (async () => {
  await run();
})();
