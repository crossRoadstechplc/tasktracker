import { Suspense } from "react";
import { ChangePasswordForm } from "@/src/components/ChangePasswordForm";
import { PageLoader } from "@/src/components/PageLoader";

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ChangePasswordForm />
    </Suspense>
  );
}
