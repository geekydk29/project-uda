import { query } from '@anthropic-ai/claude-agent-sdk';

import {
  ReviewReport,
  ReviewReportSchema,
  ReviewReportJSONSchema
} from './types/report-types';

import { mcpServersConfig } from './config/mcp.config';

import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester
} from './agents';

import { buildOrchestratorPrompt } from './prompts/orchestrator.prompt';

export interface OrchestratorOptions {}

function validateReviewReport(raw: unknown): ReviewReport {
  const parsed = ReviewReportSchema.safeParse(raw);
  if (!parsed.success) {
    // Try to fix incomplete data by filtering out invalid array items
    if (typeof raw === 'object' && raw !== null) {
      const data = raw as any;

      // Filter fileReviews to only include complete ones
      if (Array.isArray(data.fileReviews)) {
        data.fileReviews = data.fileReviews.filter((review: any) => {
          return review && typeof review === 'object' && review.file && review.codeQuality && review.testCoverage && review.refactorings;
        });

        // Filter suggestions in each review
        for (const review of data.fileReviews) {
          if (Array.isArray(review.codeQuality?.issues)) {
            review.codeQuality.issues = review.codeQuality.issues.filter((issue: any) =>
              issue && issue.line !== undefined && issue.severity && issue.category && issue.description && issue.suggestion
            );
          }
          if (Array.isArray(review.testCoverage?.untestedPaths)) {
            review.testCoverage.untestedPaths = review.testCoverage.untestedPaths.filter((path: any) =>
              path && path.type && path.location && path.priority && path.reasoning && path.suggestedTest
            );
          }
          if (Array.isArray(review.refactorings?.suggestions)) {
            review.refactorings.suggestions = review.refactorings.suggestions.filter((sugg: any) =>
              sugg && sugg.type && sugg.location && sugg.impact && sugg.description && sugg.before && sugg.after && sugg.benefits
            );
          }
        }
      }

      // Filter recommendations
      if (Array.isArray(data.recommendations)) {
        data.recommendations = data.recommendations.filter((rec: any) =>
          rec && rec.priority && rec.category && rec.description
        );
      }

      // Try parsing again with cleaned data
      const retried = ReviewReportSchema.safeParse(data);
      if (retried.success) {
        return retried.data;
      }
    }

    throw new Error(`Agent output did not match ReviewReport schema: ${parsed.error.message}`);
  }
  return parsed.data;
}

export class CodeReviewOrchestrator {
  constructor() {}

  private async runAgentsForPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<unknown> {
    let result: unknown = null;

    const response = await query({
      prompt: buildOrchestratorPrompt(owner, repo, prNumber),
      options: {
        mcpServers: mcpServersConfig,
        allowedTools: ['Task', 'mcp__github', 'mcp__eslint'],
        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester
        }
      }
    });

    // If response is an async generator, iterate through messages
    if (response && typeof response[Symbol.asyncIterator] === 'function') {
      let lastAssistantMessage: any = null;
      for await (const message of response) {
        // Look for assistant messages with content
        if ((message as any).type === 'assistant' && (message as any).message) {
          lastAssistantMessage = (message as any).message;
        }
      }

      if (lastAssistantMessage && lastAssistantMessage.content) {
        const content = lastAssistantMessage.content;
        // If content is an array of message blocks, extract text
        if (Array.isArray(content)) {
          for (const block of content) {
            if ((block as any).type === 'text') {
              const text = (block as any).text;
              result = this.extractJSONFromText(text);
              if (result) break;
            }
          }
        } else {
          result = this.extractJSONFromText(String(content));
        }
      }
    } else {
      result = (response as any).structured_output || (response as any).content || response;
    }

    return result;
  }

  private extractJSONFromText(text: string): unknown {
    // Try direct JSON parsing first
    try {
      return JSON.parse(text);
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          // Continue trying other patterns
        }
      }

      // Try finding JSON object pattern { ... }
      const objectMatch = text.match(/(\{[\s\S]*\})\s*$/);
      if (objectMatch && objectMatch[1]) {
        try {
          return JSON.parse(objectMatch[1]);
        } catch {
          // Continue trying other patterns
        }
      }

      // If all else fails, return null
      return null;
    }
  }

  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const finalOutput = await this.runAgentsForPullRequest(owner, repo, prNumber);
    return validateReviewReport(finalOutput);
  }
}