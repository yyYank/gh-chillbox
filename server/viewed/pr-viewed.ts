import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ViewedState = "VIEWED" | "UNVIEWED" | "DISMISSED";

type ViewedPage = {
  pullRequestId: string;
  states: Record<string, ViewedState>;
  nextCursor: string | null;
};

const FILES_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      files(first: 100, after: $after) {
        nodes { path viewerViewedState }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

type FilesResponse = {
  data?: {
    repository?: {
      pullRequest?: {
        id: string;
        files: {
          nodes: { path: string; viewerViewedState: ViewedState }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    };
  };
};

export function parseViewedPage(json: FilesResponse): ViewedPage {
  const pr = json?.data?.repository?.pullRequest;
  if (!pr) {
    throw new Error("pull request not found");
  }
  const states: Record<string, ViewedState> = {};
  for (const node of pr.files.nodes) {
    states[node.path] = node.viewerViewedState;
  }
  const { hasNextPage, endCursor } = pr.files.pageInfo;
  return { pullRequestId: pr.id, states, nextCursor: hasNextPage ? endCursor : null };
}

async function graphql(query: string, fields: Record<string, string | number>): Promise<unknown> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(fields)) {
    args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  }
  const { stdout } = await execFileAsync("gh", args);
  return JSON.parse(stdout);
}

export async function fetchViewedStates(repo: string, number: number): Promise<Omit<ViewedPage, "nextCursor">> {
  const [owner, name] = repo.split("/");
  const states: Record<string, ViewedState> = {};
  let pullRequestId = "";
  let after: string | null = null;
  do {
    const fields: Record<string, string | number> = { owner, name, number };
    if (after) {
      fields.after = after;
    }
    const page = parseViewedPage((await graphql(FILES_QUERY, fields)) as FilesResponse);
    pullRequestId = page.pullRequestId;
    Object.assign(states, page.states);
    after = page.nextCursor;
  } while (after);
  return { pullRequestId, states };
}

export async function setFileViewed(pullRequestId: string, path: string, viewed: boolean): Promise<void> {
  const mutation = viewed ? "markFileAsViewed" : "unmarkFileAsViewed";
  const query = `
mutation($pullRequestId: ID!, $path: String!) {
  ${mutation}(input: { pullRequestId: $pullRequestId, path: $path }) { clientMutationId }
}`;
  await graphql(query, { pullRequestId, path });
}
