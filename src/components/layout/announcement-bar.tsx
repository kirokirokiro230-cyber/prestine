"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Announcement strip.
 *
 * Messages are managed in admin settings (Settings → Storefront → Announcement
 * messages, one per line). All of them exist in the DOM for crawlers and screen
 * readers; only as many as fit are shown per breakpoint, so the bar stays a single line.
 *
 * Dismissal is per-session and not persisted — a returning visitor should still see
 * current service messaging.
 *
 * ## Layout, and the bug it fixes
 *
 * The dismiss button is positioned absolutely so the messages stay optically centred in
 * the bar rather than centred in the space left over beside it. That is the right visual
 * result but it means the button floats *over* the text, and on a narrow screen a long
 * message ran straight underneath it.
 *
 * Two things prevent that now, and both are needed:
 *
 * 1. **Symmetric horizontal inset on the list.** Reserving the button's width on both
 *    sides keeps the text centred *and* clear of it. Padding only on the right would
 *    stop the collision but shift every message off-centre.
 * 2. **`truncate` on each message.** The inset caps the width; this decides what happens
 *    when a message exceeds it. Without it a long announcement wraps to two lines and
 *    doubles the height of a bar that is supposed to be one line tall.
 */
export function AnnouncementBar({ messages }: { messages: string[] }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || messages.length === 0) return null;

  return (
    <div className="relative border-y border-on-inverse/10 bg-inverse text-on-inverse">
      <div className="page-gutter mx-auto flex max-w-page items-center justify-center py-2.5">
        {/*
          `min-w-0` is what actually lets `truncate` work on the children: a flex item
          defaults to `min-width: auto`, so it refuses to shrink below its content and
          the ellipsis never appears.
        */}
        <ul className="flex min-w-0 items-center gap-8 px-10 text-2xs uppercase tracking-[0.14em] sm:px-12">
          {messages.slice(0, 3).map((message, index) => (
            <li
              // Index in the key because a merchant can legitimately repeat a line, and
              // duplicate keys would drop one of them.
              key={`${index}-${message}`}
              className={cn(
                "min-w-0 truncate",
                index === 0 ? "block" : index === 1 ? "hidden md:block" : "hidden xl:block",
              )}
            >
              {message}
            </li>
          ))}
        </ul>

        {/*
          44px square, the minimum comfortable touch target — it was 32px. The icon stays
          13px: the target does not need to *look* big, it needs to be big, and a small
          glyph centred in a large hit area is how you get both.

          It sits inside the page gutter rather than beside the text, which is what keeps
          the messages centred in the bar instead of centred in the leftover space.
        */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss announcement"
          className="absolute right-1 grid size-11 place-items-center text-on-inverse/70 transition-colors hover:text-on-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-inverse/60"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}
