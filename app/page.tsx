import { redirect } from "next/navigation";
import { getMemberships, getProfile } from "@/lib/auth/session";

/** Entry point: send the user to their last organization, or into onboarding when they have none. */
export default async function Home() {
  const [memberships, profile] = await Promise.all([getMemberships(), getProfile()]);
  if (memberships.length === 0) redirect("/onboarding");
  const last = memberships.find((m) => m.org.slug === profile.preferences.lastOrgSlug);
  redirect(`/o/${(last ?? memberships[0]).org.slug}`);
}
