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
3. Invoke the following agents:
   - code-quality-analyzer (analyzes security, performance, maintainability)
   - test-coverage-analyzer (evaluates test completeness)
   - refactoring-suggester (recommends improvements)
4. Aggregate all results.
5. Produce a final review report as valid JSON matching the ReviewReport schema.

Return ONLY valid JSON (no markdown, no extra text) with this structure:
{
  "pullRequest": {"owner": "string", "repo": "string", "number": 0},
  "fileReviews": [
    {
      "file": "string",
      "codeQuality": {"file": "string", "issues": [], "overallScore": 0, "summary": "string"},
      "testCoverage": {"file": "string", "hasTests": false, "testFiles": [], "untestedPaths": [], "coverageEstimate": 0, "summary": "string"},
      "refactorings": {"file": "string", "suggestions": [], "summary": "string"}
    }
  ],
  "summary": {"totalFiles": 0, "overallScore": 0, "criticalIssues": 0, "highPriorityTests": 0, "refactoringOpportunities": 0},
  "recommendations": [{"priority": "low|medium|high|critical", "category": "string", "description": "string", "files": []}],
  "metadata": {"analyzedAt": "ISO-8601 timestamp", "duration": 0, "agentVersions": {"code-quality-analyzer": "1.0", "test-coverage-analyzer": "1.0", "refactoring-suggester": "1.0"}}
}
`;
}