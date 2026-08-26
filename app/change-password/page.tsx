import { Suspense } from "react";
import { ChangePasswordForm } from "@/src/components/ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <div className="login-card">
            <div className="brand">
              <h1>Company Task Tracker</h1>
              <p>Loading…</p>
            </div>
          </div>
        </div>
      }
    >
      <ChangePasswordForm />
    </Suspense>
  );
}
