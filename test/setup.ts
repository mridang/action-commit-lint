/**
 * @file Jest global setup that prepares the environment before the suite runs.
 */

/**
 * Runs once before the whole test suite. The suite needs no external
 * services, so there is nothing to start.
 * @returns A promise that resolves once the setup has finished.
 * @example
 * ```ts
 * // Jest calls this automatically through the globalSetup option.
 * await setup();
 * ```
 */
export default async function setup(): Promise<void> {
  // No external services are required for the test suite.
}
