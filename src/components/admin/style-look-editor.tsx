"use client";

import { useActionState } from "react";
import { X } from "@phosphor-icons/react";
import { saveLookAction, type LookActionState } from "@/app/admin/actions/looks";
import { ImageUploadField } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, TextField } from "@/components/ui/field";
import { MAX_LOOK_TITLE, type StyleLook } from "@/lib/style-looks";
import { FormFeedback, Panel, SubmitButton } from "./primitives";
import { ProductPicker, type PickerProduct } from "./product-picker";

/**
 * The form for creating or editing one style hint.
 *
 * Shared by the all-looks page and a product's own page. Render it with a `key` that
 * changes when the look being edited changes, so the uncontrolled inputs and the picker's
 * state reset instead of carrying one look's values into the next.
 *
 * `pinnedProductId` is set on a product's own page. That product is then the photograph's
 * owner: always included, always shown on its page, and not removable here.
 */
export function StyleLookEditor({
  look,
  products,
  pinnedProductId,
  onClose,
}: {
  /** The look being edited, or undefined to create a new one. */
  look?: StyleLook;
  products: PickerProduct[];
  pinnedProductId?: string;
  onClose: () => void;
}) {
  const [state, action] = useActionState<LookActionState, FormData>(saveLookAction, {});

  return (
    <Panel
      title={look ? "Edit style hint" : "New style hint"}
      action={
        <button
          type="button"
          onClick={onClose}
          aria-label="Close editor"
          className="grid size-8 place-items-center text-content-muted transition-colors hover:text-content"
        >
          <X size={15} aria-hidden />
        </button>
      }
    >
      <FormFeedback error={state.error} success={state.success} />

      <form action={action} className="mt-2 flex flex-col gap-5">
        <input type="hidden" name="id" value={look?.id ?? ""} />

        <TextField
          label="Title"
          name="title"
          defaultValue={look?.title}
          maxLength={MAX_LOOK_TITLE}
          hint="Shown under the photograph, e.g. “Weekend layers”."
          required
        />

        <ImageUploadField
          name="imageUrl"
          label="Photograph"
          defaultValue={look?.imageUrl}
          hint="Portrait, 3:4, about 1200 × 1600. The whole look should be visible."
        />

        <ProductPicker
          products={products}
          defaultSelected={look?.productIds ?? []}
          defaultShown={look?.shownOn}
          pinnedProductId={pinnedProductId}
        />

        <Checkbox
          label="Published"
          name="active"
          hint="Hidden photographs stay here but never appear on a product page."
          defaultChecked={look?.active ?? true}
        />

        <div className="flex items-center gap-3">
          <SubmitButton>{look ? "Save changes" : "Create style hint"}</SubmitButton>
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
