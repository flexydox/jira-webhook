import { Octokit } from "@octokit/rest";
import { createAppAuth, createOAuthUserAuth } from "@octokit/auth-app";

import { get } from "http";

// 3) request a JWT for the App itself

async function getOctokit() {
  const appId = process.env.GITHUB_APP_ID || "";
  const privateKey = process.env.GITHUB_PRIVATE_KEY || "";
  const installationId = process.env.GITHUB_INSTALLATION_ID || "";

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId
    }
  });

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
  const prCheckRegexString = process.env.PR_CHECK_REGEX || ".*";
  const prCheckRegex = new RegExp(prCheckRegexString);
  const octokit = await getOctokit();
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
