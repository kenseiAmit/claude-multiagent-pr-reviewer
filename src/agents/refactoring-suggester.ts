import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/refactoring-suggester.prompt.js';

/**
 * Refactoring Suggester Subagent
 * Identifies opportunities to modernize patterns, reduce complexity, extract functions,
 * improve code structure, and provides before/after code examples.
 */
export const refactoringSuggester: AgentDefinition = {
  description: 'Identifies opportunities to improve code structure, reduce complexity, modernize syntax, and suggest refactoring with before/after examples.',
  prompt: REFACTORING_SUGGESTER_PROMPT,
  tools: ['Skill', 'Read', 'Grep', 'Glob'],
  model: 'inherit'
};
