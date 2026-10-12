"use server";

import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { fail, ok, parse, type ActionResult } from "@/lib/utils/action";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@/lib/validations/auth";

export async function loginAction(input: unknown): Promise<ActionResult<{ unverified?: boolean }>> {
  const p = parse(loginSchema, input);
  if ("error" in p) return p.error;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(p.data);
  if (error) {
    if (/not confirmed/i.test(error.message)) {
      return { ok: false, error: "Please verify your email first. Check your inbox for the link." };
    }
    // Same message for unknown email and wrong password (no account enumeration).
    return fail("Invalid email or password.");
  }
  return ok();
}

export async function registerAction(input: unknown): Promise<ActionResult<{ needsVerification: boolean }>> {
  const p = parse(registerSchema, input);
  if ("error" in p) return p.error;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: p.data.email,
    password: p.data.password,
    options: {
      data: { full_name: p.data.fullName },
      emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent("/onboarding")}`,
    },
  });
  if (error) {
    if (/already|registered/i.test(error.message)) return fail("Could not create the account. Try signing in instead.");
    return fail(error.message);
  }
  return ok({ needsVerification: !data.session });
}

export async function resendVerificationAction(email: string): Promise<ActionResult> {
  const p = parse(forgotSchema, { email });
  if ("error" in p) return p.error;
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: p.data.email,
    options: { emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent("/onboarding")}` },
  });
  if (error) return fail("Could not resend the email right now. Try again in a minute.");
  return ok(undefined, "Verification email sent.");
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  const p = parse(forgotSchema, input);
  if ("error" in p) return p.error;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(p.data.email, {
    redirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });
  // Always succeed: never reveal whether an address has an account.
  return ok(undefined, "If an account exists for that email, a reset link is on its way.");
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const p = parse(resetSchema, input);
  if ("error" in p) return p.error;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("This reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password: p.data.password });
  if (error) return fail(error.message);
  return ok(undefined, "Password updated.");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

