import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewReportSchema } from '../src/types/report-types';
import { withRetry, withTimeout, ReviewError, ErrorCodes } from '../src/utils/error-handler';
import { RateLimiter, DEFAULT_RATE_LIMITS } from '../src/utils/rate-limiter';

/**
 * Schema Validation Tests
 * Verify that ReviewReportSchema correctly validates report objects
 */
describe('ReviewReportSchema', () => {
  const validReport = {
    pullRequest: { owner: 'octocat', repo: 'Hello-World', number: 1 },
    fileReviews: [],
    summary: {
      totalFiles: 0,
      overallScore: 100,
      criticalIssues: 0,
      highPriorityTests: 0,
      refactoringOpportunities: 0
    },
    recommendations: [],
    metadata: {
      analyzedAt: new Date().toISOString(),
      duration: 1,
      agentVersions: {
        'code-quality-analyzer': '1.0',
        'test-coverage-analyzer': '1.0',
        'refactoring-suggester': '1.0'
      }
    }
  };

  it('accepts a valid ReviewReport object', () => {
    const result = ReviewReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  it('accepts a report with file reviews', () => {
    const reportWithFiles = {
      ...validReport,
      fileReviews: [
        {
          file: 'src/index.ts',
          codeQuality: {
            file: 'src/index.ts',
            issues: [
              {
                line: 10,
                severity: 'high',
                category: 'security',
                description: 'Potential SQL injection',
                suggestion: 'Use parameterized queries'
              }
            ],
            overallScore: 70,
            summary: 'Found security issues'
          },
          testCoverage: {
            file: 'src/index.ts',
            hasTests: true,
            testFiles: ['src/index.test.ts'],
            untestedPaths: [
              {
                type: 'function',
                location: 'line 42',
                priority: 'high',
                reasoning: 'Error handler not tested',
                suggestedTest: 'Test error scenarios'
              }
            ],
            coverageEstimate: 85,
            summary: 'Good coverage overall'
          },
          refactorings: {
            file: 'src/index.ts',
            suggestions: [
              {
                type: 'extract-function',
                location: 'lines 50-100',
                impact: 'high',
                description: 'Extract helper function',
                before: 'function main() { /* 50 lines */ }',
                after: 'function main() { helper(); }',
                benefits: 'Improves readability'
              }
            ],
            summary: 'Some refactoring opportunities'
          }
        }
      ]
    };
    const result = ReviewReportSchema.safeParse(reportWithFiles);
    expect(result.success).toBe(true);
  });

  it('accepts a report with recommendations', () => {
    const reportWithRecs = {
      ...validReport,
      recommendations: [
        {
          priority: 'critical',
          category: 'Security',
          description: 'Fix SQL injection vulnerability',
          files: ['src/database.ts']
        },
        {
          priority: 'high',
          category: 'Testing',
          description: 'Add missing unit tests',
          files: ['src/api.ts', 'src/utils.ts']
        }
      ]
    };
    const result = ReviewReportSchema.safeParse(reportWithRecs);
    expect(result.success).toBe(true);
  });

  it('rejects report without pullRequest', () => {
    const invalid = { ...validReport };
    delete (invalid as any).pullRequest;
    const result = ReviewReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects report with missing summary fields', () => {
    const invalid = {
      ...validReport,
      summary: { ...validReport.summary, totalFiles: undefined }
    };
    const result = ReviewReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects report with invalid priority', () => {
    const invalid = {
      ...validReport,
      recommendations: [
        {
          priority: 'invalid-priority',
          category: 'Test',
          description: 'Test',
          files: []
        }
      ]
    };
    const result = ReviewReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

/**
 * Error Handler Tests
 * Verify retry and timeout utilities work correctly
 */
describe('withRetry', () => {
  it('returns result on first attempt if successful', async () => {
    const result = await withRetry(async () => 'success', 3, 1);
    expect(result).toBe('success');
  });

  it('retries once after a transient failure', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts === 1) throw new Error('temporary failure');
        return 'ok';
      },
      2,
      1
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('retries multiple times with exponential backoff', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('temporary failure');
        return 'success';
      },
      5,
      1
    );
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('throws ReviewError after exhausting retries', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('permanent failure');
        },
        2,
        1
      )
    ).rejects.toThrow(ReviewError);
  });

  it('includes retry metadata in ReviewError', async () => {
    try {
      await withRetry(
        async () => {
          throw new Error('test error');
        },
        2,
        1
      );
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ReviewError);
      expect((error as ReviewError).code).toBe(ErrorCodes.RETRY_EXHAUSTED);
      expect((error as ReviewError).metadata?.retries).toBe(2);
    }
  });
});

