"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowSquareOut, PencilSimple, Plus, X } from "@phosphor-icons/react";
import {
  deleteCategoryAction,
  deleteCollectionAction,
  saveCategoryAction,
  saveCollectionAction,
  type CatalogActionState,
} from "@/app/admin/actions/catalog";
import { ImageUploadField } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, TextArea, TextField } from "@/components/ui/field";
import { ConfirmSubmit, FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * Shared editor for categories and collections.
 *
 * They differ in two fields and one deletion rule, which is not enough to justify
 * two near-identical components. `kind` switches the action, the copy and the
 * fields; everything else is shared.
 */

interface TaxonomyItem {
  slug: string;
  name: string;
  blurb: string;
  description?: string;
  /** Categories only — tile photography, and its landscape recrop. */
  imageUrl?: string;
  imageUrlWide?: string;
  hidden?: boolean;
  /** How many products reference it. */
  count: number;
}

export function TaxonomyManager({
  kind,
  items,
}: {
  kind: "category" | "collection";
  items: TaxonomyItem[];
}) {
  const isCategory = kind === "category";

  const [state, action] = useActionState<CatalogActionState, FormData>(
    isCategory ? saveCategoryAction : saveCollectionAction,
    {},
  );

  /** `null` = closed, `""` = creating, otherwise the slug being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const current = editing ? items.find((item) => item.slug === editing) : undefined;

  const label = isCategory ? "category" : "collection";
  const basePath = isCategory ? "/shop" : "/collections";

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
      <Panel
        title={isCategory ? "Categories" : "Collections"}
        description={`${items.length} ${label}${items.length === 1 ? "" : "s"}.`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(editing === "" ? null : "")}
          >
            <Plus size={13} aria-hidden />
            New {label}
          </Button>
        }
        bodyClassName="px-0 py-0"
      >
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.slug} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{item.name}</h3>
                  {item.hidden ? (
                    <span className="bg-surface-sunken px-2 py-0.5 text-2xs uppercase tracking-[0.08em] text-content-muted">
                      Hidden
                    </span>
                  ) : null}
                  <span data-numeric className="text-xs text-content-subtle">
                    {item.count} product{item.count === 1 ? "" : "s"}
                  </span>
                </div>

                <p className="mt-1 text-xs leading-relaxed text-content-muted">{item.blurb}</p>

                <p data-numeric className="mt-1.5 font-mono text-2xs text-content-subtle">
                  {basePath}/{item.slug}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`${basePath}/${item.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View ${item.name} on the storefront`}
                  title="View on storefront"
                  className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
                >
                  <ArrowSquareOut size={14} aria-hidden />
                </Link>

                <button
                  type="button"
                  onClick={() => setEditing(editing === item.slug ? null : item.slug)}
                  aria-label={`Edit ${item.name}`}
                  title="Edit"
                  className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
                >
                  <PencilSimple size={14} aria-hidden />
                </button>

                <form action={isCategory ? deleteCategoryAction : deleteCollectionAction}>
                  <input type="hidden" name="slug" value={item.slug} />
                  <ConfirmSubmit
                    confirmLabel="Confirm delete"
                    className={
                      isCategory && item.count > 0 ? "pointer-events-none opacity-40" : undefined
                    }
                  >
                    Delete
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>

        {isCategory ? (
          <p className="border-t border-line px-5 py-3 text-xs text-content-subtle">
            A category with products cannot be deleted. Move its products to another
            category first.
          </p>
        ) : null}
      </Panel>

      {/* Editor */}
      {editing !== null ? (
        <Panel
          title={current ? `Edit ${current.name}` : `New ${label}`}
          action={
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close editor"
              className="grid size-8 place-items-center text-content-muted transition-colors hover:text-content"
            >
              <X size={15} aria-hidden />
            </button>
          }
        >
          <FormFeedback error={state.error} success={state.success} />

          {/* Keyed so switching between items resets the uncontrolled inputs. */}
          <form key={editing} action={action} className="mt-2 flex flex-col gap-5">
            <input type="hidden" name="existingSlug" value={current?.slug ?? ""} />

            <TextField label="Name" name="name" defaultValue={current?.name} required />

            <TextField
              label="URL slug"
              name="slug"
              defaultValue={current?.slug}
              hint={
                current
                  ? "Changing this moves every product that references it, and the old URL stops working."
                  : "Leave blank to generate one from the name."
              }
            />

            <TextField
              label="Blurb"
              name="blurb"
              defaultValue={current?.blurb}
              hint="One line, shown on tiles and listing headers."
              required={isCategory}
            />

            {isCategory ? (
              /*
               * Replaces a "Placeholder silhouette" dropdown that could not do anything:
               * generated artwork resolves its shape from the static config, not from the
               * stored category, so whatever a merchant picked was written and ignored.
               *
               * `key` is the slug so the field resets when a different category is opened
               * for editing — without it the uploader keeps the previous category's
               * photograph in state and would save it onto the new one.
               */
              <>
                <ImageUploadField
                  key={current?.slug ?? "new-category"}
                  name="imageUrl"
                  label="Category image — portrait"
                  defaultValue={current?.imageUrl}
                  hint="Recommended 900 × 1125 (4:5). Used on every tile. Leave empty to use generated artwork."
                />
                {/*
                  The first two tiles are double width from `lg`, which makes them 16:10.
                  A portrait file at that shape loses its top and bottom to
                  `object-cover`, so the wide tiles get their own crop. Only the first two
                  categories in display order ever use it, which the hint says outright —
                  otherwise it reads as an image that silently does nothing.
                */}
                <ImageUploadField
                  key={`${current?.slug ?? "new-category"}-wide`}
                  name="imageUrlWide"
                  label="Landscape crop"
                  defaultValue={current?.imageUrlWide}
                  hint="Optional. Recommended 1600 × 1000 (16:10). Only the first two categories show a wide tile on desktop. Falls back to the portrait image."
                />
              </>
            ) : (
              <>
                <TextArea
                  label="Description"
                  name="description"
                  rows={5}
                  defaultValue={current?.description}
                  hint="Long-form copy for the collection landing page."
                />
                <Checkbox
                  label="Hidden"
                  name="hidden"
                  hint="Stays reachable by URL but leaves the navigation."
                  defaultChecked={current?.hidden ?? false}
                />
              </>
            )}

            <div className="flex items-center gap-3">
              <SubmitButton>
                {current ? "Save changes" : `Create ${label}`}
              </SubmitButton>
              <Button type="button" variant="ghost" size="md" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : (
        <Panel title={`About ${label === "category" ? "categories" : "collections"}`}>
          <p className="text-sm leading-relaxed text-content-muted">
            {isCategory
              ? "Every product sits in exactly one category, and categories drive the main navigation and the /shop URLs. Keep the set small — eight is plenty for a range this size."
              : "Collections are how you merchandise: seasonal edits, best sellers, a sale. A product can appear in as many as you like, and the storefront navigation is generated from this list."}
          </p>
          <Button
            variant="outline"
            size="md"
            className="mt-5"
            onClick={() => setEditing("")}
          >
            <Plus size={13} aria-hidden />
            New {label}
          </Button>
        </Panel>
      )}
    </div>
  );
}


