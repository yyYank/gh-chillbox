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

app.get("/pr-detail", async (c) => {
  const repo = c.req.query("repo");
  const number = c.req.query("number");
  if (!repo || !number) {
    return c.json({ error: "repo and number are required" }, 400);
  }

  try {
    const { stdout } = await execFileAsync("gh", [
      "pr",
      "view",
      number,
      "--repo",
      repo,
      "--json",
      "number,title,body,files",
    ]);
    const data = JSON.parse(stdout);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

const chatSessions = new Map<string, string>();

app.post("/chat", async (c) => {
  const body = await c.req.json<{
    repo: string;
    prNumber: number;
    files?: string[];
    quotedText?: string;
    question: string;
    prTitle: string;
    prBody: string;
  }>();

  const { repo, prNumber, files, quotedText, question, prTitle, prBody } = body;
  if (!repo || !prNumber || !question || (!files?.length && !quotedText)) {
    return c.json({ error: "repo, prNumber, question, and either files or quotedText are required" }, 400);
  }

  const sessionKey = `${repo}:${prNumber}`;
  const existingSessionId = chatSessions.get(sessionKey);

  const args: string[] = ["-p"];

  if (existingSessionId) {
    args.push(question, "--resume", existingSessionId, "--output-format", "json");
  } else {
    const prUrl = `https://github.com/${repo}/pull/${prNumber}`;
    const promptParts = [
      `GitHub PR: ${prTitle} (${prUrl})`,
      `リポジトリ: ${repo}  PR #${prNumber}`,
      "",
      "## PR本文",
      prBody || "(なし)",
      "",
    ];

    if (quotedText) {
      promptParts.push(
        "## 引用テキスト（PR本文から選択）",
        `> ${quotedText.replace(/\n/g, "\n> ")}`,
      );
    } else {
      const fileList = files!.map((f) => `- ${f}`).join("\n");
      promptParts.push("## 質問対象の変更ファイル", fileList);
    }

    promptParts.push("", "## 質問", question);
    args.push(promptParts.join("\n"), "--output-format", "json");
  }

  try {
    const { stdout } = await execFileAsync("claude", args, {
      timeout: 120000,
    });
    const parsed = JSON.parse(stdout);
    if (!existingSessionId && parsed.session_id) {
      chatSessions.set(sessionKey, parsed.session_id);
    }
    return c.json({ answer: parsed.result ?? stdout.trim() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

app.delete("/chat/session", async (c) => {
  const body = await c.req.json<{ repo: string; prNumber: number }>();
  const { repo, prNumber } = body;
  if (!repo || !prNumber) {
    return c.json({ error: "repo and prNumber are required" }, 400);
  }
  const sessionKey = `${repo}:${prNumber}`;
  chatSessions.delete(sessionKey);
  return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
