import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';
import { logger, formatError } from './utils/index.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev <owner> <repo> <pr-number>
 */
export async function main() {
  const [owner, repo, prStr] = process.argv.slice(2);

  // 1. Validate Command-Line Arguments
  if (!owner || !repo || !prStr) {
    console.error('❌ Error: Missing required command-line arguments.');
    console.error('Usage: npm run dev <owner> <repo> <pr-number>');
    console.error('Example: npm run dev airaamane simple-todo-app 1');
    process.exit(1);
  }

  const prNumber = parseInt(prStr, 10);
  if (isNaN(prNumber) || prNumber <= 0 || String(prNumber) !== prStr.trim()) {
    console.error(`❌ Error: Invalid PR number "${prStr}". Must be a valid positive integer.`);
    process.exit(1);
  }

  // 2. Validate Authentication
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasAwsCreds = Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );

  if (hasAnthropicKey) {
    console.log('🔐 Using Anthropic API authentication');
    logger.info('Using Anthropic API authentication');
  } else if (hasAwsCreds) {
    if (!process.env.AWS_REGION) {
      console.error('❌ Error: AWS credentials detected but AWS_REGION is not set.');
      console.error('Please set AWS_REGION (e.g., us-east-1) in your environment or .env file.');
      process.exit(1);
    }
    console.log('🔐 Using AWS Bedrock authentication');
    logger.info('Using AWS Bedrock authentication', { region: process.env.AWS_REGION });
  } else {
    console.error('❌ Error: No authentication credentials found.');
    console.error('Please configure ONE of the following authentication methods in your .env file:');
    console.error('1. Anthropic API:');
    console.error('   ANTHROPIC_API_KEY=your-api-key-here');
    console.error('2. AWS Bedrock:');
    console.error('   AWS_ACCESS_KEY_ID=your-access-key-id');
    console.error('   AWS_SECRET_ACCESS_KEY=your-secret-access-key');
    console.error('   AWS_REGION=us-east-1');
    process.exit(1);
  }

  // 3. Validate ANTHROPIC_MODEL environment variable
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    console.error('❌ Error: ANTHROPIC_MODEL environment variable is not set.');
    console.error('Please set ANTHROPIC_MODEL in your .env file:');
    console.error('- For Anthropic API: ANTHROPIC_MODEL=claude-sonnet-4-5-20250929');
    console.error('- For AWS Bedrock: ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0');
    process.exit(1);
  }

  // Validate GITHUB_TOKEN environment variable
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error('❌ Error: GITHUB_TOKEN environment variable is not set.');
    console.error('Create a GitHub personal access token with repo/read access and add it to your .env file:');
    console.error('GITHUB_TOKEN=ghp_your_token_here');
    process.exit(1);
  }

  console.log(`🚀 Starting Code Review for ${owner}/${repo} PR #${prNumber} with model ${model}...`);

  try {
    // 4. Create Orchestrator instance and run review
    const orchestrator = new CodeReviewOrchestrator();
    const reviewReport = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    console.log('✅ Code review analysis completed successfully!');
    console.log(`📊 Overall Quality Score: ${reviewReport.summary.overallScore}/100`);
    console.log(`📁 Files Reviewed: ${reviewReport.summary.totalFiles}`);
    console.log(`🚨 Critical Issues: ${reviewReport.summary.criticalIssues}`);
    console.log(`🧪 Test Gaps: ${reviewReport.summary.highPriorityTests}`);
    console.log(`💡 Refactorings: ${reviewReport.summary.refactoringOpportunities}`);

    // 5. Generate Reports using ReportGenerator
    const generator = new ReportGenerator();
    const markdownContent = generator.generateMarkdownReport(reviewReport);
    const htmlContent = generator.generateHTMLReport(reviewReport);
    const jsonContent = generator.generateJSONReport(reviewReport);

    const reportsDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Save PR-specific reports
    const baseFilename = `${owner}_${repo}_${prNumber}`;
    const mdPath = path.join(reportsDir, `${baseFilename}.md`);
    const htmlPath = path.join(reportsDir, `${baseFilename}.html`);
    const jsonPath = path.join(reportsDir, `${baseFilename}.json`);

    fs.writeFileSync(mdPath, markdownContent, 'utf-8');
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    fs.writeFileSync(jsonPath, jsonContent, 'utf-8');

    // Also save default report files (report.json, report.md, report.html)
    fs.writeFileSync(path.join(reportsDir, 'report.md'), markdownContent, 'utf-8');
    fs.writeFileSync(path.join(reportsDir, 'report.html'), htmlContent, 'utf-8');
    fs.writeFileSync(path.join(reportsDir, 'report.json'), jsonContent, 'utf-8');

    console.log(`\n📄 Reports generated in ${reportsDir}:`);
    console.log(`   - Markdown: ${mdPath}`);
    console.log(`   - HTML:     ${htmlPath}`);
    console.log(`   - JSON:     ${jsonPath}`);
    logger.info('Reports saved successfully', {
      directory: reportsDir,
      baseFilename,
      score: reviewReport.summary.overallScore
    });

    return reviewReport;
  } catch (error) {
    const errorMsg = formatError(error);
    console.error(`\n❌ Code review failed: ${errorMsg}`);
    logger.error('Execution failure in main', { error: errorMsg });
    process.exit(1);
  }
}

// Execute if run directly
if (process.argv[1] && (process.argv[1].endsWith('main.ts') || process.argv[1].endsWith('main.js'))) {
  main();
}
