"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { ArrowSquareOut, Plus, Trash } from "@phosphor-icons/react";
import {
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from "@/app/admin/actions/products";
import { ImageUploadList } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, SelectField, TextArea, TextField } from "@/components/ui/field";
import type {
  Category,
  Collection,
  Product,
  ProductColor,
  ProductSize,
} from "@/lib/types";
import { slugify } from "@/lib/utils";
import { FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * Create/edit product form.
 *
 * One component for both modes â€” the only differences are which action it posts to
 * and whether a hidden id is present. Colourways and sizes are local state because
 * they are repeatable; everything else is an uncontrolled input, which keeps
 * re-renders off the typing path in a form this large.
 *
 * Money is entered in major units and converted server-side, so a merchant types
 * `795` rather than `79500`.
 */

const SIZE_PRESETS: Record<string, string[]> = {
  alpha: ["XS", "S", "M", "L", "XL", "XXL"],
  waist: ["28", "30", "32", "34", "36", "38"],
  "one-size": ["One size"],
  shoe: ["39", "40", "41", "42", "43", "44", "45"],
};

interface Draft {
  colors: ProductColor[];
  sizes: ProductSize[];
}

export function ProductForm({
  product,
  categories,
  collections,
  otherProducts,
  currency,
}: {
  /** Absent when creating. */
  product?: Product;
  categories: Category[];
  collections: Collection[];
  otherProducts: Array<{ slug: string; name: string }>;
  currency: string;
}) {
  const isEdit = Boolean(product);
  const action = isEdit ? updateProductAction : createProductAction;

  const [state, formAction] = useActionState<ProductFormState, FormData>(action, {});

  const [draft, setDraft] = useState<Draft>({
    colors: product?.colors.length
      ? product.colors
      : [{ id: "bone", name: "Bone", hex: "#E6DFD2" }],
    sizes: product?.sizes.length
      ? product.sizes
      : SIZE_PRESETS.alpha.map((label) => ({ label })),
  });

  const [sizeSystem, setSizeSystem] = useState(product?.sizeSystem ?? "alpha");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const formId = useId();

  const money = (minor?: number) =>
    typeof minor === "number" ? (minor / 100).toFixed(2) : "";

  /** Swap the size run when the size system changes. */
  const applySizePreset = (system: string) => {
    setSizeSystem(system as Product["sizeSystem"]);
    const preset = SIZE_PRESETS[system] ?? SIZE_PRESETS.alpha;

    setDraft((current) => ({
      ...current,
      sizes: preset.map((label) => ({ label })),
    }));
  };

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {isEdit ? <input type="hidden" name="id" value={product!.id} /> : null}

      <FormFeedback error={state.error} success={state.success} />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr] xl:items-start">
        {/* ---------------- Main column ---------------- */}
        <div className="flex flex-col gap-6">
          <Panel title="Basics">
            <div className="flex flex-col gap-5">
              <TextField
                label="Product name"
                name="name"
                defaultValue={product?.name}
                error={state.fieldErrors?.name}
                onChange={(event) => {
                  // Auto-fill the slug until the merchant edits it themselves.
                  if (!slugTouched) setSlug(slugify(event.target.value));
                }}
                required
              />

              <TextField
                label="URL slug"
                name="slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                hint={`Appears as /product/${slug || "your-product"}. Must be unique; a suffix is added if it is not.`}
              />

              <TextField
                label="Tagline"
                name="tagline"
                defaultValue={product?.tagline}
                error={state.fieldErrors?.tagline}
                hint="One line under the product name. Concrete beats clever."
                required
              />

              <TextArea
                label="Description"
                name="description"
                rows={7}
                defaultValue={product?.description}
                hint="Blank lines separate paragraphs on the product page."
              />
            </div>
          </Panel>

          <Panel
            title="Pricing"
            description={`All amounts in ${currency}, entered as you would write them.`}
          >
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField
                label="Price"
                name="price"
                inputMode="decimal"
                defaultValue={money(product?.price)}
                error={state.fieldErrors?.price}
                required
              />
              <TextField
                label="Compare at"
                name="compareAtPrice"
                inputMode="decimal"
                defaultValue={money(product?.compareAtPrice)}
                error={state.fieldErrors?.compareAtPrice}
                hint="Set to show a markdown."
              />
              <TextField
                label="Unit cost"
                name="costPrice"
                inputMode="decimal"
                defaultValue={money(product?.costPrice)}
                error={state.fieldErrors?.costPrice}
                hint="Internal only. Drives margin reporting."
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5">
              <Checkbox
                label="Charge sales tax on this product"
                name="taxable"
                defaultChecked={product?.taxable ?? true}
              />
              <Checkbox
                label="Lower impact"
                name="sustainable"
                hint="Shows the leaf badge and includes it in the lower-impact filter."
                defaultChecked={product?.sustainable ?? false}
              />
              <Checkbox
                label="Show on the home page"
                name="showOnHome"
                hint="Places this piece in the home page New arrivals section. How many are visible at once is set in Settings."
                defaultChecked={product?.showOnHome ?? false}
              />
            </div>
          </Panel>

          {/* ---------------- Colourways ---------------- */}
          <Panel
            title="Colourways"
            description="Each colourway is a variant. Photography is optional â€” generated artwork is used when a colourway has none."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    colors: [
                      ...current.colors,
                      { id: `colour-${current.colors.length + 1}`, name: "", hex: "#cccccc" },
                    ],
                  }))
                }
              >
                <Plus size={13} aria-hidden />
                Add colourway
              </Button>
            }
          >
            {state.fieldErrors?.colors ? (
              <p role="alert" className="mb-4 text-xs text-danger-500">
                {state.fieldErrors.colors}
              </p>
            ) : null}

            <ul className="flex flex-col gap-4">
              {draft.colors.map((color, index) => (
                <li
                  key={`${formId}-color-${index}`}
                  className="grid gap-3 border border-line p-3 sm:grid-cols-[1fr_9rem_auto]"
                >
                  <TextField
                    label={`Colour ${index + 1} name`}
                    name="colorName"
                    defaultValue={color.name}
                    placeholder="Camel"
                  />

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`${formId}-hex-${index}`}
                      className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted"
                    >
                      Swatch
                    </label>
                    <div className="flex items-center gap-2">
                      {/* Native colour input, plus the hex in text so it can be pasted. */}
                      <input
                        id={`${formId}-hex-${index}`}
                        type="color"
                        name="colorHex"
                        defaultValue={color.hex}
                        aria-label={`Colour ${index + 1} swatch`}
                        className="h-11 w-12 shrink-0 cursor-pointer border border-line-strong bg-surface p-1"
                      />
                      <output
                        aria-hidden
                        className="truncate font-mono text-xs text-content-muted"
                      >
                        {color.hex}
                      </output>
                    </div>
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove colourway ${index + 1}`}
                      disabled={draft.colors.length === 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          colors: current.colors.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash size={14} aria-hidden />
                    </Button>
                  </div>

                  <div className="sm:col-span-3">
                    <ImageUploadList
                      name="colorImages"
                      label="Photography"
                      defaultValue={color.images}
                      slotLabels={["Front", "Detail", "Back", "On figure"]}
                      hint="Drop up to 4. Order matters â€” the first is the card image."
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {/* ---------------- Sizes ---------------- */}
          <Panel
            title="Sizes"
            description="The size run a shopper can choose from. Order matters — they are shown as listed."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    sizes: [...current.sizes, { label: "" }],
                  }))
                }
              >
                <Plus size={13} aria-hidden />
                Add size
              </Button>
            }
          >
            <SelectField
              label="Size system"
              name="sizeSystem"
              value={sizeSystem}
              onValueChange={applySizePreset}
              options={[
                { value: "alpha", label: "Alpha (XSâ€“XXL)" },
                { value: "waist", label: "Waist (28â€“38)" },
                { value: "one-size", label: "One size" },
                { value: "shoe", label: "Shoe (39â€“45)" },
              ]}
              hint="Changing this replaces the size run below and picks the matching guide on the storefront."
              className="max-w-xs"
            />

            {state.fieldErrors?.sizes ? (
              <p role="alert" className="mt-4 text-xs text-danger-500">
                {state.fieldErrors.sizes}
              </p>
            ) : null}

            <ul className="mt-5 flex flex-col gap-2">
              {draft.sizes.map((size, index) => (
                <li
                  key={`${formId}-size-${index}`}
                  className="grid grid-cols-[1fr_auto] items-end gap-3"
                >
                  <TextField
                    label={index === 0 ? "Label" : ""}
                    hideLabel={index !== 0}
                    name="sizeLabel"
                    defaultValue={size.label}
                    placeholder="M"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove size ${size.label || index + 1}`}
                    disabled={draft.sizes.length === 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        sizes: current.sizes.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash size={14} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Specification">
            <div className="flex flex-col gap-5">
              <TextArea
                label="Construction details"
                name="details"
                rows={6}
                defaultValue={(product?.details ?? []).join("\n")}
                hint="One per line. Shown as a bulleted list under Details & fit."
              />
              <TextField
                label="Composition"
                name="composition"
                defaultValue={product?.composition}
                placeholder="100% Grade-A cashmere."
              />
              <TextArea
                label="Care instructions"
                name="care"
                rows={4}
                defaultValue={(product?.care ?? []).join("\n")}
                hint="One per line."
              />
              <TextField
                label="Fit note"
                name="fitNote"
                defaultValue={product?.fitNote}
                placeholder='Regular. Model is 5&apos;11" wearing size S.'
              />
              <TextField
                label="Origin"
                name="origin"
                defaultValue={product?.origin}
                placeholder="Knitted in Hawick, Scotland."
              />
            </div>
          </Panel>

          <Panel
            title="Search engine listing"
            description="Leave blank to use the product name and tagline."
          >
            <div className="flex flex-col gap-5">
              <TextField label="SEO title" name="seoTitle" defaultValue={product?.seoTitle} />
              <TextArea
                label="SEO description"
                name="seoDescription"
                rows={3}
                defaultValue={product?.seoDescription}
              />
            </div>
          </Panel>
        </div>

        {/* ---------------- Sidebar ---------------- */}
        <div className="flex flex-col gap-6 xl:sticky xl:top-20">
          <Panel title="Publication">
            <div className="flex flex-col gap-5">
              <SelectField
                label="Status"
                name="status"
                defaultValue={product?.status ?? "draft"}
                options={[
                  { value: "active", label: "Active â€” visible on the storefront" },
                  { value: "draft", label: "Draft â€” hidden" },
                  { value: "archived", label: "Archived â€” retired" },
                ]}
              />

              <TextField
                label="Release date"
                name="releasedAt"
                type="date"
                defaultValue={(product?.releasedAt ?? new Date().toISOString()).slice(0, 10)}
                hint="Drives the New badge and newest-first sorting."
              />

              <div className="flex flex-col gap-2">
                <SubmitButton
                  pendingLabel={isEdit ? "Savingâ€¦" : "Creatingâ€¦"}
                  size="lg"
                  className="w-full"
                >
                  {isEdit ? "Save changes" : "Create product"}
                </SubmitButton>

                {isEdit ? (
                  <Link
                    href={`/product/${product!.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center justify-center gap-2 text-xs text-content-muted transition-colors hover:text-content"
                  >
                    <ArrowSquareOut size={13} aria-hidden />
                    View on storefront
                  </Link>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="Organisation">
            <div className="flex flex-col gap-5">
              <SelectField
                label="Category"
                name="category"
                defaultValue={product?.category ?? categories[0]?.slug}
                error={state.fieldErrors?.category}
                options={categories.map((category) => ({
                  value: category.slug,
                  label: category.name,
                }))}
                required
              />

              <SelectField
                label="Department"
                name="department"
                defaultValue={product?.department ?? "unisex"}
                options={[
                  { value: "unisex", label: "Unisex" },
                  { value: "women", label: "Women" },
                  { value: "men", label: "Men" },
                ]}
              />

              <fieldset>
                <legend className="mb-2.5 text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
                  Collections
                </legend>
                <div className="flex flex-col gap-2.5">
                  {collections.map((collection) => (
                    <Checkbox
                      key={collection.slug}
                      label={collection.name}
                      name="collections"
                      value={collection.slug}
                      defaultChecked={product?.collections.includes(collection.slug)}
                    />
                  ))}
                </div>
              </fieldset>

              <TextField
                label="Popularity"
                name="popularity"
                type="number"
                min={0}
                max={100}
                defaultValue={String(product?.popularity ?? 50)}
                hint="0â€“100. Orders the Featured sort."
              />
            </div>
          </Panel>

          <Panel title="Inventory & shipping">
            <div className="flex flex-col gap-5">
              <TextField
                label="SKU"
                name="sku"
                defaultValue={product?.sku}
                hint="Variant SKUs are derived by appending the size."
              />
              <TextField
                label="Weight (grams)"
                name="weightGrams"
                type="number"
                min={0}
                defaultValue={product?.weightGrams ? String(product.weightGrams) : ""}
                hint="Used for carrier rates."
              />
            </div>
          </Panel>

          <Panel
            title="Pairs well with"
            description="Shown as the cross-sell on the product page."
          >
            <div className="max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              <div className="flex flex-col gap-2.5">
                {otherProducts.map((candidate) => (
                  <Checkbox
                    key={candidate.slug}
                    label={candidate.name}
                    name="pairsWith"
                    value={candidate.slug}
                    defaultChecked={product?.pairsWith?.includes(candidate.slug)}
                  />
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </form>
  );
}
