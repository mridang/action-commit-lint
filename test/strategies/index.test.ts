/**
 * @file Tests for the strategy factory.
 */
import { describe, expect, test } from '@jest/globals';
import {
  BothStrategy,
  CommitsStrategy,
  PrTitleStrategy,
  getLintStrategy,
} from '../../src/strategies/index.js';
import type { LintStrategyName } from '../../src/strategies/index.js';

describe('getLintStrategy factory', () => {
  const cases: ReadonlyArray<{
    name: LintStrategyName;
    expected: new () => object;
  }> = [
    { name: 'commits', expected: CommitsStrategy },
    { name: 'pr-title', expected: PrTitleStrategy },
    { name: 'both', expected: BothStrategy },
  ];

  test.each(cases)(
    'returns an instance of $expected.name for "$name"',
    ({ name, expected }) => {
      const strategy = getLintStrategy(name);
      expect(strategy).toBeInstanceOf(expected);
    },
  );

  test('throws on an unrecognised strategy name (defensive default branch)', () => {
    expect(() =>
      // @ts-expect-error -- deliberately passes a name outside LintStrategyName to reach the defensive default branch
      getLintStrategy('totally-bogus'),
    ).toThrow('Unknown lint strategy: totally-bogus');
  });
});
