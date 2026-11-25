import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/primitives";
import { SettingsForm } from "@/components/admin/settings-form";
import { getSettings } from "@/server/repositories/settings";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings:write");

  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Store identity, pricing, delivery, contact details and storefront content. Changes take effect on the next page load."
      />

      <SettingsForm settings={settings} />

      <Panel
        title="Not configurable here"
        description="Things that need code or environment changes rather than a setting."
      >
        <ul className="flex flex-col gap-3 text-sm leading-relaxed text-content-muted">
          <li>
            <strong className="font-medium text-content">Payments.</strong> Checkout
            validates cards in the browser and sends nothing anywhere. Connect Stripe or a
            similar provider before taking money, and let their hosted fields capture the
            card so it never touches this server.
          </li>
          <li>
            <strong className="font-medium text-content">Session secret.</strong> Set{" "}
            <code className="font-mono text-xs">ADMIN_SESSION_SECRET</code> to at least 32
            random characters. It is required in production and admin sign-in will refuse
            to start without it.
          </li>
          <li>
            <strong className="font-medium text-content">Data storage.</strong> Everything
            reads from and writes to Supabase Postgres. Set{" "}
            <code className="font-mono text-xs">SUPABASE_URL</code>,{" "}
            <code className="font-mono text-xs">SUPABASE_ANON_KEY</code> and{" "}
            <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>, then run
            the migrations in <code className="font-mono text-xs">supabase/migrations/</code>{" "}
            against your project before anything in the admin panel will work.
          </li>
          <li>
            <strong className="font-medium text-content">Image hosts.</strong> Product image
            URLs must be on a host listed in{" "}
            <code className="font-mono text-xs">next.config.ts</code> under{" "}
            <code className="font-mono text-xs">images.remotePatterns</code>.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
