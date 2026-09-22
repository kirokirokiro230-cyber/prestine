import { email as validateEmail } from "@/lib/validation";
import type { RenderedEmail } from "./templates";

/**
 * How a message actually leaves the building.
 *
 * Two drivers chosen from the environment, exactly as `src/server/storage.ts` picks
 * between disk and Supabase — same reasoning, so the same artefact runs locally and in
 * production without a build flag:
 *
 * - **resend** — HTTP API, used when `RESEND_API_KEY` and `EMAIL_FROM` are both set.
 * - **log** — the default. Records what would have been sent and delivers nothing.
 *
 * ## Why `log` is the default rather than an error
 *
 * A shop must be able to take an order before its email provider is set up. Refusing to
 * place orders because no API key is present would be a self-inflicted outage; pretending
 * the email was sent would be worse. So the unconfigured path records the message with a
 * distinct `logged` status that the admin panel shows plainly, and the merchant can read
 * the queue and see exactly what their customers would have received.
 *
 * ## No SMTP, and no SDK
 *
 * `nodemailer` is the obvious reach and it is a large dependency — this project has six
 * runtime dependencies in total and a bundle check in CI. Resend's send endpoint is one
 * POST with a JSON body, which `fetch` does natively. Adding a driver for another provider
 * means writing one function of the same shape below; nothing above this file changes.
 *
 * ## No retries
 *
 * A failed send is recorded and left. Retrying inside the request would hold a response
 * open on a provider having a bad minute, and a retry queue needs durable scheduling that
 * a single-process JSON store cannot honestly provide. The admin panel can resend, which
 * puts the decision with the person who can see whether it matters.
 */

export type EmailDriver = "resend" | "log";

export interface EmailSender {
  name: string;
  address: string;
  /** Where replies go. Falls back to the from address. */
  replyTo?: string;
}

export interface ResendConfig {
  apiKey: string;
  from: EmailSender;
}

/**
 * Resend settings, or null when they are not all present.
 *
 * All or nothing, for the reason `supabaseStorageConfig` is: a half-configured transport
 * that silently degrades is how you find out weeks later that no customer has had a
 * confirmation. The from-address lives in the environment rather than in settings because
 * it must be on a domain verified with the provider — a merchant typing an arbitrary
 * address into a form would produce sends that are rejected at the provider, which is a
 * failure mode with no visible cause.
 */
export function resendConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromValue = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !fromValue) return null;

  const from = parseSender(fromValue);
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;

  // A malformed environment should be reported as unconfigured in the admin panel
  // rather than issuing provider requests that can only be rejected. The API key's
  // shape is deliberately not validated — providers can change key formats, whereas
  // email address syntax is part of this application's own contract.
  if (validateEmail(from.address)) return null;
  if (replyTo && validateEmail(replyTo)) return null;

  return {
    apiKey,
    from: { ...from, replyTo },
  };
}

/**
 * Split `Name <address@example.com>` into its parts, or treat the whole thing as an
 * address. Both forms are common in `EMAIL_FROM` values copied from provider docs.
 */
function parseSender(value: string): { name: string; address: string } {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(clean);
  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, "").trim(),
      address: match[2].trim().toLowerCase(),
    };
  }
  return { name: "", address: clean.toLowerCase() };
}

export function emailDriver(): EmailDriver {
  return resendConfig() ? "resend" : "log";
}

/** True when a real provider is wired up. Drives the admin panel's setup notice. */
export function emailConfigured(): boolean {
  return emailDriver() === "resend";
}

export interface SendEmailOptions {
  /** Overrides the store-wide reply address for this message. */
  replyTo?: string;
  /** Prevents the same logical message being accepted twice within Resend's 24h window. */
  idempotencyKey?: string;
}

export type SendResult =
  | { status: "sent"; providerId?: string }
  | { status: "logged" }
  | { status: "failed"; error: string };

/**
 * Send one message.
 *
 * Never throws. Every caller is either fulfilling an order or handling a status change,
 * and neither may fail because email did — a customer whose confirmation bounced still
 * bought the coat. Failures come back as a value so the caller records them and carries
 * on, the same contract `putObject` and `checkPincode` already use.
 */
export async function sendEmail(
  to: string,
  message: RenderedEmail,
  options: SendEmailOptions = {},
): Promise<SendResult> {
  const recipient = to.trim().toLowerCase();
  const recipientError = validateEmail(recipient);
  if (recipientError) {
    return { status: "failed", error: recipientError };
  }

  const subject = message.subject.trim();
  if (!subject) {
    return { status: "failed", error: "A subject line is required." };
  }

  const config = resendConfig();

  if (!config) {
    /*
     * Deliberately loud. Without a provider this is the only trace a developer has that
     * the pipeline ran, and the subject plus recipient is enough to tell whether the
     * right template fired for the right person.
     */
    console.info(
      `[email] not configured — would send "${subject}" to ${recipient}. ` +
        "Set RESEND_API_KEY and EMAIL_FROM to deliver it.",
    );
    return { status: "logged" };
  }

  const replyTo = options.replyTo?.trim().toLowerCase() || config.from.replyTo;
  if (replyTo && validateEmail(replyTo)) {
    return { status: "failed", error: "The reply-to email address is invalid." };
  }

  const idempotencyKey = options.idempotencyKey?.trim();
  if (
    idempotencyKey &&
    (idempotencyKey.length > 256 || /[\r\n]/.test(idempotencyKey))
  ) {
    return { status: "failed", error: "The email idempotency key is invalid." };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: config.from.name
          ? `${config.from.name} <${config.from.address}>`
          : config.from.address,
        to: [recipient],
        subject,
        html: message.html,
        // Both parts. See the note in templates.ts on why the text alternative matters.
        text: message.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      /*
       * Ten seconds. This runs after the response has been flushed for lifecycle mail,
       * so nobody is waiting on it, but an unbounded fetch would hold a serverless
       * invocation open until the platform killed it — and a killed invocation writes
       * no log entry, which is the one outcome worse than a recorded failure.
       */
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error";
    console.error("[email] send request failed:", error);
    return { status: "failed", error: detail };
  }

  if (!response.ok) {
    /*
     * The provider's own message is genuinely useful here — "domain is not verified",
     * "invalid to address" — so it is kept, truncated. It is stored in the log rather
     * than shown to a customer, and the log is admin-only.
     */
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`[email] send rejected (${response.status}): ${detail}`);
    return {
      status: "failed",
      error: `Provider returned ${response.status}${detail ? `: ${detail}` : ""}`,
    };
  }

  const payload = (await response.json().catch(() => null)) as { id?: string } | null;
  return { status: "sent", providerId: payload?.id };
}
