/**
 * @file Jest global teardown that cleans up after the suite finishes.
 */

/**
 * Runs once after the whole test suite. The suite starts no external
 * services, so there is nothing to stop.
 * @returns A promise that resolves once the teardown has finished.
 * @example
 * ```ts
 * // Jest calls this automatically through the globalTeardown option.
 * await teardown();
 * ```
 */
export default async function teardown(): Promise<void> {
  // No external services to tear down.
}
