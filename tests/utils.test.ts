import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  withTimeout,
  ReviewError,
  ErrorCodes,
  RateLimiter,
  withRateLimit,
  ReportGenerator
} from '../src/utils/index.js';
import { ReviewReport } from '../src/types/index.js';

describe('Production Utilities Tests', () => {
  describe('withRetry', () => {
    it('should return result immediately if function succeeds on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn, 3, 10);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and return result once successful', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('recovered');

      const result = await withRetry(fn, 3, 10);
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw ReviewError with RETRY_EXHAUSTED if all retries fail', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(withRetry(fn, 3, 10)).rejects.toThrow(ReviewError);
      try {
        await withRetry(fn, 2, 5);
      } catch (err: any) {
        expect(err.code).toBe(ErrorCodes.RETRY_EXHAUSTED);
      }
    });
  });

  describe('withTimeout', () => {
    it('should resolve if operation finishes before timeout', async () => {
      const fn = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('done'), 20))
      );
      const result = await withTimeout(fn, 100);
      expect(result).toBe('done');
    });

    it('should reject with AGENT_TIMEOUT if operation exceeds timeout', async () => {
      const fn = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('slow'), 150))
      );
      await expect(withTimeout(fn, 30, 'Custom timeout')).rejects.toThrow(ReviewError);
      try {
        await withTimeout(fn, 20);
      } catch (err: any) {
        expect(err.code).toBe(ErrorCodes.AGENT_TIMEOUT);
      }
    });
  });

  describe('RateLimiter', () => {
    it('should allow requests within limits', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 2,
        maxRequestsPerMinute: 10,
        maxTokensPerMinute: 50000
      });

      expect(limiter.canProceed(1000)).toBe(true);
      await limiter.acquire(1000);

      const status = limiter.getStatus();
      expect(status.activeRequests).toBe(1);
      expect(status.requestsInWindow).toBe(1);
      expect(status.tokensInWindow).toBe(1000);

      limiter.release();
      expect(limiter.getStatus().activeRequests).toBe(0);
    });

    it('should prevent proceeding when maxConcurrent is reached', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1,
        maxRequestsPerMinute: 10,
        maxTokensPerMinute: 50000
      });

      await limiter.acquire(1000);
      expect(limiter.canProceed(1000)).toBe(false);

      limiter.release();
      expect(limiter.canProceed(1000)).toBe(true);
    });

    it('should correctly release slots with withRateLimit helper', async () => {
      const limiter = new RateLimiter({ maxConcurrent: 2 });
      const op = vi.fn().mockResolvedValue('ok');

      const result = await withRateLimit(limiter, op, 500);
      expect(result).toBe('ok');
      expect(limiter.getStatus().activeRequests).toBe(0);
    });
  });

  describe('ReportGenerator', () => {
    const mockReport: ReviewReport = {
      pullRequest: { owner: 'test', repo: 'app', number: 1 },
      fileReviews: [
        {
          file: 'src/app.ts',
          codeQuality: {
            file: 'src/app.ts',
            issues: [
              {
                line: 10,
                severity: 'medium',
                category: 'maintainability',
                description: 'Unused variable',
                suggestion: 'Remove variable'
              }
            ],
            overallScore: 80,
            summary: 'Good quality'
          },
          testCoverage: {
            file: 'src/app.ts',
            hasTests: true,
            testFiles: ['src/app.test.ts'],
            untestedPaths: [
              {
                type: 'branch',
                location: 'if condition line 15',
                priority: 'high',
                reasoning: 'Missing else test',
                suggestedTest: 'test("handles else", () => {})'
              }
            ],
            coverageEstimate: 75,
            summary: 'Fair coverage'
          },
          refactorings: {
            file: 'src/app.ts',
            suggestions: [
              {
                type: 'simplify',
                location: 'line 20',
                impact: 'low',
                description: 'Simplify boolean',
                before: 'if (x === true)',
                after: 'if (x)',
                benefits: 'Concise'
              }
            ],
            summary: 'Minor cleanup'
          }
        }
      ],
      summary: {
        totalFiles: 1,
        overallScore: 80,
        criticalIssues: 0,
        highPriorityTests: 1,
        refactoringOpportunities: 1
      },
      recommendations: [
        {
          priority: 'high',
          category: 'Testing',
          description: 'Add test for line 15',
          files: ['src/app.ts']
        }
      ],
      metadata: {
        analyzedAt: new Date().toISOString(),
        duration: 1200,
        agentVersions: { orchestrator: '1.0.0' }
      }
    };

    const generator = new ReportGenerator();

    it('should generate valid Markdown report', () => {
      const md = generator.generateMarkdownReport(mockReport);
      expect(md).toContain('# 🔍 Code Review Report');
      expect(md).toContain('Overall Score');
      expect(md).toContain('src/app.ts');
    });

    it('should generate valid HTML report', () => {
      const html = generator.generateHTMLReport(mockReport);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Code Review Report');
      expect(html).toContain('80');
    });

    it('should generate valid JSON report', () => {
      const jsonStr = generator.generateJSONReport(mockReport);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.pullRequest.number).toBe(1);
    });
  });
});
