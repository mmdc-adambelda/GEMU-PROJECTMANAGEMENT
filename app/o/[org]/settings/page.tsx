import type { Metadata } from "next";
import { getOrgContext } from "@/lib/auth/session";
import { GeneralSettings } from "./general-settings";

export const metadata: Metadata = { title: "Organization settings" };

export default async function SettingsPage({ params }: PageProps<"/o/[org]/settings">) {
  const { org: slug } = await params;
  const { org, role } = await getOrgContext(slug);
  return <GeneralSettings org={org} role={role} />;
}
