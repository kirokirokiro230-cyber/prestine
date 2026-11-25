"use client";

import { ArrowDown, ArrowUp, Eye, EyeSlash, PencilSimple } from "@phosphor-icons/react";
import {
  deleteLookAction,
  moveLookAction,
  toggleLookAction,
} from "@/app/admin/actions/looks";
import { pluralise } from "@/lib/format";
import type { StyleLook } from "@/lib/style-looks";
import { ConfirmSubmit } from "./primitives";
import type { PickerProduct } from "./product-picker";

/**
 * One style hint in a list, with its controls.
 *
 * Shared by the all-looks page and a product's own page, so the two cannot drift. The only
 * difference is `withinProductId`: on a product's page the arrows order THAT product's
 * photographs, and the row talks about that product's page rather than listing every page.
 */
export function StyleLookRow({
  look,
  index,
  count,
  productsById,
  withinProductId,
  onEdit,
}: {
  look: StyleLook;
  index: number;
  count: number;
  productsById: Map<string, PickerProduct>;
  /** Set on a product's own page. Scopes the order arrows to that product's list. */
  withinProductId?: string;
  onEdit: () => void;
}) {
  const total = look.productIds.length;
  const visible = look.productIds.filter((id) => productsById.get(id)?.status === "active").length;

  const namesOf = (ids: string[]) =>
    ids
      .map((id) => productsById.get(id)?.name)
      .filter(Boolean)
      .join(", ");

  // On a product's page: how many OTHER pages the same photograph is on.
  const elsewhere = withinProductId
    ? look.shownOn.filter((id) => id !== withinProductId)
    : [];

  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4">
      <span
        aria-hidden
        className="mt-0.5 h-20 w-16 shrink-0 rounded-xs border border-line bg-surface-sunken bg-cover bg-center"
        style={{ backgroundImage: `url(${look.imageUrl})` }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span data-numeric className="text-2xs text-content-subtle">
            {index + 1}
          </span>
          <h3 className="text-sm font-medium">{look.title}</h3>
          <span
            className={
              look.active
                ? "bg-success-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] text-success-700 dark:bg-success-700/25 dark:text-success-100"
                : "bg-surface-sunken px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] text-content-muted"
            }
          >
            {look.active ? "Published" : "Hidden"}
          </span>
        </div>

        <p className="mt-1.5 text-xs text-content-muted">
          {pluralise(total, "piece")} in the photo
          {visible < total ? (
            <span className="text-warning-700">
              {" "}
              · only {visible} showing (the rest are not published)
            </span>
          ) : null}
        </p>

        <p className="mt-1 line-clamp-1 text-xs text-content-subtle">
          {namesOf(look.productIds)}
        </p>

        {/* Where it appears. This is the answer to "why is it on that page?". */}
        <p className="mt-1 line-clamp-1 text-xs text-content-subtle">
          {withinProductId
            ? elsewhere.length === 0
              ? "Shown on this page only"
              : `Also shown on ${pluralise(elsewhere.length, "other page")}: ${namesOf(elsewhere)}`
            : `Shown on ${pluralise(look.shownOn.length, "page")}: ${namesOf(look.shownOn)}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <form action={moveLookAction}>
          <input type="hidden" name="id" value={look.id} />
          <input type="hidden" name="direction" value="up" />
          {withinProductId ? (
            <input type="hidden" name="withinProductId" value={withinProductId} />
          ) : null}
          <button
            type="submit"
            disabled={index === 0}
            aria-label={`Move “${look.title}” earlier`}
            title="Move up"
            className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowUp size={14} aria-hidden />
          </button>
        </form>

        <form action={moveLookAction}>
          <input type="hidden" name="id" value={look.id} />
          <input type="hidden" name="direction" value="down" />
          {withinProductId ? (
            <input type="hidden" name="withinProductId" value={withinProductId} />
          ) : null}
          <button
            type="submit"
            disabled={index === count - 1}
            aria-label={`Move “${look.title}” later`}
            title="Move down"
            className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowDown size={14} aria-hidden />
          </button>
        </form>

        <form action={toggleLookAction}>
          <input type="hidden" name="id" value={look.id} />
          <input type="hidden" name="active" value={look.active ? "0" : "1"} />
          <button
            type="submit"
            aria-label={look.active ? `Hide “${look.title}”` : `Publish “${look.title}”`}
            title={look.active ? "Hide" : "Publish"}
            className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
          >
            {look.active ? <Eye size={14} aria-hidden /> : <EyeSlash size={14} aria-hidden />}
          </button>
        </form>

        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit “${look.title}”`}
          title="Edit"
          className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
        >
          <PencilSimple size={14} aria-hidden />
        </button>

        <form action={deleteLookAction}>
          <input type="hidden" name="id" value={look.id} />
          <ConfirmSubmit confirmLabel="Confirm delete">Delete</ConfirmSubmit>
        </form>
      </div>
    </li>
  );
}
