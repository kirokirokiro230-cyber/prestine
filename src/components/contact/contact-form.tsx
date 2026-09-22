"use client";

import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { sendContactMessageAction } from "@/app/actions/contact";
import { Button } from "@/components/ui/button";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-primitives";
import { CONTACT_TOPICS } from "@/lib/contact";
import {
  email as validateEmail,
  required,
  type Errors,
} from "@/lib/validation";

type Field = "name" | "email" | "topic" | "orderRef" | "message";

const INITIAL_VALUES = {
  name: "",
  email: "",
  topic: "sizing",
  orderRef: "",
  message: "",
};

/**
 * Client care enquiry form.
 *
 * Client validation gives immediate feedback; `sendContactMessageAction` repeats every
 * check at the trust boundary, throttles abuse and sends through the same central Resend
 * transport as order lifecycle email. The browser never chooses the recipient — it is
 * always the client-care address in Store Settings — so this form cannot be used as an
 * open relay.
 */
export function ContactForm() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState<Errors<Field>>({});
  const [submitError, setSubmitError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  const set = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError(undefined);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const next: Errors<Field> = {
      name: required(values.name, "Name") ?? undefined,
      email: validateEmail(values.email) ?? undefined,
      message: required(values.message, "Message") ?? undefined,
    };

    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, value]) => Boolean(value)),
    ) as Errors<Field>;

    setErrors(cleaned);
    setSubmitError(undefined);
    if (Object.keys(cleaned).length > 0) return;

    const formData = new FormData(event.currentTarget);
    setStatus("sending");

    try {
      const result = await sendContactMessageAction(formData);
      if (result.ok) {
        setStatus("sent");
        return;
      }

      setErrors(result.fieldErrors ?? {});
      setSubmitError(result.error ?? "We could not send your message. Please try again.");
      setStatus("idle");
    } catch {
      setSubmitError("We could not reach client care. Please try again or email us directly.");
      setStatus("idle");
    }
  };

  if (status === "sent") {
    return (
      <div role="status" className="border border-line bg-surface p-8">
        <CheckCircle
          size={26}
          weight="fill"
          aria-hidden
          className="text-success-700 dark:text-success-500"
        />
        <h2 className="mt-4 text-2xl leading-tight">Message received.</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-content-muted">
          Thank you, {values.name.split(" ")[0]}. We have your enquiry and will reply to{" "}
          <strong className="font-medium text-content">{values.email}</strong> — usually
          within two working hours, and always within one working day.
        </p>
        <Button
          variant="outline"
          size="md"
          className="mt-6"
          onClick={() => {
            setValues(INITIAL_VALUES);
            setErrors({});
            setSubmitError(undefined);
            setStatus("idle");
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="relative flex flex-col gap-5">
      {/* Bot trap: kept out of sight and the accessibility tree for real shoppers. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <FormFeedback error={submitError} />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="name"
          label="Your name"
          autoComplete="name"
          maxLength={120}
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          error={errors.name}
          required
        />
        <TextField
          name="email"
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={320}
          value={values.email}
          onChange={(event) => set("email", event.target.value)}
          error={errors.email}
          required
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          name="topic"
          label="What is it about?"
          value={values.topic}
          onValueChange={(next) => set("topic", next)}
          options={[...CONTACT_TOPICS]}
          error={errors.topic}
        />
        <TextField
          name="orderRef"
          label="Order reference (optional)"
          placeholder="PR-260612-K4TQ"
          maxLength={40}
          value={values.orderRef}
          onChange={(event) => set("orderRef", event.target.value)}
          error={errors.orderRef}
          hint="Speeds things up if your question is about an order."
        />
      </div>

      <TextArea
        name="message"
        label="Message"
        rows={7}
        maxLength={5000}
        value={values.message}
        onChange={(event) => set("message", event.target.value)}
        error={errors.message}
        hint="For sizing questions, include your usual size and your chest, waist or hip measurement."
        required
      />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send message"}
        </Button>
        <p className="text-xs text-content-subtle">
          We reply to every message. We never pass your details to anyone.
        </p>
      </div>
    </form>
  );
}
