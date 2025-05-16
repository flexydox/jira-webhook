import { Octokit } from "@octokit/rest";

function guardEnvVars() {
  const requiredVars = [
    "GITHUB_TOKEN",
    "GITHUB_REPO_OWNER",
    "GITHUB_REPO_NAME"
  ];
  let hasError = false;
  requiredVars.forEach((envVar) => {
    if (!process.env[envVar]) {
      console.error(`${envVar} not set in environment variables.`);
      hasError = true;
    }
  });
  if (hasError) {
    console.error("Please set the required environment variables.");
  }
}

function getOctokit() {
  const githubToken = process.env.GITHUB_TOKEN;
  const octokit = new Octokit({ auth: githubToken });
  return octokit;
}

async function getIssueComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) {
  const { data: comments } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber
  });

  return comments;
}

export async function runPRChecks(issueKey?: string | null) {
  guardEnvVars();
  const prCheckRegexString = process.env.PR_CHECK_REGEX || ".*";
  const prCheckRegex = new RegExp(prCheckRegexString);
  const octokit = getOctokit();
  const owner = process.env.GITHUB_REPO_OWNER || "";
  const repo = process.env.GITHUB_REPO_NAME || "";

  // List all open PRs
  const { data: pullRequests } = await octokit.pulls.list({
    owner,
    repo,
    state: "open"
  });

  for (const pr of pullRequests) {
    const prComments = await getIssueComments(octokit, owner, repo, pr.number);
    if (issueKey) {
      const hasIssueKey = prComments.some((comment) =>
        comment.body?.includes(issueKey)
      );
      if (!hasIssueKey) {
        console.log(
          `Skipping PR #${pr.number} as it does not contain the issue key ${issueKey}.`
        );
        continue;
      }
    }
    // List check runs for the latest commit on the PR
    const { data: checks } = await octokit.checks.listForRef({
      owner,
      repo,
      ref: pr.head.sha
    });
    for (const check of checks.check_runs) {
      if (!prCheckRegex.test(check.name)) {
        console.log(
          `Skipping check: ${check.name} for PR #${pr.number} as it does not match the regex.`
        );
        continue;
      }

      // Re-run each check suite (if supported)
      if (check.check_suite && check.check_suite.id) {
        try {
          await octokit.checks.rerequestSuite({
            owner,
            repo,
            check_suite_id: check.check_suite.id
          });
          console.log(
            `Re-requested check suite for PR #${pr.number}, check: ${check.name}`
          );
        } catch (err) {
          console.error(
            `Failed to re-run check for PR #${pr.number}, check: ${check.name}`,
            err
          );
        }
      } else {
        console.warn(
          `No check_suite found for check: ${check.name} on PR #${pr.number}`
        );
      }
    }
  }
}
