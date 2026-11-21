import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

export const refactoringSuggester: AgentDefinition = {
  description:
    'Suggests code refactoring opportunities, modernization improvements, simplification strategies, and architectural enhancements.',

  model: 'inherit',

  tools: [
    'Read',
    'Grep'
  ],

  prompt: `
Review the code for refactoring opportunities.

Focus on:
- Complexity reduction
- Function extraction
- Naming improvements
- Modern language features
- Architectural improvements
- Pattern improvements

Return output matching the RefactoringSuggestion schema.
`
};
