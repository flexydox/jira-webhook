import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import { runPRChecks } from "./run-pr-checks.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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
    process.exit(1);
  }
}

async function envMiddleware(req: Request, res: Response, next: Function) {
  guardEnvVars();
  next();
}
app.use(bodyParser.json());
app.use(envMiddleware);

// Basic endpoint for Jira webhook
app.post("/webhook", async (req: Request, res: Response) => {
  const webhookData = req.body;

  const {
    issue: { key }
  } = webhookData;
  console.log("Issue key:", key);
  await runPRChecks(key);
  res.status(200).send("Webhook received");
});

// Optional: Expose a manual endpoint to trigger re-run
app.post("/rerun-pr-checks", async (_req: Request, res: Response) => {
  await runPRChecks();
  res.send("Triggered re-run of all open PR checks.");
});

app.get("/", (_req: Request, res: Response) => {
  res.send("Jira Webhook Server is running.");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
