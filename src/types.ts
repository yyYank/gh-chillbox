export type PR = {
  number: number;
  title: string;
  author: { login: string; is_bot: boolean };
  reviewRequests: { login: string }[];
  url: string;
  state: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Filter = "open" | "reviewer-me" | "group-by-author" | "hidden";

export type AppNotification = {
  id: string;
  type: string;
  prNumber: number;
  prTitle: string;
  message: string;
  actor: string;
  createdAt: string;
  url: string;
};
