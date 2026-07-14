import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Vitest runs each test FILE in its own worker by default, and every
    // worker opens its own Neon Pool (lib/db/client.ts's module-level
    // singleton is per-process, not shared across workers) — running files
    // sequentially avoids 3 workers opening concurrent WebSocket
    // connections to the same Neon branch at once. This suite is small
    // enough that sequential file execution costs nothing.
    fileParallelism: false,
    // Even sequential, the one DB-touching test (seed-membership) still
    // intermittently took 15-20s+ — this is Neon's free-tier scale-to-zero:
    // an idle branch suspends its compute, and the next connection has to
    // wait for it to "wake," which can take a while. 30s comfortably covers
    // a cold start; a genuinely broken query would still fail loudly, just
    // slower.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
