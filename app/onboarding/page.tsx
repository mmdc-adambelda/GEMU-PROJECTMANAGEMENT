import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMemberships, getProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard, type WizardState } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const fresh = sp.new === "1";
  const [memberships, profile] = await Promise.all([getMemberships(), getProfile()]);
  const supabase = await createClient();

  let state: WizardState = { step: 1, org: null, workspaceId: null, projectId: null, projectKey: null, firstName: profile.full_name.split(" ")[0] ?? "" };

  if (!fresh) {
    // Resume an organization this user owns but has not finished setting up.
    for (const m of memberships.filter((x) => x.role === "owner")) {
      const [ws, pr] = await Promise.all([
        supabase.from("workspaces").select("id").eq("org_id", m.org.id).limit(1),
        supabase.from("projects").select("id, key").eq("org_id", m.org.id).limit(1),
      ]);
      const { count: tasks } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("org_id", m.org.id);
      if ((tasks ?? 0) > 0) continue;
      state = {
        ...state,
        org: { id: m.org.id, slug: m.org.slug, name: m.org.name, logoUrl: m.org.logo_url },
        workspaceId: ws.data?.[0]?.id ?? null,
        projectId: pr.data?.[0]?.id ?? null,
        projectKey: pr.data?.[0]?.key ?? null,
        step: !ws.data?.length ? 2 : !pr.data?.length ? 3 : 5,
      };
      break;
    }
    if (state.step === 1 && memberships.length > 0) redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-10">
      <OnboardingWizard initial={state} />
    </div>
  );
}
