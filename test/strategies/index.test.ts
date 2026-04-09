import { describe, expect, test } from '@jest/globals';
import {
  BothStrategy,
  CommitsStrategy,
  PrTitleStrategy,
  getLintStrategy,
  type LintStrategyName,
} from '../../src/strategies/index.js';

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
      getLintStrategy('totally-bogus' as unknown as LintStrategyName),
    ).toThrow('Unknown lint strategy: totally-bogus');
  });
});
