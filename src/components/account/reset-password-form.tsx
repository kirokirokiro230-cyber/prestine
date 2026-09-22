"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import {
  completePasswordReset,
  requestPasswordResetCode,
  type AuthFormState,
} from "@/app/actions/customer-auth";
import { TextField } from "@/components/ui/field";
import { FormFeedback, SubmitButton } from "@/components/ui/form-primitives";

/** Two-step reset: request a code, then submit it with a new password. */
export function ResetPasswordForm() {
  const [requestState, requestAction] = useActionState<AuthFormState, FormData>(
    requestPasswordResetCode,
    {},
  );
  const [resetState, resetAction] = useActionState<AuthFormState, FormData>(
    completePasswordReset,
    {},
  );
  const [wentBack, setWentBack] = useState(false);

  const codeSent = Boolean(requestState.success && requestState.phone) && !wentBack;

  if (codeSent) {
    const phone = requestState.phone ?? resetState.phone ?? "";
    return (
      <form action={resetAction} className="flex flex-col gap-4">
        <FormFeedback error={resetState.error} success={requestState.success} />

        <input type="hidden" name="phone" value={phone} />

        <p className="text-sm text-content-muted">
          Enter the code sent to <span className="text-content">{phone}</span> and choose
          a new password.
        </p>

        <TextField
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          required
          error={resetState.fieldErrors?.code}
        />

        <TextField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={resetState.fieldErrors?.password}
          hint="At least 12 characters, with upper and lower case and a number."
        />

        <SubmitButton pendingLabel="Resetting…">
          Reset password
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
      action={requestAction}
      onSubmit={() => setWentBack(false)}
      className="flex flex-col gap-4"
    >
      <FormFeedback error={requestState.error} success={requestState.success} />

      <p className="text-sm text-content-muted">
        Enter the mobile number on your account and we will text you a code.
      </p>

      <TextField
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+91 98765 43210"
        autoFocus
        required
        error={requestState.fieldErrors?.phone}
      />

      <SubmitButton pendingLabel="Sending code…">Send code</SubmitButton>

      <p className="text-center text-xs text-content-subtle">
        <Link href="/signin" className="link-underline text-content">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
