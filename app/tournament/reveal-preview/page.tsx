import { notFound } from "next/navigation";
import { RevealPreview } from "./RevealPreview";

// DEV-ONLY: a harness for tuning the SIMULATE reveal animation in isolation
// (no draft/entry required). Hidden in production; not linked from anywhere.
export default function RevealPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--md-paper)",
        padding: "40px 16px 120px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 className="font-cover uppercase" style={{ fontSize: 30, marginBottom: 20 }}>
          Simulate — dev preview
        </h1>
        <RevealPreview />
      </div>
    </main>
  );
}
