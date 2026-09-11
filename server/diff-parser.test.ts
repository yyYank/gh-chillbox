import { describe, it, expect } from "vitest";
import { parseDiffToChangedLines } from "./diff-parser";

describe("parseDiffToChangedLines", () => {
  it("単一ファイルの追加行を抽出する", () => {
    const diff = `diff --git a/src/api/updateUser.ts b/src/api/updateUser.ts
index 1234567..abcdefg 100644
--- a/src/api/updateUser.ts
+++ b/src/api/updateUser.ts
@@ -30,6 +30,10 @@ export function updateUser(id: string) {
   const user = getUser(id);
   if (!user) return null;
+  const validated = validate(user);
+  if (!validated) {
+    throw new Error("invalid");
+  }
   return user;
 }`;

    const result = parseDiffToChangedLines(diff);
    expect(result).toEqual([
      { file: "src/api/updateUser.ts", changedLines: [32, 33, 34, 35] },
    ]);
  });

  it("複数ファイルの変更を抽出する", () => {
    const diff = `diff --git a/src/pages/UserPage.tsx b/src/pages/UserPage.tsx
index aaa..bbb 100644
--- a/src/pages/UserPage.tsx
+++ b/src/pages/UserPage.tsx
@@ -10,3 +10,5 @@ export function UserPage() {
   return (
+    <div>
+      <UserProfile />
     </div>
diff --git a/src/hooks/useUser.ts b/src/hooks/useUser.ts
index ccc..ddd 100644
--- a/src/hooks/useUser.ts
+++ b/src/hooks/useUser.ts
@@ -5,2 +5,4 @@ export function useUser() {
+  const [loading, setLoading] = useState(true);
+  const data = fetchUser();
   return data;`;

    const result = parseDiffToChangedLines(diff);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      file: "src/pages/UserPage.tsx",
      changedLines: [11, 12],
    });
    expect(result[1]).toEqual({
      file: "src/hooks/useUser.ts",
      changedLines: [5, 6],
    });
  });

  it("削除のみの変更は空の変更行を返す", () => {
    const diff = `diff --git a/src/old.ts b/src/old.ts
index aaa..bbb 100644
--- a/src/old.ts
+++ b/src/old.ts
@@ -10,5 +10,3 @@ function old() {
-  console.log("removed1");
-  console.log("removed2");
   return null;
 }`;

    const result = parseDiffToChangedLines(diff);
    expect(result).toEqual([
      { file: "src/old.ts", changedLines: [] },
    ]);
  });

  it("複数hunkを持つファイルを正しく処理する", () => {
    const diff = `diff --git a/src/service.ts b/src/service.ts
index aaa..bbb 100644
--- a/src/service.ts
+++ b/src/service.ts
@@ -5,3 +5,4 @@ function init() {
   setup();
+  configure();
   return;
@@ -20,3 +21,4 @@ function cleanup() {
   teardown();
+  finalize();
   return;`;

    const result = parseDiffToChangedLines(diff);
    expect(result).toEqual([
      { file: "src/service.ts", changedLines: [6, 22] },
    ]);
  });

  it("空のdiffは空配列を返す", () => {
    expect(parseDiffToChangedLines("")).toEqual([]);
  });

  it("新規ファイル追加を正しく処理する", () => {
    const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abcdefg
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return 42;
+}`;

    const result = parseDiffToChangedLines(diff);
    expect(result).toEqual([
      { file: "src/new.ts", changedLines: [1, 2, 3] },
    ]);
  });
});
