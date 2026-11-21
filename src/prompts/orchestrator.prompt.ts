export function buildOrchestratorPrompt(
  owner: string,
  repo: string,
  prNumber: number
): string {
  return `
Review pull request:

Repository: ${owner}/${repo}
PR Number: ${prNumber}

Instructions:

1. Fetch pull request details.
2. Fetch changed files.
3. Invoke:
   - code-quality-analyzer
   - test-coverage-analyzer
   - refactoring-suggester
4. Aggregate results.
5. Produce a final report matching ReviewReport schema.
`;
}