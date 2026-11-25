"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUUpLeft,
  Bell,
  BellRinging,
  CheckCircle,
  Desktop,
  Handbag,
  Money,
  Package,
  Prohibit,
  SpeakerHigh,
  SpeakerSlash,
  Truck,
  Warning,
  X,
} from "@phosphor-icons/react";
import { markNotificationsReadAction } from "@/app/admin/actions/notifications";
import { useBrowserStore } from "@/hooks/use-store";
import {
  timeAgo,
  type AdminNotification,
  type NotificationFeed,
  type NotificationSeverity,
} from "@/lib/admin-notifications";
import { createJsonStore } from "@/lib/browser-store";
import { cn } from "@/lib/utils";

/**
 * The admin bell: a live feed of what is happening to orders.
 *
 * ## How it stays live
 *
 * It polls `/api/admin/notifications` every 20 seconds. Supabase Realtime would be
 * instant, but it needs the public anon key to read the table, and this table carries
 * customer names and order totals — the anon key is deliberately kept out of reach of
 * anything like that. Twenty seconds is fast enough for a shop whose orders arrive in
 * minutes, and costs one indexed query per open admin tab.
 *
 * ## What it does with a new event
 *
 * - raises a **toast**, which fades after eight seconds — except `critical` ones (a
 *   refund is owed, a payment is held, a shipment failed to book), which stay until
 *   dismissed, because those are the ones that cost money if they scroll by unread;
 * - optionally **plays a sound** and optionally raises a **desktop notification** when the tab
 *   is in the background. Both are opt-in and off by default: an unexpected sound in an
 *   office is worse than a missed one, and browsers refuse both without a deliberate
 *   click anyway;
 * - refreshes the page's server data if you are looking at the dashboard or the orders
 *   list, so the new order appears without a reload.
 *
 * ## What it does not do on load
 *
 * The first poll of a page load only records what already exists. Without that, every
 * full reload would replay every unread notification as a toast.
 */

const POLL_MS = 20_000;
const TOAST_MS = 8_000;
const MAX_TOASTS = 3;

interface AlertPrefs {
  sound: boolean;
  desktop: boolean;
}

const alertPrefs = createJsonStore<AlertPrefs>("prestine.admin.alerts", {
  sound: false,
  desktop: false,
});

/**
 * The icon for an event kind.
 *
 * A component that returns a concrete icon, rather than a function that returns an icon
 * *component* to be rendered by the caller: picking a component type during render makes
 * a new type each time, which React treats as a different component and remounts.
 * Branching to fixed elements here has no such cost.
 */
function KindIcon({ kind, size }: { kind: string; size: number }) {
  if (kind.startsWith("order.cancelled")) return <Prohibit size={size} aria-hidden />;
  if (kind === "order.paid" || kind === "order.placed") return <Handbag size={size} aria-hidden />;
  if (kind.startsWith("return.")) return <ArrowUUpLeft size={size} aria-hidden />;
  if (kind.startsWith("payment.") || kind.startsWith("cod.")) return <Money size={size} aria-hidden />;
  if (kind === "shipment.failed" || kind === "shipment.cancel-failed") {
    return <Warning size={size} aria-hidden />;
  }
  if (kind.startsWith("shipment.") || kind === "order.shipped") return <Truck size={size} aria-hidden />;
  if (kind === "order.delivered") return <Package size={size} aria-hidden />;
  return <Bell size={size} aria-hidden />;
}

/**
 * Severity is carried by an icon chip, a left rule and weight, not by hue alone: the admin
 * theme is greyscale, and an alert that only differs by colour is invisible to anyone who
 * cannot tell the colours apart.
 */
const SEVERITY: Record<NotificationSeverity, { chip: string; rule: string; label: string }> = {
  critical: { chip: "bg-danger-500 text-white", rule: "border-l-danger-500", label: "Needs action" },
  warning: { chip: "bg-warning-100 text-warning-700", rule: "border-l-warning-500", label: "Heads up" },
  success: { chip: "bg-accent text-on-accent", rule: "border-l-accent", label: "New" },
  info: { chip: "bg-surface-sunken text-content-muted", rule: "border-l-line-strong", label: "Update" },
};

