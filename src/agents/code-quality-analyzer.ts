import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

export const codeQualityAnalyzer: AgentDefinition = {
  description:
    'Analyzes code quality, security vulnerabilities, performance issues, maintainability concerns, and best-practice violations.',

  model: 'inherit',

  tools: [
    'Read',
    'Grep',
    'Skill'
  ],

  prompt: `
Analyze the provided source code.

Focus on:
- Security vulnerabilities
- Performance issues
- Maintainability concerns
- Best-practice violations
- Bug risks

When appropriate, use Claude Skills from the skills library
for language-specific analysis.

Return findings that match the CodeQualityResult schema.
`
};