describe('withTimeout', () => {
  it('returns result if operation completes before timeout', async () => {
    const result = await withTimeout(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'completed';
      },
      100
    );
    expect(result).toBe('completed');
  });

  it('rejects when an operation exceeds the timeout', async () => {
    await expect(
      withTimeout(
        () => new Promise(resolve => setTimeout(resolve, 100)),
        5
      )
    ).rejects.toThrow(ReviewError);
  });

  it('throws ReviewError with AGENT_TIMEOUT code', async () => {
    try {
      await withTimeout(
        () => new Promise(resolve => setTimeout(resolve, 100)),
        5
      );
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ReviewError);
      expect((error as ReviewError).code).toBe(ErrorCodes.AGENT_TIMEOUT);
    }
  });

  it('uses custom error message', async () => {
    try {
      await withTimeout(
        () => new Promise(resolve => setTimeout(resolve, 100)),
        5,
        'Custom timeout message'
      );
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as ReviewError).message).toBe('Custom timeout message');
    }
  });
});

/**
 * Rate Limiter Tests
 * Verify rate limiting logic and sliding window implementation
 */
describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it('initializes with default config', () => {
    expect(limiter.getStatus().activeRequests).toBe(0);
    expect(limiter.getStatus().requestsInWindow).toBe(0);
  });

  it('allows request when under limits', () => {
    expect(limiter.canProceed(100)).toBe(true);
  });

  it('tracks active requests', async () => {
    await limiter.acquire(100);
    expect(limiter.getStatus().activeRequests).toBe(1);

    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(0);
  });

  it('records requests in history', async () => {
    await limiter.acquire(500);
    expect(limiter.getStatus().requestsInWindow).toBe(1);
    expect(limiter.getStatus().tokensInWindow).toBe(500);
  });

  it('calculates available requests correctly', async () => {
    const initial = limiter.getStatus().availableRequests;
    await limiter.acquire(100);
    const after = limiter.getStatus().availableRequests;
    expect(after).toBe(initial - 1);
  });

  it('calculates available tokens correctly', async () => {
    const initial = limiter.getStatus().availableTokens;
    await limiter.acquire(5000);
    const after = limiter.getStatus().availableTokens;
    expect(after).toBe(initial - 5000);
  });

  it('prevents exceeding concurrent request limit', async () => {
    const limiterWithLimit = new RateLimiter({ maxConcurrent: 2 });

    await limiterWithLimit.acquire(100);
    await limiterWithLimit.acquire(100);

    // Now at limit, canProceed should be false
    expect(limiterWithLimit.canProceed(100)).toBe(false);

    limiterWithLimit.release();
    expect(limiterWithLimit.canProceed(100)).toBe(true);
  });

  it('prevents exceeding token limit', async () => {
    const limiterWithLimit = new RateLimiter({ maxTokensPerMinute: 10000 });

    await limiterWithLimit.acquire(9000);
    expect(limiterWithLimit.canProceed(1500)).toBe(false);
    expect(limiterWithLimit.canProceed(1000)).toBe(true);
  });

  it('prevents exceeding request rate', async () => {
    const limiterWithLimit = new RateLimiter({ maxRequestsPerMinute: 2 });

    await limiterWithLimit.acquire(100);
    await limiterWithLimit.acquire(100);

    expect(limiterWithLimit.canProceed(100)).toBe(false);
  });

  it('updates token count on release', async () => {
    await limiter.acquire(1000);
    expect(limiter.getStatus().tokensInWindow).toBe(1000);

    limiter.release(1500);
    expect(limiter.getStatus().tokensInWindow).toBe(1500);
  });

  it('handles multiple concurrent requests', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(limiter.acquire(100));
    }
    await Promise.all(promises);

    expect(limiter.getStatus().activeRequests).toBe(5);
    expect(limiter.getStatus().requestsInWindow).toBe(5);
  });
});

