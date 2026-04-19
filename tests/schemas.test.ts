import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionJSONSchema
} from '../src/types/analysis-results.js';
import {
  ReviewReportSchema,
  ReviewReportJSONSchema
} from '../src/types/report-types.js';

describe('Schema Validation Tests', () => {
  describe('CodeQualityResultSchema', () => {
    const validData = {
      file: 'src/payment.ts',
      issues: [
        {
          line: 42,
          severity: 'high' as const,
          category: 'security' as const,
          description: 'Hardcoded secret detected',
          suggestion: 'Store in environment variables'
        }
      ],
      overallScore: 85,
      summary: 'Clean code overall but has one high severity security issue.'
    };

    it('should validate valid code quality data', () => {
      const parsed = CodeQualityResultSchema.parse(validData);
      expect(parsed).toEqual(validData);
    });

    it('should reject invalid severity enum', () => {
      const invalidData = {
        ...validData,
        issues: [
          {
            ...validData.issues[0],
            severity: 'invalid-severity'
          }
        ]
      };
      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject invalid category enum', () => {
      const invalidData = {
        ...validData,
        issues: [
          {
            ...validData.issues[0],
            category: 'not-a-category'
          }
        ]
      };
      expect(() => CodeQualityResultSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject scores outside 0-100 boundary', () => {
      expect(() =>
        CodeQualityResultSchema.parse({ ...validData, overallScore: -1 })
      ).toThrow(ZodError);
      expect(() =>
        CodeQualityResultSchema.parse({ ...validData, overallScore: 101 })
      ).toThrow(ZodError);
    });

    it('should handle boundary scores 0 and 100 and empty issues', () => {
      const zeroScore = { ...validData, overallScore: 0, issues: [] };
      const perfectScore = { ...validData, overallScore: 100, issues: [] };
      expect(CodeQualityResultSchema.parse(zeroScore).overallScore).toBe(0);
      expect(CodeQualityResultSchema.parse(perfectScore).overallScore).toBe(100);
      expect(CodeQualityResultSchema.parse(perfectScore).issues).toEqual([]);
    });

    it('should export valid JSON schema', () => {
      expect(CodeQualityResultJSONSchema).toBeDefined();
      expect(typeof CodeQualityResultJSONSchema).toBe('object');
      expect((CodeQualityResultJSONSchema as any).type).toBe('object');
      expect((CodeQualityResultJSONSchema as any).properties).toBeDefined();
    });
  });

  describe('TestCoverageResultSchema', () => {
    const validData = {
      file: 'src/calculator.ts',
      hasTests: true,
      testFiles: ['tests/calculator.test.ts'],
      untestedPaths: [
        {
          type: 'branch' as const,
          location: 'divide() line 30',
          priority: 'critical' as const,
          reasoning: 'Division by zero is untested',
          suggestedTest: 'expect(() => divide(10, 0)).toThrow()'
        }
      ],
      coverageEstimate: 75,
      summary: 'Most arithmetic operations tested except division by zero branch.'
    };

    it('should validate valid test coverage data', () => {
      const parsed = TestCoverageResultSchema.parse(validData);
      expect(parsed).toEqual(validData);
    });

    it('should reject invalid path type enum', () => {
      const invalidData = {
        ...validData,
        untestedPaths: [
          {
            ...validData.untestedPaths[0],
            type: 'invalid-type'
          }
        ]
      };
      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject invalid priority enum', () => {
      const invalidData = {
        ...validData,
        untestedPaths: [
          {
            ...validData.untestedPaths[0],
            priority: 'urgent'
          }
        ]
      };
      expect(() => TestCoverageResultSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should handle edge cases: no tests, empty lists, boundary coverage', () => {
      const edgeData = {
        file: 'src/new-feature.ts',
        hasTests: false,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 0,
        summary: 'No tests found'
      };
      const parsed = TestCoverageResultSchema.parse(edgeData);
      expect(parsed.coverageEstimate).toBe(0);
      expect(parsed.untestedPaths.length).toBe(0);
    });

    it('should export valid JSON schema', () => {
      expect(TestCoverageResultJSONSchema).toBeDefined();
      expect(typeof TestCoverageResultJSONSchema).toBe('object');
    });
  });

  describe('RefactoringSuggestionSchema', () => {
    const validData = {
      file: 'src/service.ts',
      suggestions: [
        {
          type: 'extract-function' as const,
          location: 'processOrder() lines 40-90',
          impact: 'high' as const,
          description: 'Extract tax calculation to helper function',
          before: 'const tax = order.price * 0.2 + stateTax;',
          after: 'const tax = calculateTax(order);',
          benefits: 'Improves testability and single responsibility'
        }
      ],
      summary: 'Recommended extracting complex calculations into pure functions.'
    };

    it('should validate valid refactoring data', () => {
      const parsed = RefactoringSuggestionSchema.parse(validData);
      expect(parsed).toEqual(validData);
    });

    it('should reject invalid suggestion type', () => {
      const invalidData = {
        ...validData,
        suggestions: [
          {
            ...validData.suggestions[0],
            type: 'unsupported-refactoring'
          }
        ]
      };
      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject invalid impact enum', () => {
      const invalidData = {
        ...validData,
        suggestions: [
          {
            ...validData.suggestions[0],
            impact: 'extreme'
          }
        ]
      };
      expect(() => RefactoringSuggestionSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should allow empty suggestions array', () => {
      const emptyData = {
        file: 'src/clean.ts',
        suggestions: [],
        summary: 'Code is well-structured, no refactoring required.'
      };
      expect(RefactoringSuggestionSchema.parse(emptyData).suggestions).toHaveLength(0);
    });

    it('should export valid JSON schema', () => {
      expect(RefactoringSuggestionJSONSchema).toBeDefined();
    });
  });

  describe('ReviewReportSchema', () => {
    const validReport = {
      pullRequest: {
        owner: 'facebook',
        repo: 'react',
        number: 12345
      },
      fileReviews: [
        {
          file: 'src/index.ts',
          codeQuality: {
            file: 'src/index.ts',
            issues: [],
            overallScore: 95,
            summary: 'High quality code'
          },
          testCoverage: {
            file: 'src/index.ts',
            hasTests: true,
            testFiles: ['tests/index.test.ts'],
            untestedPaths: [],
            coverageEstimate: 90,
            summary: 'Well covered'
          },
          refactorings: {
            file: 'src/index.ts',
            suggestions: [],
            summary: 'Clean architecture'
          }
        }
      ],
      summary: {
        totalFiles: 1,
        overallScore: 95,
        criticalIssues: 0,
        highPriorityTests: 0,
        refactoringOpportunities: 0
      },
      recommendations: [
        {
          priority: 'low' as const,
          category: 'Documentation',
          description: 'Add inline JSDoc comments',
          files: ['src/index.ts']
        }
      ],
      metadata: {
        analyzedAt: '2026-10-02T00:00:00.000Z',
        duration: 3500,
        agentVersions: {
          orchestrator: '1.0.0',
          'code-quality-analyzer': '1.0.0'
        }
      }
    };

    it('should validate complete review report', () => {
      const parsed = ReviewReportSchema.parse(validReport);
      expect(parsed.pullRequest.owner).toBe('facebook');
      expect(parsed.fileReviews).toHaveLength(1);
    });

    it('should reject report missing required fields', () => {
      const { summary, ...missingSummary } = validReport;
      expect(() => ReviewReportSchema.parse(missingSummary)).toThrow(ZodError);
    });

    it('should validate JSON Schema generation with $refStrategy root', () => {
      const schema = zodToJsonSchema(ReviewReportSchema, { $refStrategy: 'root' });
      expect(schema).toBeDefined();
      expect(ReviewReportJSONSchema).toBeDefined();
      expect((ReviewReportJSONSchema as any).properties.pullRequest).toBeDefined();
      expect((ReviewReportJSONSchema as any).properties.fileReviews).toBeDefined();
    });
  });
});
