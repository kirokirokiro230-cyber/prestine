"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LockSimple } from "@phosphor-icons/react";
import { signIn, type AuthFormState } from "@/app/admin/actions/auth";
import { TextField } from "@/components/ui/field";
import { FormFeedback, SubmitButton } from "./primitives";

/**
 * Admin sign-in.
 *
 * The error message is deliberately identical for an unknown email and a wrong
 * password — distinguishing them would confirm which admin addresses exist.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signIn, {});

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl tracking-[0.3em] text-content">
            <span className="-mr-[0.3em] pr-[0.3em]">PRESTINE</span>
          </span>
          <p className="mt-2 text-2xs uppercase tracking-[0.16em] text-content-subtle">
            Admin
          </p>
        </div>

        <form action={action} className="flex flex-col gap-4 border border-line bg-surface p-6">
          <div>
            <h1 className="font-display text-2xl leading-tight">Sign in</h1>
            <p className="mt-1.5 text-xs text-content-muted">
              Access is restricted to store staff.
            </p>
          </div>

          <FormFeedback error={state.error} />

          <input type="hidden" name="next" value={next} />

          <TextField
            label="Email address"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            required
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          <SubmitButton pendingLabel="Signing in…" size="lg" className="mt-1">
            <LockSimple size={14} weight="fill" aria-hidden />
            Sign in
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-xs text-content-subtle">
          <Link href="/" className="link-underline">
            Return to the store
          </Link>
        </p>
      </div>
    </div>
  );
}
