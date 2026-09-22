"use client";

import { useActionState, useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  Clock,
  Envelope,
  PaperPlaneTilt,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  resetEmailTemplateAction,
  saveEmailTemplateAction,
  sendCustomEmailAction,
  sendDueReviewRequestsAction,
  type EmailActionState,
} from "@/app/admin/actions/email";
import { Button } from "@/components/ui/button";
import { Checkbox, TextArea, TextField } from "@/components/ui/field";
import { formatDate } from "@/lib/format";
import type { EmailRecord, EmailTemplate, EmailTemplateKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmSubmit, FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * Email templates, the ad-hoc composer and the send log.
 *
 * One page rather than three, because the three questions a merchant arrives with are
 * "what do we send", "did it go", and "can I send one myself" — and answering them in
 * separate places means navigating between them to work out why a customer heard nothing.
 */

/** Merchant-facing labels. The template keys are internal and read like slugs. */
const TEMPLATE_META: Record<
  EmailTemplateKey,
  { label: string; when: string }
> = {
  "order-confirmation": {
    label: "Order confirmation",
    when: "Sent immediately when an order is placed.",
  },
  "out-for-delivery": {
    label: "Out for delivery",
    when:
      "Sent when you mark an order shipped. There is no courier webhook, so this is the last point we reliably know about.",
  },
  delivered: {
    label: "Delivered",
    when: "Sent when you mark an order delivered.",
  },
  "review-request": {
    label: "Review request",
    when:
      "Queued when an order is delivered and sent after the delay set in Settings. Needs the scheduled sweep, or the button below.",
  },
  "order-cancelled": {
    label: "Order cancelled",
    when: "Sent when an order is cancelled, by you or by the customer.",
  },
};

export function EmailManager({
  templates,
  log,
  tokens,
  configured,
  dueReviewCount,
  reviewDelayDays,
  canManageTemplates,
}: {
  templates: EmailTemplate[];
  log: EmailRecord[];
  tokens: Array<{ token: string; describes: string }>;
  /** False when no provider is wired up, which changes what every send means. */
  configured: boolean;
  dueReviewCount: number;
  reviewDelayDays: number;
  canManageTemplates: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {configured ? null : <NotConfiguredNotice />}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr] xl:items-start">
        <div className="flex flex-col gap-6">
          <Panel
            title="Automatic emails"
            description="Sent on their own as an order moves. Switch any of them off to stay silent at that step."
            bodyClassName="px-0 py-0"
          >
            <ul className="divide-y divide-line">
              {templates.map((template) => (
                <TemplateRow
                  key={template.key}
                  template={template}
                  tokens={tokens}
                  editable={canManageTemplates}
                />
              ))}
            </ul>
          </Panel>

          <ReviewSweepPanel
            dueReviewCount={dueReviewCount}
            reviewDelayDays={reviewDelayDays}
          />
        </div>

        <div className="flex flex-col gap-6">
          <CustomEmailPanel configured={configured} />
          <LogPanel log={log} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Setup notice                                                        */
/* ------------------------------------------------------------------ */

/**
 * Shown until a provider is configured.
 *
 * Prominent and unavoidable, because the alternative is a merchant believing their
 * customers are being emailed. Everything on the page still works — messages are rendered
 * and recorded — so this explains the exact difference rather than blocking the UI.
 */
function NotConfiguredNotice() {
  return (
    <div className="border border-warning-500/40 bg-warning-100/60 px-5 py-4 dark:bg-warning-700/20">
      <div className="flex items-start gap-3">
        <Warning
          size={17}
          aria-hidden
          className="mt-0.5 shrink-0 text-warning-700 dark:text-warning-100"
        />
        <div className="min-w-0 text-sm leading-relaxed text-warning-700 dark:text-warning-100">
          <p className="font-medium">No email provider is connected, so nothing is delivered.</p>
          <p className="mt-1.5">
            Every message below is still composed and recorded in the log, marked{" "}
            <strong className="font-medium">logged</strong> rather than{" "}
            <strong className="font-medium">sent</strong> — so you can check the wording
            before any of it reaches a customer. To start delivering, set{" "}
            <code className="font-mono text-xs">RESEND_API_KEY</code> and{" "}
            <code className="font-mono text-xs">EMAIL_FROM</code> in your environment. The
            from-address has to be on a domain you have verified with the provider.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

function TemplateRow({
  template,
  tokens,
  editable,
}: {
  template: EmailTemplate;
  tokens: Array<{ token: string; describes: string }>;
  editable: boolean;
}) {
  const [state, action] = useActionState<EmailActionState, FormData>(
    saveEmailTemplateAction,
    {},
  );
  const [open, setOpen] = useState(false);
  const meta = TEMPLATE_META[template.key];

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{meta.label}</h3>
            <span
              className={cn(
                "inline-flex items-center px-2 py-1 text-2xs font-medium uppercase tracking-[0.08em] leading-none",
                template.enabled
                  ? "bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100"
                  : "bg-surface-sunken text-content-muted",
              )}
            >
              {template.enabled ? "On" : "Off"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-content-muted">{meta.when}</p>
          <p className="mt-1.5 truncate text-xs text-content-subtle">
            Subject: {template.subject}
          </p>
        </div>

        {editable ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
          >
            {open ? "Close" : "Edit"}
          </Button>
        ) : null}
      </div>

      {open && editable ? (
        <div className="mt-4 border-t border-line pt-4">
          <FormFeedback error={state.error} success={state.success} />

          <form action={action} className="mt-2 flex flex-col gap-5">
            <input type="hidden" name="key" value={template.key} />

            <Checkbox
              label="Send this email automatically"
              name="enabled"
              defaultChecked={template.enabled}
              hint="Off means the event happens silently. Nothing is queued and nothing is logged."
            />

            <TextField
              label="Subject"
              name="subject"
              defaultValue={template.subject}
              error={state.fieldErrors?.subject}
              required
            />

            <TextField
              label="Heading"
              name="heading"
              defaultValue={template.heading}
              hint="The large line at the top of the message."
            />

            <TextArea
              label="Body"
              name="body"
              rows={10}
              defaultValue={template.body}
              hint="Plain text. Leave a blank line between paragraphs. The layout, styling and plain-text version are generated for you."
            />

            <TokenReference tokens={tokens} />

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>Save</SubmitButton>
            </div>
          </form>

          {/*
            A separate form, not a second button inside the one above. Nesting forms is
            invalid HTML and the browser silently drops the inner one, so a reset button
            inside the edit form would submit the edit instead.
          */}
          <form action={resetEmailTemplateAction} className="mt-4 border-t border-line pt-4">
            <input type="hidden" name="key" value={template.key} />
            <div className="flex flex-wrap items-center gap-3">
              <ConfirmSubmit confirmLabel="Confirm restore">
                <ArrowCounterClockwise size={13} aria-hidden />
                Restore default wording
              </ConfirmSubmit>
              <p className="text-xs text-content-subtle">
                Replaces the subject, heading and body. Leaves the on/off switch alone.
              </p>
            </div>
          </form>
        </div>
      ) : null}
    </li>
  );
}

/** The placeholder cheat sheet. Without it, the tokens are undiscoverable. */
function TokenReference({
  tokens,
}: {
  tokens: Array<{ token: string; describes: string }>;
}) {
  return (
    <details className="border border-line bg-surface-sunken px-4 py-3">
      <summary className="cursor-pointer text-xs font-medium">
        Placeholders you can use
      </summary>
      <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {tokens.map((entry) => (
          <div key={entry.token} className="min-w-0">
            <dt className="font-mono text-2xs text-content">{entry.token}</dt>
            <dd className="text-xs text-content-muted">{entry.describes}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-content-subtle">
        A placeholder we do not recognise is left in the message exactly as typed, so a
        misspelling shows up rather than leaving a gap mid-sentence.
      </p>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Review sweep                                                        */
/* ------------------------------------------------------------------ */

function ReviewSweepPanel({
  dueReviewCount,
  reviewDelayDays,
}: {
  dueReviewCount: number;
  reviewDelayDays: number;
}) {
  const [state, action] = useActionState<EmailActionState, FormData>(
    sendDueReviewRequestsAction,
    {},
  );

  return (
    <Panel
      title="Review requests"
      description={`Queued when an order is delivered, due ${reviewDelayDays} ${
        reviewDelayDays === 1 ? "day" : "days"
      } later. Change the delay in Settings.`}
    >
      <FormFeedback error={state.error} success={state.success} />

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <div>
          <p data-numeric className="font-display text-3xl leading-none">
            {dueReviewCount}
          </p>
          <p className="mt-1.5 text-xs text-content-muted">
            {dueReviewCount === 1 ? "order is due" : "orders are due"} a review request
          </p>
        </div>

        <form action={action}>
          <SubmitButton variant="secondary" pendingLabel="Sending…" disabled={dueReviewCount === 0}>
            <PaperPlaneTilt size={13} aria-hidden />
            Send due requests
          </SubmitButton>
        </form>
      </div>

      {/*
        Said plainly rather than buried. The queue only drains when something drains it,
        and a merchant who assumes otherwise will wonder for months why no reviews arrive.
      */}
      <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-content-subtle">
        These do not send themselves. Either press the button, or have something call{" "}
        <code className="font-mono text-2xs">POST /api/email/review-requests</code> on a
        schedule with the <code className="font-mono text-2xs">EMAIL_CRON_SECRET</code> as
        a bearer token. Once a day is plenty.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */

function CustomEmailPanel({ configured }: { configured: boolean }) {
  const [state, action] = useActionState<EmailActionState, FormData>(
    sendCustomEmailAction,
    {},
  );

  return (
    <Panel
      title="Send a one-off email"
      description="Uses the same layout as the automatic ones, so it does not arrive looking like it came from somewhere else."
    >
      <FormFeedback error={state.error} success={state.success} />

      {/*
        `key` on the state's success message resets the form after a send. Without it the
        composed message stays on screen and a second click sends the same email again.
      */}
      <form key={state.success ?? "compose"} action={action} className="mt-2 flex flex-col gap-5">
        <TextField
          label="To"
          name="to"
          type="email"
          placeholder="customer@example.com"
          error={state.fieldErrors?.to}
          required
        />
        <TextField
          label="Order reference"
          name="orderId"
          placeholder="PR-260830-ABCD"
          hint="Optional. Files the send against that order so it shows in its history."
        />
        <TextField
          label="Subject"
          name="subject"
          error={state.fieldErrors?.subject}
          required
        />
        <TextField
          label="Heading"
          name="heading"
          hint="Optional. Falls back to the subject."
        />
        <TextArea
          label="Message"
          name="body"
          rows={8}
          error={state.fieldErrors?.body}
          hint="Plain text, blank line between paragraphs. Placeholders are not substituted here — there is no order to resolve them against."
          required
        />

        <div>
          <SubmitButton pendingLabel="Sending…">
            <Envelope size={13} aria-hidden />
            {configured ? "Send" : "Compose and log"}
          </SubmitButton>
        </div>
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Log                                                                 */
/* ------------------------------------------------------------------ */

function LogPanel({ log }: { log: EmailRecord[] }) {
  return (
    <Panel
      title="Recent emails"
      description="Newest first. The last 500 attempts are kept."
      bodyClassName={log.length > 0 ? "px-0 py-0" : undefined}
    >
      {log.length === 0 ? (
        <p className="text-sm text-content-muted">
          Nothing sent yet. Place a test order to see the confirmation appear here.
        </p>
      ) : (
        <ul className="max-h-125 divide-y divide-line overflow-y-auto scrollbar-thin">
          {log.map((record) => (
            <li key={record.id} className="flex items-start gap-3 px-5 py-3">
              <LogIcon status={record.status} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{record.subject}</p>
                <p className="mt-0.5 truncate text-xs text-content-muted">
                  {record.to}
                  {record.orderId ? ` · ${record.orderId}` : ""}
                </p>
                {record.error ? (
                  <p className="mt-1 text-xs leading-relaxed text-danger-500">
                    {record.error}
                  </p>
                ) : null}
              </div>

              <p
                data-numeric
                className="shrink-0 text-2xs tabular-nums text-content-subtle"
              >
                {formatDate(record.at, "short")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Status as an icon plus a label on the icon, not colour alone.
 *
 * `logged` is visually distinct from `sent` deliberately — the two mean genuinely
 * different things to a merchant reading down this list.
 */
function LogIcon({ status }: { status: EmailRecord["status"] }) {
  if (status === "failed") {
    return (
      <WarningCircle
        size={15}
        aria-label="Failed"
        className="mt-0.5 shrink-0 text-danger-500"
      />
    );
  }
  if (status === "logged") {
    return (
      <Clock
        size={15}
        aria-label="Recorded but not delivered"
        className="mt-0.5 shrink-0 text-content-subtle"
      />
    );
  }
  return (
    <CheckCircle
      size={15}
      aria-label="Sent"
      className="mt-0.5 shrink-0 text-success-700 dark:text-success-500"
    />
  );
}
