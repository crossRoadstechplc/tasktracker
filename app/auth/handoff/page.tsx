import { Suspense } from "react";
import HandoffClient from "./handoff-client";
import { TaskOpsSplash } from "@/src/components/TaskOpsSplash";

export default function HandoffPage() {
  return (
    <Suspense fallback={<TaskOpsSplash label="Opening Task Operations…" />}>
      <HandoffClient />
    </Suspense>
  );
}
