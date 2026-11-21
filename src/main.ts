import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';

dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev -- <owner> <repo> <pr-number>
 */
async function main(): Promise<void> {
  const [owner, repo, prStr] = process.argv.slice(2);

  if (!owner || !repo || !prStr) {
    console.error(
      'Usage: npm run dev -- <owner> <repo> <pr-number>'
    );
    process.exit(1);
  }

  const prNumber = Number(prStr);

  if (
    !Number.isInteger(prNumber) ||
    prNumber <= 0
  ) {
    console.error(
      'PR number must be a positive integer.'
    );
    process.exit(1);
  }

  const usingAnthropic =
    Boolean(process.env.ANTHROPIC_API_KEY);

  const usingBedrock =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY);

  if (!usingAnthropic && !usingBedrock) {
    console.error(
      'Authentication missing. Configure either ANTHROPIC_API_KEY or AWS credentials.'
    );
    process.exit(1);
  }

  if (usingBedrock) {
    if (!process.env.AWS_REGION) {
      console.error(
        'AWS_REGION is required when using AWS Bedrock.'
      );
      process.exit(1);
    }

    console.log(
      '🔐 Using AWS Bedrock authentication'
    );
  } else {
    console.log(
      '🔐 Using Anthropic API authentication'
    );
  }

  if (!process.env.ANTHROPIC_MODEL) {
    console.error(
      'ANTHROPIC_MODEL environment variable is required.'
    );
    process.exit(1);
  }

  try {
    console.log('Starting review...');

    const orchestrator =
      new CodeReviewOrchestrator();

    const report =
      await orchestrator.reviewPullRequest(
        owner,
        repo,
        prNumber
      );

    const reportGenerator =
      new ReportGenerator();

    const reportsDir = path.join(
      process.cwd(),
      'reports'
    );

    fs.mkdirSync(reportsDir, {
      recursive: true
    });

    fs.writeFileSync(
      path.join(reportsDir, 'report.json'),
      reportGenerator.generateJSONReport(
        report
      )
    );

    fs.writeFileSync(
      path.join(reportsDir, 'report.md'),
      reportGenerator.generateMarkdownReport(
        report
      )
    );

    fs.writeFileSync(
      path.join(reportsDir, 'report.html'),
      reportGenerator.generateHTMLReport(
        report
      )
    );

    console.log(
      `✅ Reports generated in ${reportsDir}`
    );

  } catch (error) {
    console.error(
      'Code review failed:',
      error instanceof Error
        ? error.message
        : String(error)
    );

    process.exit(1);
  }
}

main();