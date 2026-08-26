import { Suspense } from "react";
import { LoginForm } from "@/src/components/LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <div className="login-card">
            <div className="brand">
              <h1>Company Task Tracker</h1>
              <p>Loading sign in…</p>
            </div>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
