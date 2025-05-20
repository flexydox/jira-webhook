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
      console.log(
        `Re-running check: ${check.name} ${check.id} for PR #${pr.number}, commit: ${pr.head.sha}`
      );

      // list actions for the check
      const { data: actions } = await octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch: pr.head.ref,
        check_name: check.name,
        status: "completed"
      });

      for (const workflowRun of actions.workflow_runs) {
        if (
          workflowRun.head_sha !== pr.head.sha ||
          workflowRun.status !== "completed"
        ) {
          continue;
        }
        console.log(
          `Re-running workflow run: ${workflowRun.name} ${workflowRun.id} for PR #${pr.number}, commit: ${pr.head.sha}`
        );
        const { data: jobsResult } =
          await octokit.actions.listJobsForWorkflowRun({
            owner,
            repo,
            run_id: workflowRun.id
          });
        const jobNameOk = jobsResult.jobs.some((job) => {
          return prCheckRegex.test(job.name);
        });
        if (!jobNameOk) {
          console.log(
            `Skipping workflow run: ${workflowRun.name} ${
              workflowRun.id
            } for PR #${pr.number}, commit: ${
              pr.head.sha
            }, jobs: ${jobsResult.jobs
              .map((j) => j.name)
              .join(",")} as the job name does not match the regex.`
          );
          continue;
        }
        try {
          await octokit.actions.reRunWorkflow({
            owner,
            repo,
            run_id: workflowRun.id
          });
        } catch (err) {
          console.error(
            `Failed to re-run workflow run: ${workflowRun.name} ${workflowRun.id} for PR #${pr.number}, commit: ${pr.head.sha}`,
            err
          );
        }
        // await octokit.actions.reRunWorkflow({
        //   owner,
        //   repo,
        //   run_id: workflowRun.id
        // });
      }
      // // Re-run each check suite (if supported)
      // if (check.check_suite && check.check_suite.id) {
      //   const checkSuiteId = check.check_suite.id;

      //   try {
      //     const { data: runs } = await octokit.request(
      //       "GET /repos/{owner}/{repo}/check-suites/{check_suite_id}/check-runs",
      //       {
      //         owner,
      //         repo,
      //         check_suite_id: checkSuiteId
      //       }
      //     );
      //     if (runs.check_runs.length > 0) {
      //       console.log(
      //         `Re-running check suite for PR #${pr.number}, check: ${check.name}`
      //       );
      //       for (const run of runs.check_runs) {
      //         console.log(
      //           `Re-running check run: ${run.name} for PR #${pr.number}, check: ${check.name}`
      //         );
      //         await octokit.checks.rerequestRun({
      //           owner,
      //           repo,
      //           check_run_id: run.id
      //         });
      //       }
      //     } else {
      //       console.warn(
      //         `No check runs found for check suite ID: ${checkSuiteId} on PR #${pr.number}`
      //       );
      //     }
      //     await octokit.checks.rerequestSuite({
      //       owner,
      //       repo,
      //       check_suite_id: check.check_suite.id
      //     });
      //     console.log(
      //       `Re-requested check suite for PR #${pr.number}, check: ${check.name}`
      //     );
      //   } catch (err) {
      //     console.error(
      //       `Failed to re-run check for PR #${pr.number}, check: ${check.name}`,
      //       err
      //     );
      //   }
      // } else {
      //   console.warn(
      //     `No check_suite found for check: ${check.name} on PR #${pr.number}`
      //   );
      // }
    }
  }
}
