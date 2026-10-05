import { describe, it, expect } from "vitest";
import { prListArgs } from "./pr-list-args";

const stateOf = (args: string[]) => args[args.indexOf("--state") + 1];

describe("prListArgs", () => {
  it("state 未指定なら open の PR を取得する", () => {
    expect(stateOf(prListArgs({ repo: "o/r" }))).toBe("open");
  });

  it("state が closed ならマージ済みを含む閉じた PR を取得する", () => {
    expect(stateOf(prListArgs({ repo: "o/r", state: "closed" }))).toBe("closed");
  });

  it("想定外の state は open として扱う", () => {
    expect(stateOf(prListArgs({ repo: "o/r", state: "all" }))).toBe("open");
  });
});
