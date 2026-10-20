import { describe, it, expect } from "vitest";
import { createInFlight } from "./in-flight";

describe("createInFlight", () => {
  it("同じキーで同時に呼んだら処理は1回だけ実行し、結果を共有する", async () => {
    const run = createInFlight<string>();
    let calls = 0;
    const task = async () => {
      calls++;
      return "done";
    };
    const results = await Promise.all([run("a", task), run("a", task)]);
    expect(calls).toBe(1);
    expect(results).toEqual(["done", "done"]);
  });

  it("別のキーならそれぞれ実行する", async () => {
    const run = createInFlight<string>();
    let calls = 0;
    const task = async () => {
      calls++;
      return "done";
    };
    await Promise.all([run("a", task), run("b", task)]);
    expect(calls).toBe(2);
  });

  it("前の処理が終わった後に呼んだらもう一度実行する", async () => {
    const run = createInFlight<string>();
    let calls = 0;
    const task = async () => {
      calls++;
      return "done";
    };
    await run("a", task);
    await run("a", task);
    expect(calls).toBe(2);
  });

  it("失敗した後に呼んだらもう一度実行する", async () => {
    const run = createInFlight<string>();
    await expect(run("a", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await run("a", async () => "retry")).toBe("retry");
  });
});