/* ------------------------------------------------------------------ */
/* Sound and desktop alerts                                            */
/* ------------------------------------------------------------------ */

/**
 * The alert sound: `public/audio/notification.wav`, served at `/audio/notification.wav`.
 *
 * The source copy lives in `assets/Audio/`, which Next.js does not serve — only `public/`
 * is. Replace the file in `public/audio/` to change the sound; keep the name, or change
 * this constant.
 */
const SOUND_URL = "/audio/notification.wav";

/**
 * The clip is mastered loud (peak about 0.86 of full scale, average about 0.36) and runs
 * for 1.65 seconds, which is a long time in a quiet office. Played at a little over half
 * volume so it is clearly heard without making anyone jump.
 */
const SOUND_VOLUME = 0.6;

let player: HTMLAudioElement | null = null;

/**
 * One element, created on first use and reused. Constructing a new `Audio` per alert would
 * re-fetch the file each time; reusing it plays from the browser's cache and means two
 * alerts close together restart the clip instead of stacking into noise.
 */
function getPlayer(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;

  if (!player) {
    player = new Audio(SOUND_URL);
    player.preload = "auto";
    player.volume = SOUND_VOLUME;
  }
  return player;
}

/** Start loading the file as soon as sound is switched on, so the first alert is not late. */
function primeSound(): void {
  getPlayer();
}

/**
 * Play the alert.
 *
 * One recording serves every event, so urgency is carried by repetition: a `critical`
 * alert plays it twice. That keeps "a refund is owed" from being mistaken for "a new order
 * arrived" when you are in another room.
 *
 * Browsers refuse `play()` until the page has had a user gesture, and it rejects. That is
 * swallowed: staying silent until someone has clicked anything is the correct behaviour,
 * not an error.
 */
function chime(critical: boolean): void {
  try {
    const audio = getPlayer();
    if (!audio) return;

    // Assigned, not added, so a burst of alerts replaces the handler instead of stacking
    // up several repeats.
    audio.onended = critical
      ? () => {
          audio.onended = null;
          audio.currentTime = 0;
          void audio.play().catch(() => undefined);
        }
      : null;

    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // No audio support: silence is fine.
  }
}

