import { z } from "zod";
import { passwordProblem } from "./password.js";

const text = (value) => String(value ?? "").trim();

export const normalizeChannelNameInput = (value) =>
  text(value).replace(/^#/, "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");

export const normalizeEmojiNameInput = (value) => text(value).replace(/^:|:$/g, "").toLowerCase();

const usernameInput = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(2, "Username must be 2-32 characters")
      .max(32, "Username must be 2-32 characters")
      .regex(/^[a-z0-9_.-]+$/, "Username can only contain letters, numbers, . _ or -")
  );

const displayNameInput = z.string().trim().max(64, "Display name must be 64 characters or fewer");
const personNameInput = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(64, "Name must be 64 characters or fewer")
  .regex(/^[A-Za-z]+$/, "Name can only contain English letters");

export const passwordSchema = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }
});

export function authSchema(mode) {
  if (mode === "login") {
    return z.object({ username: usernameInput, password: z.string().min(1, "Password is required") });
  }

  if (mode === "admin") {
    return z.object({ username: z.literal("admin"), password: passwordSchema });
  }

  return z.object({
    firstName: personNameInput,
    lastName: personNameInput,
    username: usernameInput,
    password: passwordSchema,
  });
}

export const channelSchema = z.object({
  name: z
    .string()
    .transform(normalizeChannelNameInput)
    .pipe(z.string().min(1, "Channel name is required").max(64, "Channel name must be 64 characters or fewer").regex(/^[a-z0-9_-]+$/, "Channel name can only contain lowercase letters, numbers, -, and _")),
  type: z.enum(["public", "private"]),
});

export function emojiNameSchema(existing = []) {
  const taken = new Set(existing.map((e) => String(e?.name || "").toLowerCase()));

  return z
    .string()
    .transform(normalizeEmojiNameInput)
    .pipe(z.string().min(2, "Shortcode must be 2-32 characters").max(32, "Shortcode must be 2-32 characters").regex(/^[a-z0-9_-]+$/, "Shortcode can only contain letters, numbers, _ or -"))
    .superRefine((value, ctx) => {
      if (taken.has(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `":${value}:" already exists` });
      }
    });
}

export function passwordPairSchema({ currentPassword = false } = {}) {
  return z
    .object({
      currentPassword: currentPassword
        ? z.string().min(1, "Current password is required")
        : z.string().optional(),
      newPassword: passwordSchema,
      confirmPassword: z.string().min(1, "Please confirm your password"),
    })
    .superRefine((values, ctx) => {
      if (values.newPassword !== values.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmPassword"],
          message: "Passwords don't match",
        });
      }
    });
}
