import { Suspense } from "react";
import HandoffClient from "./handoff-client";

export default function HandoffPage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Opening Task Operations…</p>}>
      <HandoffClient />
    </Suspense>
  );
}
