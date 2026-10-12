"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { Input } from "@/components/ui/input";
import { forgotSchema } from "@/lib/validations/auth";
import { forgotPasswordAction } from "../actions";

export function ForgotForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    start(async () => {
      const r = await forgotPasswordAction(values);
      if (!r.ok) return setError(r.error);
      setDone(r.message ?? "Check your inbox.");
    });
  });

  if (done) return <p className="rounded-lg border bg-card p-4 text-sm">{done}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}
