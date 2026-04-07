import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/test-coverage-analyzer.prompt.js';

/**
 * Test Coverage Analyzer Subagent
 * Evaluates test completeness, identifies untested paths and code gaps, and suggests specific test cases.
 */
export const testCoverageAnalyzer: AgentDefinition = {
  description: 'Evaluates test completeness and test gaps, identifies untested execution paths, and suggests actionable test cases.',
  prompt: TEST_COVERAGE_ANALYZER_PROMPT,
  tools: ['Skill', 'Read', 'Grep', 'Glob'],
  model: 'inherit'
};
