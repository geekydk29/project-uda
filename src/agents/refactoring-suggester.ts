import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

export const refactoringSuggester: AgentDefinition = {
  description:
    'Suggests code refactoring opportunities, modernization improvements, simplification strategies, and architectural enhancements.',

  model: 'inherit',

  tools: [
    'Read',
    'Grep',
    'Skill'
  ],

  prompt: `
Review the code for refactoring opportunities.

Use the Skill tool when language-specific or domain-specific refactoring skills are relevant.

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