/**
 * Integration Tests
 * Test real-world scenarios combining multiple components
 */
describe('Integration Tests', () => {
  it('validates orchestrator report schema structure', () => {
    const orchestratorOutput = {
      pullRequest: {
        owner: 'facebook',
        repo: 'react',
        number: 25000
      },
      fileReviews: [
        {
          file: 'src/component.tsx',
          codeQuality: {
            file: 'src/component.tsx',
            issues: [],
            overallScore: 95,
            summary: 'Well-written code'
          },
          testCoverage: {
            file: 'src/component.tsx',
            hasTests: true,
            testFiles: ['src/component.test.tsx'],
            untestedPaths: [],
            coverageEstimate: 95,
            summary: 'Excellent coverage'
          },
          refactorings: {
            file: 'src/component.tsx',
            suggestions: [],
            summary: 'No refactoring needed'
          }
        }
      ],
      summary: {
        totalFiles: 1,
        overallScore: 95,
        criticalIssues: 0,
        highPriorityTests: 0,
        refactoringOpportunities: 0
      },
      recommendations: [],
      metadata: {
        analyzedAt: '2026-11-21T13:19:00.000Z',
        duration: 45000,
        agentVersions: {
          'code-quality-analyzer': '1.0',
          'test-coverage-analyzer': '1.0',
          'refactoring-suggester': '1.0'
        }
      }
    };

    const result = ReviewReportSchema.safeParse(orchestratorOutput);
    expect(result.success).toBe(true);
  });

  it('combines retry and timeout utilities', async () => {
    let attempts = 0;
    const result = await withTimeout(
      () =>
        withRetry(
          async () => {
            attempts++;
            if (attempts < 2) throw new Error('transient error');
            return 'success';
          },
          3,
          1
        ),
      5000
    );
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('handles rate limiting with concurrent operations', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 3 });

    const operations = [];
    for (let i = 0; i < 5; i++) {
      operations.push(
        (async () => {
          await limiter.acquire(100);
          try {
            await new Promise(resolve => setTimeout(resolve, 10));
          } finally {
            limiter.release();
          }
        })()
      );
    }

    await Promise.all(operations);
    expect(limiter.getStatus().activeRequests).toBe(0);
  });
});

/**
 * Integration Tests with Real GitHub PR
 * To run this test locally:
 *   export GITHUB_TOKEN=ghp_your_token_here
 *   npm test -- --reporter=verbose --run
 *
 * Example public repositories for testing:
 *   - octocat/Hello-World (simple test repo, PR #1)
 *   - facebook/react (large repo, various PRs)
 *   - google/material-design-lite (design repo)
 *
 * Note: Keep this test skipped in automated CI to avoid rate limiting
 * and unnecessary API usage. Only use for manual integration testing.
 */
it.skip('should review a real small PR from octocat/Hello-World', async () => {
  // This test is intentionally skipped to avoid:
  // 1. Requiring GITHUB_TOKEN in CI environments
  // 2. Exceeding API rate limits during automated test runs
  // 3. Creating unnecessary load on external services
  //
  // To test manually:
  // 1. Set GITHUB_TOKEN environment variable
  // 2. Update the test to call CodeReviewOrchestrator.reviewPullRequest('octocat', 'Hello-World', 1)
  // 3. Run: npm test -- --reporter=verbose
  //
  // Expected behavior:
  // - Fetches PR details from GitHub
  // - Analyzes changed files
  // - Returns ReviewReport with valid structure
  // - All assertions should pass

  expect(true).toBe(true);
});
