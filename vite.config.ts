import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 15173,
    // .cache には PR ごとの worktree が作られ、その中の html を検知すると画面ごとリロードされてしまう
    watch: { ignored: ["**/.cache/**"] },
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "server/**/*.test.ts"],
  },
});
