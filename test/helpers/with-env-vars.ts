/**
 * @file Helper that sets environment variables for the duration of a callback.
 */

/**
 * A higher-order function that wraps an asynchronous operation, setting
 * or unsetting temporary environment variables for its execution.
 *
 * It guarantees that the original environment is restored even if the
 * wrapped function fails. Pass a string value to set a variable, or
 * `undefined` to temporarily unset (delete) it.
 * @template T The value type resolved by the wrapped function.
 * @param env - An object where keys are variable names and values are the
 * string to set, or `undefined` to unset the variable.
 * @param fn - The asynchronous function to execute.
 * @returns A new async function that will run with the modified environment.
 * @example
 * ```ts
 * await withEnvVars({ GITHUB_TOKEN: 'test-token' }, async () => {
 *   return process.env.GITHUB_TOKEN;
 * })();
 * ```
 */
export function withEnvVars<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): () => Promise<T> {
  return async () => {
    const originalValues: Record<string, string | undefined> = {};

    for (const key of Object.keys(env)) {
      originalValues[key] = process.env[key];
      const newValue = env[key];

      if (newValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = newValue;
      }
    }

    try {
      return await fn();
    } finally {
      for (const key of Object.keys(originalValues)) {
        const originalValue = originalValues[key];
        if (originalValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalValue;
        }
      }
    }
  };
}
