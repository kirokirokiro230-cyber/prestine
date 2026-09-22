import type { Metadata } from "next";
import { EmailManager } from "@/components/admin/email-manager";
import { EMAIL_TOKENS } from "@/server/email/templates";
import { emailConfigured } from "@/server/email/transport";
import { dueReviewRequests, listEmailLog, listEmailTemplates } from "@/server/repositories/email";
import { getSettings } from "@/server/repositories/settings";
import { can, requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Email" };

/**
 * Email.
 *
 * Gated on `orders:write` rather than `settings:write` so staff handling orders can reach
 * the composer and the log — replying to a customer is their job. Editing the automatic
 * templates changes what every future customer receives, so that stays behind
 * `settings:write` and the forms are simply not rendered without it. The server action
 * checks again regardless; hiding a control is a courtesy, not a boundary.
 */
export default async function EmailPage() {
  const admin = await requirePermission("orders:write");

  const [templates, log, settings, due] = await Promise.all([
    listEmailTemplates(),
    listEmailLog(60),
    getSettings(),
    dueReviewRequests(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Email</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          What customers hear from you as an order moves, and a place to write to one
          directly. Every attempt is recorded, including the ones that fail — email fails
          quietly, so the log is the only way to tell a delivery from a silence.
        </p>
      </header>

      <EmailManager
        templates={templates}
        log={log}
        tokens={EMAIL_TOKENS}
        configured={emailConfigured()}
        dueReviewCount={due.length}
        reviewDelayDays={settings.reviewRequestDelayDays}
        canManageTemplates={can(admin, "settings:write")}
      />
    </div>
  );
}
