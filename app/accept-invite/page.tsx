import { Suspense } from "react";
import { AcceptInviteForm } from "@/src/components/AcceptInviteForm";
import { PageLoader } from "@/src/components/PageLoader";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AcceptInviteForm />
    </Suspense>
  );
}
