import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ status: "ok" }));

const PR_FIELDS =
  "number,title,author,reviewRequests,url,state,isDraft,createdAt,updatedAt";

app.get("/prs", async (c) => {
  const reviewer = c.req.query("reviewer");
  const repo = c.req.query("repo");

  const args = [
    "pr",
    "list",
    "--state",
    "open",
    "--json",
    PR_FIELDS,
    "--limit",
    "100",
  ];

  if (repo) {
    args.push("--repo", repo);
  }

  if (reviewer) {
    args.push("--search", `review-requested:${reviewer}`);
  }

  try {
    const { stdout } = await execFileAsync("gh", args);
    const prs = JSON.parse(stdout);
    return c.json(prs);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
