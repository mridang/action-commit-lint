import { Results } from '../../src/linter/result.js';

describe('Results', () => {
  const cleanCommit = {
    hash: 'a1b2c3d',
    input: 'feat: add new feature',
    valid: true,
    errors: [],
    warnings: [],
  };

  const warningCommit = {
    hash: 'e4f5g6h',
    input: 'docs: update usage instructions with a very long subject line',
    valid: true,
    errors: [],
    warnings: [
      {
        level: 1,
        valid: true,
        name: 'subject-max-length',
        message: 'Subject may not be longer than 72 characters',
      },
    ],
  };

  const errorCommit1 = {
    hash: 'i7j8k9l',
    input: 'Fixed a bug',
    valid: false,
    errors: [
      {
        level: 2,
        valid: false,
        name: 'type-empty',
        message: 'Type may not be empty',
      },
    ],
    warnings: [],
  };

  const errorCommit2 = {
    hash: 'm0n1p2q',
    input: 'refactor!: drop support for old API',
    valid: false,
    errors: [
      {
        level: 2,
        valid: false,
        name: 'subject-empty',
        message: 'Subject may not be empty',
      },
    ],
    warnings: [],
  };

  const multiErrorCommit = {
    hash: 'r3s4t5u',
    input: 'something broken',
    valid: false,
    errors: [
      {
        level: 2,
        valid: false,
        name: 'type-empty',
        message: 'Type may not be empty',
      },
      {
        level: 2,
        valid: false,
        name: 'subject-case',
        message: 'Subject must be in lowercase',
      },
      {
        level: 2,
        valid: false,
        name: 'header-max-length',
        message: 'Header is too long',
      },
    ],
    warnings: [],
  };

  const multiWarningCommit = {
    hash: 'v6w7x8y',
    input: 'docs: too many warnings here',
    valid: true,
    errors: [],
    warnings: [
      {
        level: 1,
        valid: true,
        name: 'subject-max-length',
        message: 'Subject too long',
      },
      {
        level: 1,
        valid: true,
        name: 'body-leading-blank',
        message: 'Body should start with blank line',
      },
    ],
  };

  test('should correctly calculate counts and states for mixed results', () => {
    const items = [cleanCommit, warningCommit, errorCommit1, errorCommit2];
    const results = new Results(items, 'https://example.com/rules');

    expect(results.items).toEqual(items);
    expect(results.helpUrl).toBe('https://example.com/rules');
    expect(results.checkedCount).toBe(4);
    expect(results.errorCount).toBe(2);
    expect(results.warningCount).toBe(1);
    expect(results.errorCommitsCount).toBe(2);
    expect(results.warningCommitsCount).toBe(1);
    expect(results.hasErrors).toBe(true);
    expect(results.hasOnlyWarnings).toBe(false);
  });

  test('should correctly identify a state with only warnings', () => {
    const items = [cleanCommit, warningCommit];
    const results = new Results(items, 'https://example.com/rules');

    expect(results.checkedCount).toBe(2);
    expect(results.errorCount).toBe(0);
    expect(results.warningCount).toBe(1);
    expect(results.errorCommitsCount).toBe(0);
    expect(results.warningCommitsCount).toBe(1);
    expect(results.hasErrors).toBe(false);
    expect(results.hasOnlyWarnings).toBe(true);
  });

  test('should correctly identify a state with only errors', () => {
    const items = [cleanCommit, errorCommit1];
    const results = new Results(items, 'https://example.com/rules');

    expect(results.checkedCount).toBe(2);
    expect(results.errorCount).toBe(1);
    expect(results.warningCount).toBe(0);
    expect(results.errorCommitsCount).toBe(1);
    expect(results.warningCommitsCount).toBe(0);
    expect(results.hasErrors).toBe(true);
    expect(results.hasOnlyWarnings).toBe(false);
  });

  test('should handle a clean run with no errors or warnings', () => {
    const items = [cleanCommit, { ...cleanCommit, hash: 'z9y8x7w' }];
    const results = new Results(items, 'https://example.com/rules');

    expect(results.checkedCount).toBe(2);
    expect(results.errorCount).toBe(0);
    expect(results.warningCount).toBe(0);
    expect(results.errorCommitsCount).toBe(0);
    expect(results.warningCommitsCount).toBe(0);
    expect(results.hasErrors).toBe(false);
    expect(results.hasOnlyWarnings).toBe(false);
  });

  test('should handle an empty array of items correctly', () => {
    const results = new Results([], 'https://example.com/rules');

    expect(results.items).toEqual([]);
    expect(results.checkedCount).toBe(0);
    expect(results.errorCount).toBe(0);
    expect(results.warningCount).toBe(0);
    expect(results.errorCommitsCount).toBe(0);
    expect(results.warningCommitsCount).toBe(0);
    expect(results.hasErrors).toBe(false);
    expect(results.hasOnlyWarnings).toBe(false);
  });

  test('errorCommitsCount counts commits, not errors, when one commit has many errors', () => {
    const items = [cleanCommit, multiErrorCommit];
    const results = new Results(items, 'https://example.com/rules');

    expect(results.errorCount).toBe(3);
    expect(results.errorCommitsCount).toBe(1);
  });

  test('warningCommitsCount counts commits, not warnings, when one commit has many warnings', () => {
    const items = [cleanCommit, multiWarningCommit];
    const results = new Results(items, 'https://example.com/rules');

    expect(results.warningCount).toBe(2);
    expect(results.warningCommitsCount).toBe(1);
  });
});
