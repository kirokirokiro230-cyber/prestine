"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, UserPlus } from "@phosphor-icons/react";
import {
  completeSignup,
  requestSignupCode,
  type AuthFormState,
} from "@/app/actions/customer-auth";
import { TextField } from "@/components/ui/field";
import { FormFeedback, SubmitButton } from "@/components/ui/form-primitives";

/**
 * Two-step signup: details and password first, then the code texted to that number.
 *
 * The step lives in component state rather than the server response alone, because
 * once a code has been sent the phone number field should not be editable — changing
 * it would mean confirming a code against a different number than the one it was
 * texted to.
 */
export function SignupForm({ next }: { next: string }) {
  const [detailsState, detailsAction] = useActionState<AuthFormState, FormData>(
    requestSignupCode,
    {},
  );
  const [codeState, codeAction] = useActionState<AuthFormState, FormData>(
    completeSignup,
    {},
  );
  // Once a code has been sent, dismissing it (rather than the server response) is what
  // sends the shopper back to the details step — the server has no "go back" state.
  const [wentBack, setWentBack] = useState(false);

  const codeSent = Boolean(detailsState.success && detailsState.phone) && !wentBack;

  if (codeSent) {
    const phone = detailsState.phone ?? codeState.phone ?? "";
    return (
      <form action={codeAction} className="flex flex-col gap-4">
        <FormFeedback error={codeState.error} success={detailsState.success} />

        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="next" value={next} />

        <p className="text-sm text-content-muted">
          Enter the code sent to <span className="text-content">{phone}</span>.
        </p>

        <TextField
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          required
          error={codeState.fieldErrors?.code}
        />

        <SubmitButton pendingLabel="Verifying…">
          Create account
          <ArrowRight size={14} aria-hidden />
        </SubmitButton>

        <button
          type="button"
          onClick={() => setWentBack(true)}
          className="text-center text-xs text-content-subtle link-underline"
        >
          Use a different number
        </button>
      </form>
    );
  }

  return (
    <form
      action={detailsAction}
      onSubmit={() => setWentBack(false)}
      className="flex flex-col gap-4"
    >
      <FormFeedback error={detailsState.error} />

      <input type="hidden" name="next" value={next} />

      <TextField
        label="Full name"
        name="name"
        autoComplete="name"
        autoFocus
        required
        error={detailsState.fieldErrors?.name}
      />

      <TextField
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+91 98765 43210"
        required
        error={detailsState.fieldErrors?.phone}
        hint="We will text a code to this number to confirm it is yours."
      />

      <TextField
        label="Email address"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={detailsState.fieldErrors?.email}
        hint="Optional. Used only to send order receipts."
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={detailsState.fieldErrors?.password}
        hint="At least 12 characters, with upper and lower case and a number."
      />

      <SubmitButton pendingLabel="Sending code…">
        <UserPlus size={14} weight="fill" aria-hidden />
        Send verification code
      </SubmitButton>

      <p className="text-center text-xs text-content-subtle">
        Already have an account?{" "}
        <Link
          href={`/signin?next=${encodeURIComponent(next)}`}
          className="link-underline text-content"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
