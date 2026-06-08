import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `server-only` (imported by the token / DAL modules to fail the client build)
// throws when resolved in a plain Node context. Vitest runs those modules directly
// for unit tests, so alias the package to a no-op stub here. The real guard still
// applies in the Next.js build.
export default defineConfig({
  test: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});
