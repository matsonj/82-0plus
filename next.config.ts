import type { NextConfig } from "next";

// Data access goes through MotherDuck's PostgreSQL wire endpoint via the pure-JS
// `pg` driver, so there are no native binaries to externalize or trace.
const nextConfig: NextConfig = {};

export default nextConfig;
