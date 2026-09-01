import { Suspense } from "react";
import { LoginForm } from "@/src/components/LoginForm";
import { PageLoader } from "@/src/components/PageLoader";

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginForm />
    </Suspense>
  );
}
