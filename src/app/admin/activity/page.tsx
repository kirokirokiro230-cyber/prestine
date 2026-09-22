import type { Metadata } from "next";
import { Panel } from "@/components/admin/primitives";
import { formatDate } from "@/lib/format";
import { listAudit } from "@/server/audit";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Activity log" };

/** Tailwind classes per action, so a delete or failed login stands out in the list. */
const ACTION_TONE: Record<string, string> = {
  create: "bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100",
  update: "bg-clay-100 text-clay-700 dark:bg-clay-900/60 dark:text-clay-200",
  status: "bg-clay-100 text-clay-700 dark:bg-clay-900/60 dark:text-clay-200",
  delete: "bg-danger-100 text-danger-700 dark:bg-danger-700/25 dark:text-danger-100",
  login: "bg-surface-sunken text-content-muted",
  "login:failed": "bg-danger-100 text-danger-700 dark:bg-danger-700/25 dark:text-danger-100",
  logout: "bg-surface-sunken text-content-muted",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  await requireAdmin();

  const [{ entity }, audit] = await Promise.all([searchParams, listAudit(200)]);

  const entities = [...new Set(audit.map((entry) => entry.entity))].sort();
  const rows = entity ? audit.filter((entry) => entry.entity === entity) : audit;

  const failedLogins = audit.filter((entry) => entry.action === "login:failed").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Activity log</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          Every change, with the account that made it. Capped at the most recent 500
          entries — a production deployment should ship these to an append-only log.
        </p>
      </header>

      {failedLogins > 0 ? (
        <p className="border border-warning-500/40 bg-warning-100/50 px-3 py-2.5 text-sm text-warning-700 dark:bg-warning-700/20 dark:text-warning-100">
          {failedLogins} failed sign-in attempt{failedLogins === 1 ? "" : "s"} in the recent
          log. A burst of these from one address is worth investigating.
        </p>
      ) : null}

      <Panel
        title="Entries"
        description={`${rows.length} shown${entity ? ` for ${entity}` : ""}.`}
        bodyClassName="px-0 py-0"
      >
        {/* Entity filter — plain links, no client JS needed */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <a
            href="/admin/activity"
            className={
              entity
                ? "border border-line px-3 py-1.5 text-xs text-content-muted transition-colors hover:text-content"
                : "border border-line-strong bg-inverse px-3 py-1.5 text-xs text-on-inverse"
            }
          >
            All
          </a>
          {entities.map((name) => (
            <a
              key={name}
              href={`/admin/activity?entity=${name}`}
              className={
                entity === name
                  ? "border border-line-strong bg-inverse px-3 py-1.5 text-xs text-on-inverse"
                  : "border border-line px-3 py-1.5 text-xs text-content-muted transition-colors hover:text-content"
              }
            >
              {name}
            </a>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-content-muted">
            Nothing logged yet. Actions appear here as soon as they happen.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-sm">
              <caption className="sr-only">Audit log entries</caption>
              <thead>
                <tr className="border-b border-line text-left">
                  {["When", "Action", "Entity", "Summary", "Account"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-3 py-3 pl-5 text-content-muted">
                      {formatDate(entry.at, "short")}
                      <span className="block text-2xs text-content-subtle">
                        {new Date(entry.at).toLocaleTimeString()}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap px-2 py-1 text-2xs font-medium uppercase tracking-[0.08em] leading-none ${
                          ACTION_TONE[entry.action] ?? "bg-surface-sunken text-content-muted"
                        }`}
                      >
                        {entry.action}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-content-muted">{entry.entity}</td>

                    <td className="px-3 py-3">{entry.summary}</td>

                    <td className="px-3 py-3 pr-5 text-xs text-content-muted">
                      {entry.actorEmail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
