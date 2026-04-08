/**
 * Orchestrator Prompt Builder
 *
 * Instructs the main orchestrator agent to:
 * 1. Fetch Pull Request details and changed files using GitHub MCP tools
 * 2. Explicitly invoke all 3 subagents (code-quality-analyzer, test-coverage-analyzer, refactoring-suggester)
 * 3. Aggregate results into the ReviewReport schema
 */

export function buildOrchestratorPrompt(
  owner: string,
  repo: string,
  prNumber: number,
  fallbackRepo?: { owner: string; repo: string }
): string {
  const fallbackInfo = fallbackRepo
    ? `
REPOSITORY ACCESS & FALLBACK:
Try accessing ${owner}/${repo} PR #${prNumber} first.
If ${owner}/${repo} is inaccessible, private, or returns 404, fetch the pull request details, files, and diffs from the public mirror repository: ${fallbackRepo.owner}/${fallbackRepo.repo} PR #${prNumber}.
IMPORTANT: In the final generated report, ALWAYS record the pullRequest object with the original requested coordinates:
"pullRequest": { "owner": "${owner}", "repo": "${repo}", "number": ${prNumber} }
`
    : '';

  return `You are the Lead Code Review Orchestrator coordinating specialized subagents to perform a comprehensive code review of a GitHub Pull Request.

TARGET REPOSITORY & PULL REQUEST:
- Owner: ${owner}
- Repository: ${repo}
- Pull Request Number: ${prNumber}
${fallbackInfo}
You have access to:
1. GitHub MCP tools (e.g., mcp__github__get_pull_request, mcp__github__get_pull_request_files, mcp__github__get_file_contents) to inspect PR details, modified files, and code changes.
2. Three specialized subagents available via the Task tool:
   - "code-quality-analyzer": Analyzes code for security vulnerabilities, performance, and best practices using Claude Skills.
   - "test-coverage-analyzer": Evaluates test completeness, untested paths, and missing assertions.
   - "refactoring-suggester": Identifies modernization opportunities, code smells, and design pattern improvements.

EXECUTION WORKFLOW:
1. Fetch PR Data:
   - Retrieve pull request changed files for PR #${prNumber} using GitHub MCP tools (prefer mcp__github__get_pull_request_files or get file contents directly). Do NOT fetch comments, reviews, or issue discussion threads.
   - Inspect the file contents and patches/diffs for each changed code file (ignoring binaries and lock files).

2. Explicit Subagent Invocation:
   For the changed files, invoke ALL THREE subagents using the Task tool with explicit instructions:
   - Use the code-quality-analyzer agent to analyze <file_path> with its contents and changes
   - Use the test-coverage-analyzer agent to analyze <file_path> with its contents and changes
   - Use the refactoring-suggester agent to analyze <file_path> with its contents and changes

   Invoke the subagent tasks promptly (you may invoke them in parallel). For static assets (HTML/CSS), focus on structure and accessibility; for executable scripts (JS/TS), focus deeply on logic, security, and edge cases.
   Collect their structured findings efficiently.

3. Aggregate Findings:
   Combine the results into a unified ReviewReport structured object:
   - pullRequest: { owner: "${owner}", repo: "${repo}", number: ${prNumber} }
   - fileReviews: Array of reviews for each file, containing { file, codeQuality, testCoverage, refactorings }
   - summary:
     * totalFiles: number of reviewed files
     * overallScore: average or weighted score across files (0-100)
     * criticalIssues: count of critical severity issues found
     * highPriorityTests: count of critical and high priority test gaps
     * refactoringOpportunities: total count of refactoring suggestions
   - recommendations: Array of top high-level actionable recommendations across the PR ({ priority, category, description, files })
   - metadata:
     * analyzedAt: ISO timestamp (e.g. new Date().toISOString())
     * duration: elapsed time in milliseconds
     * agentVersions: object recording agent versions (e.g. { "orchestrator": "1.0.0", "code-quality-analyzer": "1.0.0", "test-coverage-analyzer": "1.0.0", "refactoring-suggester": "1.0.0" })

Return the final synthesized report strictly conforming to the ReviewReport JSON Schema.`;
}
