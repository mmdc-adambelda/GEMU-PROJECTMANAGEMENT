"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { googleAuthEnabled, siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/utils/safe-redirect";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { loginAction, resendVerificationAction } from "../actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    start(async () => {
      const r = await loginAction(values);
      if (!r.ok) return setError(r.error);
      router.replace(safeNext(next));
      router.refresh();
    });
  });

  async function google() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
    });
  }

  async function resend() {
    const r = await resendVerificationAction(form.getValues("email"));
    if (r.ok) toast.success("Verification email sent");
    else toast.error(r.error);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      {error?.includes("verify your email") ? (
        <Button type="button" variant="link" className="h-auto p-0" onClick={resend}>
          Resend verification email
        </Button>
      ) : null}
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pending={pending} className="w-full">
        Sign in
      </SubmitButton>
      {googleAuthEnabled ? (
        <Button type="button" variant="outline" className="w-full" onClick={google}>
          Continue with Google
        </Button>
      ) : null}
    </form>
  );
}
