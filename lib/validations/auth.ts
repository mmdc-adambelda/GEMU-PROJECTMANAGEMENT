import { z } from "zod";

export const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), "Include upper-case, lower-case and a number");

const email = z.string().trim().toLowerCase().email("Enter a valid email");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(100),
  email,
  password,
});

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(100),
  jobTitle: z.string().trim().max(100).nullish().transform((v) => v || null),
  timezone: z.string().trim().min(1).max(64),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
