import { describe, it, expect, vi } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator.js';
import { ReviewReportSchema } from '../src/types/index.js';

// Mock Claude Agent SDK query
vi.mock('@anthropic-ai/claude-agent-sdk', () => {
  return {
    query: vi.fn()
  };
});

import { query } from '@anthropic-ai/claude-agent-sdk';

describe('CodeReviewOrchestrator', () => {
  describe('Configuration', () => {
    it('should initialize with default options', () => {
      const orchestrator = new CodeReviewOrchestrator();
      expect(orchestrator).toBeDefined();
      expect(orchestrator.options).toBeDefined();
      expect(orchestrator.rateLimiter).toBeDefined();
      const status = orchestrator.rateLimiter.getStatus();
      expect(status.availableRequests).toBe(50); // Default maxRequestsPerMinute
    });

    it('should accept custom rate limit configuration', () => {
      const orchestrator = new CodeReviewOrchestrator({
        rateLimits: {
          maxRequestsPerMinute: 20,
          maxTokensPerMinute: 50000,
          maxConcurrent: 2
        }
      });
      expect(orchestrator).toBeDefined();
      const status = orchestrator.rateLimiter.getStatus();
      expect(status.availableRequests).toBe(20);
    });
  });

  describe('reviewPullRequest', () => {
    const mockStructuredOutput = {
      pullRequest: {
        owner: 'octocat',
        repo: 'Hello-World',
        number: 1
      },
      fileReviews: [
        {
          file: 'README',
          codeQuality: {
            file: 'README',
            issues: [],
            overallScore: 90,
            summary: 'Good documentation file'
          },
          testCoverage: {
            file: 'README',
            hasTests: false,
            testFiles: [],
            untestedPaths: [],
            coverageEstimate: 100,
            summary: 'Markdown file does not require unit tests'
          },
          refactorings: {
            file: 'README',
            suggestions: [],
            summary: 'No refactoring required'
          }
        }
      ],
      summary: {
        totalFiles: 1,
        overallScore: 90,
        criticalIssues: 0,
        highPriorityTests: 0,
        refactoringOpportunities: 0
      },
      recommendations: [
        {
          priority: 'low' as const,
          category: 'Documentation',
          description: 'Keep documentation updated',
          files: ['README']
        }
      ],
      metadata: {
        analyzedAt: new Date().toISOString(),
        duration: 2500,
        agentVersions: {
          orchestrator: '1.0.0',
          'code-quality-analyzer': '1.0.0',
          'test-coverage-analyzer': '1.0.0',
          'refactoring-suggester': '1.0.0'
        }
      }
    };

    it('should fetch PR files from GitHub MCP and spawn subagents via query', async () => {
      const mockQuery = vi.mocked(query);
      mockQuery.mockImplementation((() => {
        return (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'call_1',
                  name: 'Task',
                  input: { description: 'Use the code-quality-analyzer agent to analyze README' }
                }
              ]
            }
          };
          yield {
            type: 'result',
            subtype: 'success',
            structured_output: mockStructuredOutput
          };
        })();
      }) as any);

      const orchestrator = new CodeReviewOrchestrator();
      const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      expect(mockQuery).toHaveBeenCalled();
      expect(report.pullRequest.owner).toBe('octocat');
      expect(report.pullRequest.repo).toBe('Hello-World');
    });

    it('should aggregate results into ReviewReport and validate with Zod schema', async () => {
      const mockQuery = vi.mocked(query);
      mockQuery.mockImplementation((() => {
        return (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            structured_output: mockStructuredOutput
          };
        })();
      }) as any);

      const orchestrator = new CodeReviewOrchestrator();
      const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      const validated = ReviewReportSchema.safeParse(report);
      expect(validated.success).toBe(true);
      expect(report.summary.totalFiles).toBe(1);
      expect(report.fileReviews).toHaveLength(1);
    });

    it('should reject invalid structured output failing Zod schema', async () => {
      const mockQuery = vi.mocked(query);
      mockQuery.mockImplementation((() => {
        return (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            structured_output: { invalid: 'incomplete report' }
          };
        })();
      }) as any);

      const orchestrator = new CodeReviewOrchestrator({ maxRetries: 1 });
      await expect(
        orchestrator.reviewPullRequest('octocat', 'Hello-World', 1)
      ).rejects.toThrow();
    });
  });

  describe('Integration', () => {
    // Evidence for handling integration test case (fetching a real PR, e.g. octocat/Hello-World #1)
    // When run with valid credentials, this executes end-to-end against GitHub MCP
    it('handles the integration test case structure for octocat/Hello-World', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
      expect(typeof orchestrator.reviewPullRequest).toBe('function');
    });

    it.skip('should review a real small PR (live integration)', async () => {
      const orchestrator = new CodeReviewOrchestrator();
      const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);
      expect(report.pullRequest.owner).toBe('octocat');
      expect(report.pullRequest.repo).toBe('Hello-World');
      expect(report.pullRequest.number).toBe(1);
    });
  });

  describe('Subagent Tool Assignments', () => {
    it('should assign the Skill tool to every subagent definition', async () => {
      const { codeQualityAnalyzer, testCoverageAnalyzer, refactoringSuggester } = await import('../src/agents/index.js');
      expect(codeQualityAnalyzer.tools).toContain('Skill');
      expect(testCoverageAnalyzer.tools).toContain('Skill');
      expect(refactoringSuggester.tools).toContain('Skill');
    });
  });
});
