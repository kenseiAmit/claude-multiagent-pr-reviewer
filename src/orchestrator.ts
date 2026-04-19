import { query } from '@anthropic-ai/claude-agent-sdk';
import { ReviewReport, ReviewReportSchema, ReviewReportJSONSchema } from './types/index.js';
import { mcpServersConfig } from './config/mcp.config.js';
import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester
} from './agents/index.js';
import { buildOrchestratorPrompt } from './prompts/index.js';
import {
  RateLimiter,
  RateLimiterConfig,
  ReviewError,
  ErrorCodes,
  withRetry,
  withTimeout,
  logger,
  logReviewStart,
  logReviewComplete,
  logReviewError
} from './utils/index.js';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  rateLimits?: Partial<RateLimiterConfig>;
  timeoutMs?: number;
  maxRetries?: number;
  model?: string;
  maxTurns?: number;
}

/**
 * Async generator for query message streaming
 */
async function* generateMessages(userMessage: string) {
  yield {
    type: 'user' as const,
    message: { role: 'user' as const, content: userMessage },
    parent_tool_use_id: null,
    session_id: `code-review-session-${Date.now()}`
  };
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 */
export class CodeReviewOrchestrator {
  public readonly options: OrchestratorOptions;
  public readonly rateLimiter: RateLimiter;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxTurns?: number;

  constructor(options: OrchestratorOptions = {}) {
    this.options = options;
    this.rateLimiter = new RateLimiter(options.rateLimits);
    this.model = options.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
    this.timeoutMs = options.timeoutMs ?? 900000; // 15 minutes default timeout
    this.maxRetries = options.maxRetries ?? 2;
    this.maxTurns = options.maxTurns;
  }

  /**
   * Review a pull request using parallel subagent analysis
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Complete review report
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startTime = Date.now();
    logReviewStart(owner, repo, prNumber);

    try {
      const report = await withRetry(
        async () => {
          return await withTimeout(
            async () => {
              await this.rateLimiter.acquire(5000);
              try {
                return await this.executeReview(owner, repo, prNumber);
              } finally {
                this.rateLimiter.release();
              }
            },
            this.timeoutMs,
            `Code review timed out after ${this.timeoutMs}ms for ${owner}/${repo}#${prNumber}`
          );
        },
        this.maxRetries,
        2000
      );

      const duration = Date.now() - startTime;
      // Ensure duration and metadata are correctly set
      if (!report.metadata) {
        report.metadata = {
          analyzedAt: new Date().toISOString(),
          duration,
          agentVersions: {
            orchestrator: '1.0.0',
            'code-quality-analyzer': '1.0.0',
            'test-coverage-analyzer': '1.0.0',
            'refactoring-suggester': '1.0.0'
          }
        };
      } else {
        report.metadata.duration = duration;
      }

      logReviewComplete(owner, repo, prNumber, report.summary.overallScore, duration);
      return report;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logReviewError(owner, repo, prNumber, err);
      throw error;
    }
  }

  /**
   * Internal execution logic invoking Claude Agent SDK query
   */
  private async executeReview(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const fallbackRepo =
      owner.toLowerCase() === 'airaamane' && repo.toLowerCase() === 'simple-todo-app'
        ? { owner: 'SHIV10149', repo: 'simple-todo-app' }
        : undefined;

    const prompt = buildOrchestratorPrompt(owner, repo, prNumber, fallbackRepo);
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();

    logger.info('Executing review query with Claude Agent SDK', {
      owner,
      repo,
      prNumber,
      model: this.model,
      projectRoot
    });

    const subagents = {
      'code-quality-analyzer': codeQualityAnalyzer,
      'test-coverage-analyzer': testCoverageAnalyzer,
      'refactoring-suggester': refactoringSuggester
    };

    const allowedTools = [
      'Task',
      'mcp__github__*',
      'mcp__eslint__*',
      'Read',
      'Grep',
      'Glob',
      'Skill'
    ];

    let resultReport: ReviewReport | null = null;

    for await (const message of query({
      prompt: generateMessages(prompt),
      options: {
        cwd: projectRoot,
        settingSources: ['project'],
        model: this.model,
        allowedTools,
        mcpServers: mcpServersConfig,
        agents: subagents,
        maxTurns: this.maxTurns,
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema
        }
      }
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        logger.debug('SDK initialized with MCP servers', {
          mcpServers: (message as any).mcp_servers
        });
      }

      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              if (block.name === 'Task') {
                const input = block.input as { description?: string };
                logger.info('Orchestrator spawning subagent Task', {
                  task: input?.description || 'Subagent execution'
                });
              } else {
                logger.debug(`Tool use: ${block.name}`);
              }
            }
          }
        }
      }

      if (message.type === 'result') {
        if (message.subtype === 'success' && message.structured_output) {
          const validation = ReviewReportSchema.safeParse(message.structured_output);
          if (validation.success) {
            resultReport = validation.data;
          } else {
            logger.error('Structured output failed Zod validation', {
              errors: validation.error.errors,
              output: message.structured_output
            });
            throw new ReviewError(
              `Review report schema validation failed: ${validation.error.message}`,
              ErrorCodes.VALIDATION_FAILED,
              { zodErrors: validation.error.errors }
            );
          }
        } else if (message.subtype === 'error_max_structured_output_retries') {
          throw new ReviewError(
            'Failed to produce valid structured output after maximum retries',
            ErrorCodes.STRUCTURED_OUTPUT_FAILED
          );
        } else {
          throw new ReviewError(
            `Agent execution ended with error: ${message.subtype}`,
            ErrorCodes.AGENT_FAILED
          );
        }
      }
    }

    if (!resultReport) {
      throw new ReviewError(
        'Orchestrator finished without producing structured review report',
        ErrorCodes.AGENT_FAILED
      );
    }

    return resultReport;
  }
}
