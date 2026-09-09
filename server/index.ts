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
    args.push("--search", `review-involves:${reviewer}`);
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

app.get("/notifications", async (c) => {
  const repo = c.req.query("repo");
  if (!repo) return c.json({ error: "repo is required" }, 400);

  try {
    const since = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { stdout } = await execFileAsync("gh", [
      "api",
      `notifications?all=true&per_page=30&since=${since}`,
    ]);

    const raw = JSON.parse(stdout || "[]") as Array<{
      id: string;
      reason: string;
      updated_at: string;
      subject: {
        title: string;
        url: string;
        latest_comment_url: string | null;
        type: string;
      };
      repository: { full_name: string };
    }>;

    const filtered = raw.filter(
      (n) =>
        n.repository.full_name === repo && n.subject.type === "PullRequest",
    );

    const results = await Promise.all(
      filtered.slice(0, 20).map(async (n) => {
        const prNumber = parseInt(n.subject.url.split("/").pop()!, 10);
        let message = "";
        let actor = "";
        let url = `https://github.com/${repo}/pull/${prNumber}`;

        if (n.reason === "mention" && n.subject.latest_comment_url) {
          try {
            const commentUrl = n.subject.latest_comment_url.replace(
              "https://api.github.com/",
              "",
            );
            const { stdout: cStdout } = await execFileAsync("gh", [
              "api",
              commentUrl,
              "--jq",
              "{body: .body, login: .user.login, id: .id}",
            ]);
            const comment = JSON.parse(cStdout);
            message = (comment.body || "").slice(0, 200);
            actor = comment.login || "";
            if (comment.id) {
              url = `https://github.com/${repo}/pull/${prNumber}#issuecomment-${comment.id}`;
            }
          } catch {
            // ignore comment fetch errors
          }
        }

        return {
          id: n.id,
          type: n.reason,
          prNumber,
          prTitle: n.subject.title,
          message,
          actor,
          createdAt: n.updated_at,
          url,
        };
      }),
    );

    return c.json(results);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
