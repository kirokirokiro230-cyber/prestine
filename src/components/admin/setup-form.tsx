"use client";

import { useActionState } from "react";
import { ShieldCheck } from "@phosphor-icons/react";
import { createFirstAdmin, type AuthFormState } from "@/app/admin/actions/auth";
import { TextField } from "@/components/ui/field";
import { FormFeedback, SubmitButton } from "./primitives";

/**
 * First-run owner creation.
 *
 * Shown once, before any account exists. The password policy is enforced on the
 * server too — this form only surfaces it early.
 */
export function SetupForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(createFirstAdmin, {});

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl tracking-[0.3em] text-content">
            <span className="-mr-[0.3em] pr-[0.3em]">PRESTINE</span>
          </span>
          <p className="mt-2 text-2xs uppercase tracking-[0.16em] text-content-subtle">
            First-run setup
          </p>
        </div>

        <form action={action} className="flex flex-col gap-4 border border-line bg-surface p-6">
          <div>
            <h1 className="font-display text-2xl leading-tight">Create the owner account</h1>
            <p className="mt-1.5 text-xs leading-relaxed text-content-muted">
              This is the only time this screen appears. The owner has full access,
              including settings and staff management.
            </p>
          </div>

          <FormFeedback error={state.error} />

          <TextField
            label="Your name"
            name="name"
            autoComplete="name"
            error={state.fieldErrors?.name}
            autoFocus
            required
          />

          <TextField
            label="Email address"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            error={state.fieldErrors?.email}
            required
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="At least 12 characters, with upper and lower case and a number."
            error={state.fieldErrors?.password}
            required
          />

          <TextField
            label="Confirm password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            error={state.fieldErrors?.confirm}
            required
          />

          <SubmitButton pendingLabel="Creating account…" size="lg" className="mt-1">
            <ShieldCheck size={14} weight="fill" aria-hidden />
            Create account and sign in
          </SubmitButton>

          <p className="text-xs leading-relaxed text-content-subtle">
            Set <code className="font-mono">ADMIN_SESSION_SECRET</code> in your
            environment before deploying — sessions are signed with it, and it is
            required in production.
          </p>
        </form>
      </div>
    </div>
  );
}
