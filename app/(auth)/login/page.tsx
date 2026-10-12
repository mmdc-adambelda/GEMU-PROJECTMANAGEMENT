import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That link is invalid or has expired. Request a new one.",
  oauth: "Sign-in with the provider failed. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const err = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
      </div>
      <LoginForm next={next} initialError={err} />
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href={`/register${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
