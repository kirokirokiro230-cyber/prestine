"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SignIn as SignInIcon } from "@phosphor-icons/react";
import { signIn, type AuthFormState } from "@/app/actions/customer-auth";
import { TextField } from "@/components/ui/field";
import { FormFeedback, SubmitButton } from "@/components/ui/form-primitives";

/**
 * Sign in. The error is deliberately identical for an unregistered number and a
 * wrong password — see `customer-auth.ts` for why.
 */
export function SigninForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signIn, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormFeedback error={state.error} />

      <input type="hidden" name="next" value={next} />

      <TextField
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+91 98765 43210"
        defaultValue={state.phone}
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

      <div className="-mt-1 text-right">
        <Link href="/reset-password" className="text-xs text-content-subtle link-underline">
          Forgot your password?
        </Link>
      </div>

      <SubmitButton pendingLabel="Signing in…">
        <SignInIcon size={14} weight="fill" aria-hidden />
        Sign in
      </SubmitButton>

      <p className="text-center text-xs text-content-subtle">
        New here?{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="link-underline text-content"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
