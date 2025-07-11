/* eslint-disable */
import { existsSync as fsExistsSync } from 'node:fs';
import { debug, info } from '@actions/core';
import lintLib from '@commitlint/lint';
import loadConfig from '@commitlint/load';
import type { LintOutcome, QualifiedRules } from '@commitlint/types';
import type {
  ActualParserOptions,
  CommitToLint,
  LoadedCommitlintConfig,
} from '../types.js';
import { Results } from './result.js';

/**
 * A flattened, simplified object representing the complete result of linting a
 * single commit.
 */
export type SimplifiedLinterResult = {
  hash: string;
} & LintOutcome;

/**
 * Defines the contract for a formatter that writes a Results object to a
 * GitHub Actions Summary.
 */
export interface Formatter {
  /**
   * Populates a Summary object with a formatted representation of the results.
   * @param results The results object to format.
   */
  format(results: Results): void;
}

/**
 * Orchestrates the commit linting process. This class is responsible for
 * loading commitlint configurations, linting a list of commit messages
 * against those rules, and packaging the outcome into a structured `Results`
 * object for further processing or display.
 */
export class Linter {
  /**
   * An immutable array of commit objects to be processed by the linter.
   * @private
   */
  private readonly allCommits: ReadonlyArray<CommitToLint>;

  /**
   * An optional, user-provided path to a commitlint configuration file.
   * @private
   */
  private readonly configPath: string | null;

  /**
   * A custom help URL to be used in formatted output, overriding the config.
   * @private
   */
  private readonly helpUrl: string;

  /**
   * The base directory from which to resolve configurations and plugins.
   * @private
   */
  private readonly projectBase: string;

  /**
   * Constructs a new Linter instance.
   *
   * @param allCommits An array of commit objects, each containing a hash
   * and a message string, that are to be processed.
   * @param configPath An optional, explicit path to a commitlint
   * configuration file. If null, auto-detection will be used.
   * @param helpUrl A custom URL to be displayed in formatted output,
   * overriding any helpUrl from the loaded configuration.
   * @param projectBase The root path of the project. This is used as the
   * current working directory for loading configurations and resolving
   * shareable presets (e.g., from `node_modules`).
   */
  constructor(
    allCommits: ReadonlyArray<CommitToLint>,
    configPath: string | null,
    helpUrl: string,
    projectBase: string,
  ) {
    this.allCommits = allCommits;
    this.configPath = configPath;
    this.helpUrl = helpUrl;
    this.projectBase = projectBase;
  }

  /**
   * Loads the effective commitlint configuration from the specified path.
   * A valid path to an existing configuration file must be provided.
   *
   * @returns A promise that resolves to the loaded and parsed commitlint
   * configuration object.
   * @throws An error if `configPath` is not provided or if the file
   * does not exist at the specified path.
   * @private
   */
  private async loadEffectiveConfig(): Promise<LoadedCommitlintConfig> {
    if (this.configPath) {
      if (fsExistsSync(this.configPath)) {
        info(`Loading commitlint configuration from: ${this.configPath}`);
        return (await loadConfig(
          {},
          { cwd: this.projectBase, file: this.configPath },
        )) as LoadedCommitlintConfig;
      } else {
        throw new Error(
          `Specified configuration file was not found at: ${this.configPath}`,
        );
      }
    } else {
      throw new Error(
        `No configuration path was provided. A path to a valid commitlint configuration file is required.`,
      );
    }
  }

  /**
   * Executes the end-to-end linting process. This method first loads the
   * configuration, then lints each provided commit message against the resolved
   * rules, and finally returns a structured `Results` object.
   *
   * @returns A promise that resolves to a `Results` instance containing the
   * detailed outcome of the linting for all processed commits.
   */
  public async lint(): Promise<Results> {
    const loadedConfig = await this.loadEffectiveConfig();

    const lintResults = await Promise.all(
      this.allCommits
        .map((commit) => {
          debug(`Linting commit ${commit.hash} - "${commit.message}"`);
          return commit;
        })
        .map(async (commit) => {
          const lintResult = await lintLib(
            commit.message,
            loadedConfig.rules as QualifiedRules,
            {
              parserOpts:
                (loadedConfig.parserPreset?.parserOpts as
                  | ActualParserOptions
                  | undefined) ?? {},
              plugins: loadedConfig.plugins ?? {},
              ignores: loadedConfig.ignores ?? [],
              defaultIgnores: loadedConfig.defaultIgnores ?? true,
              helpUrl: this.helpUrl || loadedConfig.helpUrl,
            },
          );

          return {
            ...lintResult,
            hash: commit.hash,
          };
        }),
    );

    return new Results(lintResults, this.helpUrl);
  }
}
