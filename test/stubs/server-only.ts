// No-op stub for the `server-only` package under vitest. The real package throws
// when resolved outside a React Server Component graph (its purpose is to fail the
// CLIENT build). Vitest runs server-only modules directly in Node for unit tests,
// so we alias `server-only` here to this empty module. This does NOT weaken the
// guard in the app: Next.js still resolves the real `server-only` at build time.
export {};
