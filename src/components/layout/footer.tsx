import Link from "next/link";
import {
  ArrowsCounterClockwise,
  InstagramLogo,
  PinterestLogo,
  Recycle,
  Truck,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { NavColumn } from "@/lib/navigation";
import type { StoreSettings } from "@/lib/types";
import { Logo } from "./logo";

/**
 * Site footer.
 *
 * Every value comes from live settings, so changing the free-shipping threshold or a
 * social URL in admin updates the footer without a deploy.
 */
export function Footer({
  settings,
  columns,
}: {
  settings: StoreSettings;
  columns: NavColumn[];
}) {
  const year = new Date().getFullYear();

  /**
   * Service promises, edited in Settings → Service promises.
   *
   * The icons stay in code and are matched by position, because an icon is a design
   * decision rather than copy — giving a merchant a dropdown of 900 Phosphor glyphs
   * invites a shipping van next to a returns promise. A fourth promise cycles back to
   * the first icon rather than crashing on an undefined component.
   */
  const ICONS = [Truck, ArrowsCounterClockwise, Recycle];

  const servicePoints = settings.servicePromises.map((promise, index) => ({
    icon: ICONS[index % ICONS.length],
    title: promise.title,
    body: promise.body,
  }));

  const socials = [
    { label: "Instagram", href: settings.social.instagram, Icon: InstagramLogo },
    { label: "Pinterest", href: settings.social.pinterest, Icon: PinterestLogo },
    { label: "YouTube", href: settings.social.youtube, Icon: YoutubeLogo },
  ].filter((social) => Boolean(social.href));

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      {/* Service promises */}
      <div className="border-b border-line">
        <div className="page-gutter mx-auto grid max-w-page gap-8 py-12 sm:grid-cols-3">
          {servicePoints.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <Icon size={22} aria-hidden className="mt-0.5 shrink-0 text-content-muted" />
              <div>
                <h3 className="font-sans text-2xs font-medium uppercase tracking-[0.14em] text-content">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-content-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Link columns */}
      <div className="page-gutter mx-auto max-w-page py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-12">
          <div>
            <Logo name={settings.name} size="sm" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-content-muted">
              {settings.description}
            </p>

            {socials.length > 0 ? (
              <ul className="mt-6 flex items-center gap-1">
                {socials.map(({ label, href, Icon }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`${settings.name} on ${label} (opens in a new tab)`}
                      className="grid size-11 place-items-center rounded-full text-content-muted transition-colors hover:bg-surface-sunken hover:text-content"
                    >
                      <Icon size={18} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="eyebrow mb-4">{column.heading}</h3>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="link-underline text-sm text-content-muted transition-colors hover:text-content"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      {/* Legal strip */}
      <div className="border-t border-line">
        <div className="page-gutter mx-auto flex max-w-page flex-col gap-4 py-6 text-xs text-content-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {settings.legalName}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>{settings.address}</span>
            {settings.phone ? (
              <a
                href={`tel:${settings.phone.replace(/\s/g, "")}`}
                className="link-underline"
              >
                {settings.phone}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