function desktopNotify(item: AdminNotification): void {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // Only when nobody is looking at the tab; a toast already covers the visible case.
    if (document.visibilityState === "visible") return;

    const shown = new Notification(item.title, {
      body: item.body,
      tag: item.id,
      requireInteraction: item.severity === "critical",
    });
    shown.onclick = () => {
      window.focus();
      if (item.href) window.location.assign(item.href);
      shown.close();
    };
  } catch {
    // Some browsers throw if constructed outside a service worker. Not worth surfacing.
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface Toast {
  item: AdminNotification;
}

/** Pages whose server-rendered data is worth refreshing when an order event arrives. */
const LIVE_PAGES = new Set(["/admin", "/admin/orders"]);

const isOrderEvent = (kind: string) =>
  kind.startsWith("order.") || kind.startsWith("cod.") || kind.startsWith("payment.");

export function AdminNotifications() {
  const router = useRouter();
  const pathname = usePathname();
  const [prefs, setPrefs] = useBrowserStore(alertPrefs);

  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unread: 0 });
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  // How many of the newest items were unread when the panel was opened, so they can stay
  // highlighted while it is open even though opening marks them read.
  const [unreadAtOpen, setUnreadAtOpen] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Latest values for the long-lived poll loop, which must not restart (and so lose its
  // "already seen" memory) every time a preference or the route changes.
  const latest = useRef({ prefs, pathname, open });
  useEffect(() => {
    latest.current = { prefs, pathname, open };
  }, [prefs, pathname, open]);

  // Fetch the clip ahead of time when sound is on, so the first alert plays on time.
  useEffect(() => {
    if (prefs.sound) primeSound();
  }, [prefs.sound]);

  const seenIds = useRef<Set<string> | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.item.id !== id));
  }, []);

  /* ---- Polling --------------------------------------------------- */

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handle = (data: NotificationFeed) => {
      setFeed(data);
      setLoaded(true);
      setNow(Date.now());

      const known = seenIds.current;
      seenIds.current = new Set(data.items.map((item) => item.id));

      // First poll of this page load: remember, do not announce.
      if (known === null) return;

      // Oldest first, so they stack in the order they happened.
      const fresh = data.items.filter((item) => !known.has(item.id)).reverse();
      if (fresh.length === 0) return;

      const { prefs: current, pathname: path, open: panelOpen } = latest.current;

      setToasts((existing) =>
        [...existing, ...fresh.map((item) => ({ item }))].slice(-MAX_TOASTS),
      );

      if (current.sound) chime(fresh.some((item) => item.severity === "critical"));
      if (current.desktop) fresh.forEach(desktopNotify);

      if (LIVE_PAGES.has(path) && fresh.some((item) => isOrderEvent(item.kind))) {
        router.refresh();
      }

      // The panel is open and showing these, so they are read as they arrive.
      if (panelOpen) {
        void markNotificationsReadAction();
        setFeed((previous) => ({ ...previous, unread: 0 }));
      }
    };

    const poll = async () => {
      try {
        const response = await fetch("/api/admin/notifications", {
          cache: "no-store",
          credentials: "same-origin",
        });

        // Signed out: stop quietly. The next navigation redirects to the login page.
        if (response.status === 401) {
          stopped = true;
          return;
        }

        if (response.ok && !stopped) handle((await response.json()) as NotificationFeed);
      } catch {
        // Offline or a blip. The next tick tries again.
      } finally {
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      }
    };

    void poll();

    // Catch up straight away when the tab comes back, instead of waiting out the interval.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        if (timer) clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  /* ---- Permission state ----------------------------------------- */

  useEffect(() => {
    // Read once after mount. Done in a microtask so it is not a synchronous setState in
    // the effect body, which would cause a cascading render.
    queueMicrotask(() => {
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    });
  }, []);

  /* ---- Open / close --------------------------------------------- */

  const openPanel = () => {
    setUnreadAtOpen(feed.unread);
    setNow(Date.now());
    setOpen(true);

    if (feed.unread > 0) {
      void markNotificationsReadAction();
      setFeed((previous) => ({ ...previous, unread: 0 }));
    }
  };

  const closePanel = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePanel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanel();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closePanel]);

  /* ---- Preferences ---------------------------------------------- */

  const toggleSound = () => {
    const next = !prefs.sound;
    setPrefs({ ...prefs, sound: next });
    // The click is the user gesture that lets the browser start audio, and playing it
    // doubles as a preview of what they just turned on.
    if (next) chime(false);
  };

  const toggleDesktop = async () => {
    if (prefs.desktop) {
      setPrefs({ ...prefs, desktop: false });
      return;
    }

    if (typeof Notification === "undefined") return;

    const result =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;

    setPermission(result);
    setPrefs({ ...prefs, desktop: result === "granted" });
  };

  const { unread } = feed;
  const hasUnread = unread > 0;
  const BellIcon = hasUnread ? BellRinging : Bell;

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => (open ? closePanel() : openPanel())}
          aria-label={
            hasUnread ? `Notifications, ${unread} unread` : "Notifications, none unread"
          }
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="admin-notifications-panel"
          className={cn(
            "relative grid size-10 place-items-center rounded-full transition-colors",
            open
              ? "bg-surface-sunken text-content"
              : "text-content-muted hover:bg-surface-sunken hover:text-content",
          )}
        >
          <BellIcon size={19} weight={hasUnread ? "fill" : "regular"} aria-hidden />
          {hasUnread ? (
            <span
              data-numeric
              className="absolute -right-0.5 -top-0.5 min-w-[1.15rem] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[1.15rem] text-on-accent ring-2 ring-surface"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>

        {open ? (
          <div
            id="admin-notifications-panel"
            role="dialog"
            aria-label="Notifications"
            className="animate-scale-in fixed inset-x-4 top-[4.5rem] z-70 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-content">Notifications</h2>
              {unreadAtOpen > 0 ? (
                <span
                  data-numeric
                  className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent"
                >
                  {unreadAtOpen} new
                </span>
              ) : null}
            </div>

            <div className="max-h-[min(28rem,70dvh)] overflow-y-auto scrollbar-thin">
              {!loaded ? (
                <p className="px-4 py-10 text-center text-sm text-content-muted">Loading…</p>
              ) : feed.items.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-surface-sunken text-content-muted">
                    <CheckCircle size={22} aria-hidden />
                  </span>
                  <p className="text-sm font-semibold text-content">You&rsquo;re all caught up</p>
                  <p className="mt-1 text-xs leading-relaxed text-content-muted">
                    New orders, cancellations, returns and payment problems will appear here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {feed.items.map((item, index) => (
                    <li key={item.id}>
                      <NotificationRow
                        item={item}
                        now={now}
                        fresh={index < unreadAtOpen}
                        onNavigate={closePanel}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-surface-sunken/60 px-3 py-2">
              <button
                type="button"
                onClick={toggleSound}
                aria-pressed={prefs.sound}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-surface",
                  prefs.sound ? "text-content" : "text-content-muted",
                )}
              >
                {prefs.sound ? (
                  <SpeakerHigh size={14} aria-hidden />
                ) : (
                  <SpeakerSlash size={14} aria-hidden />
                )}
                Sound {prefs.sound ? "on" : "off"}
              </button>

              {permission !== "unsupported" ? (
                <button
                  type="button"
                  onClick={toggleDesktop}
                  aria-pressed={prefs.desktop && permission === "granted"}
                  disabled={permission === "denied"}
                  title={
                    permission === "denied"
                      ? "Blocked in your browser's site settings"
                      : "Show a notification when this tab is in the background"
                  }
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60",
                    prefs.desktop && permission === "granted"
                      ? "text-content"
                      : "text-content-muted",
                  )}
                >
                  <Desktop size={14} aria-hidden />
                  {permission === "denied"
                    ? "Desktop alerts blocked"
                    : prefs.desktop && permission === "granted"
                      ? "Desktop alerts on"
                      : "Desktop alerts off"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Announced politely; critical ones are `role="alert"` on the card itself. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-[4.75rem] z-80 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
      >
        {toasts.map(({ item }) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function NotificationRow({
  item,
  now,
  fresh,
  onNavigate,
}: {
  item: AdminNotification;
  now: number;
  fresh: boolean;
  onNavigate: () => void;
}) {
  const tone = SEVERITY[item.severity];

  const content = (
    <div className={cn("flex gap-3 px-4 py-3", fresh && "bg-accent-soft/40")}>
      <span
        className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", tone.chip)}
      >
        <KindIcon kind={item.kind} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-content">{item.title}</p>
        {item.body ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-content-muted">
            {item.body}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-content-subtle">
          {tone.label} · {timeAgo(item.createdAt, now)}
        </p>
      </div>
      {fresh ? (
        <span aria-label="New" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
      ) : null}
    </div>
  );

  return item.href ? (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="block transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: AdminNotification;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const critical = item.severity === "critical";
  const tone = SEVERITY[item.severity];

  // Critical stays until dismissed. Everything else fades, unless the pointer is on it.
  useEffect(() => {
    if (critical || paused) return;
    const timer = setTimeout(() => onDismiss(item.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [critical, paused, item.id, onDismiss]);

  const body = (
    <div className="flex gap-3 py-3.5 pl-4 pr-10">
      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", tone.chip)}>
        <KindIcon kind={item.kind} size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-content-subtle">
          {tone.label}
        </p>
        <p className="mt-0.5 text-sm font-semibold leading-snug text-content">{item.title}</p>
        {item.body ? (
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-content-muted">
            {item.body}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      role={critical ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className={cn(
        "animate-slide-in-right pointer-events-auto relative overflow-hidden rounded-xl border border-l-4 border-line bg-surface shadow-xl",
        tone.rule,
        critical && "ring-1 ring-danger-500/30",
      )}
    >
      {item.href ? (
        <Link
          href={item.href}
          onClick={() => onDismiss(item.id)}
          className="block transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
        >
          {body}
        </Link>
      ) : (
        body
      )}

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-content-subtle transition-colors hover:bg-surface-sunken hover:text-content"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
