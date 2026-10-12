"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { Input } from "@/components/ui/input";
import { safeNext } from "@/lib/utils/safe-redirect";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { registerAction } from "../actions";

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    start(async () => {
      const r = await registerAction(values);
      if (!r.ok) return setError(r.error);
      if (r.data.needsVerification) return setSentTo(values.email);
      router.replace(safeNext(next, "/onboarding"));
      router.refresh();
    });
  });

  if (sentTo) {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-5 text-center">
        <MailCheck className="mx-auto size-8 text-primary" />
        <h2 className="font-medium">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to <strong className="text-foreground">{sentTo}</strong>. Open it to finish creating
          your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
      </Field>
      <Field label="Work email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={errors.password?.message}
        hint="At least 10 characters with upper-case, lower-case and a number."
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}
