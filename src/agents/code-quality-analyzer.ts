import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/code-quality-analyzer.prompt.js';

/**
 * Code Quality Analyzer Subagent
 * Analyzes code for security vulnerabilities, performance issues, and maintainability concerns.
 * Includes the Skill tool to leverage Claude Skills from .claude/skills/.
 */
export const codeQualityAnalyzer: AgentDefinition = {
  description: 'Analyzes code for security vulnerabilities, performance bottlenecks, bug risks, and best practices using domain skills.',
  prompt: CODE_QUALITY_ANALYZER_PROMPT,
  tools: ['Skill', 'Read', 'Grep', 'Glob'],
  model: 'inherit'
};
