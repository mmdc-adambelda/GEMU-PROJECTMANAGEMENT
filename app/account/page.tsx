import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { getMemberships, getProfile } from "@/lib/auth/session";
import { AccountSettings } from "./account-settings";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const [profile, memberships] = await Promise.all([getProfile(), getMemberships()]);
  const home = memberships[0] ? `/o/${memberships[0].org.slug}` : "/";
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <Link href={home} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to app</Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Profile & account</h1>
      <AccountSettings profile={profile} />
    </div>
  );
}
