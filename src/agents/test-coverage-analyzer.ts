import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

export const testCoverageAnalyzer: AgentDefinition = {
  description:
    'Evaluates test coverage, identifies missing tests, uncovered paths, edge cases, and assertion gaps.',

  model: 'inherit',

  tools: [
    'Read',
    'Grep',
    'Skill'
  ],

  prompt: `
Analyze test coverage for the supplied code.

Use the Skill tool when an available testing or language-specific skill is relevant.

Focus on:
- Missing unit tests
- Missing integration tests
- Edge cases
- Branch coverage
- Assertion quality

Return output matching the TestCoverageResult schema.
`
};