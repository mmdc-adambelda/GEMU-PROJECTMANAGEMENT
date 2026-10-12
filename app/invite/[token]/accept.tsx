"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, SubmitButton } from "@/components/app/form-field";
import { acceptInvitationAction } from "@/features/orgs/actions";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    const r = await acceptInvitationAction(token);
    if (!r.ok) {
      setPending(false);
      return setError(r.error);
    }
    router.replace(`/o/${r.data.slug}`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <SubmitButton pending={pending} onClick={accept} type="button" className="w-full">
        Accept invitation
      </SubmitButton>
    </div>
  );
}
