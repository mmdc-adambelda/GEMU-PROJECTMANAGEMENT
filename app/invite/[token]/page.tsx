import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/types";
import { AcceptInvitation } from "./accept";

export const metadata: Metadata = { title: "Join organization" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation_preview", { p_token: token });
  const inv = (data as Array<{ org_name: string; role: OrgRole; email: string; state: string }> | null)?.[0];
  const mismatch = inv && user.email?.toLowerCase() !== inv.email.toLowerCase();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <Logo />
      <div className="space-y-4 rounded-xl border bg-card p-6">
        {!inv ? (
          <>
            <h1 className="text-xl font-semibold">Invitation not found</h1>
            <p className="text-sm text-muted-foreground">This link is invalid. Ask the person who invited you to send a new one.</p>
          </>
        ) : inv.state !== "pending" ? (
          <>
            <h1 className="text-xl font-semibold">Invitation {inv.state}</h1>
            <p className="text-sm text-muted-foreground">
              This invitation to <strong>{inv.org_name}</strong> is no longer valid. Ask an admin to send a new one.
            </p>
          </>
        ) : (
          <>
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Join {inv.org_name}</h1>
              <p className="text-sm text-muted-foreground">
                You were invited as <strong>{ROLE_LABEL[inv.role]}</strong>. {ROLE_DESCRIPTION[inv.role]}
              </p>
            </div>
            {mismatch ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                This invitation was sent to <strong>{inv.email}</strong>, but you are signed in as <strong>{user.email}</strong>. Sign in
                with the invited address to accept it.
              </p>
            ) : (
              <AcceptInvitation token={token} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
