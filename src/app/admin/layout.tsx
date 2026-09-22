import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { dashboardMetrics } from "@/server/metrics";
import { currentAdmin } from "@/server/session";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · PRESTINE Admin",
  },
  // The admin panel must never be indexed, and no referrer should leak its URLs.
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * Admin shell.
 *
 * Dynamic because every page reads the session cookie and live store data —
 * caching any of it would be both incorrect and a data leak.
 *
 * When there is no session the children render bare, which is what the login and
 * setup screens want. Middleware has already redirected every other admin path, so
 * this branch is only ever reached by those two pages.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await currentAdmin();
  if (!admin) return <>{children}</>;

  const metrics = await dashboardMetrics({ days: 30 });

  return (
    <AdminShell
      admin={{ name: admin.name, email: admin.email, role: admin.role }}
      pendingOrders={metrics.statusCounts.processing}
    >
      {children}
    </AdminShell>
  );
}
