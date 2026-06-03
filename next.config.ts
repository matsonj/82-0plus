import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DuckDB ships platform-specific native bindings (.node). Keep them out of the
  // bundler so they're required at runtime instead — works in dev (Turbopack)
  // and on Vercel's Node.js runtime.
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
};

export default nextConfig;
