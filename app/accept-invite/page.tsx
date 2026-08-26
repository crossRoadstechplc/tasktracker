import { Suspense } from "react";
import { AcceptInviteForm } from "@/src/components/AcceptInviteForm";

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <div className="login-card">
            <div className="brand">
              <h1>Company Task Tracker</h1>
              <p>Loading invite…</p>
            </div>
          </div>
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
