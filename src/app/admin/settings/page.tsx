import type { Metadata } from "next";
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
      <header>
        <h1 className="font-display text-3xl leading-tight">Settings</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          These values are read at request time, so a change takes effect on the next page
          load. Prices already in a shopper&apos;s bag keep the amount they were added at.
        </p>
      </header>

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
            <strong className="font-medium text-content">Data storage.</strong> The store is
            a JSON file on disk, which works locally and on any host with a persistent
            disk. It does not work on Vercel — swap{" "}
            <code className="font-mono text-xs">src/server/store.ts</code> for a database
            first.
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
