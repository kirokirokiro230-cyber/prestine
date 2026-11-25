"use client";

import { useState } from "react";
import { MapPin, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ComboboxField } from "@/components/ui/combobox";
import { SelectField, TextField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrowserStore, useIsHydrated, useResetOnChange } from "@/hooks/use-store";
import { isDeliverable, upsertAddress } from "@/lib/address";
import { addressName } from "@/lib/format";
import { STATE_OPTIONS, citySuggestions } from "@/lib/india";
import { addressStore } from "@/lib/stores";
import type { Address } from "@/lib/types";
import { phone as validatePhone, required, type Errors } from "@/lib/validation";

type Field = keyof Address;

const EMPTY: Address = {
  name: "",
  line1: "",
  city: "",
  region: "",
  phone: "",
};

/**
 * Address book with add/edit/delete.
 *
 * Persisted locally for now; the shape matches the `Address` used at checkout so
 * swapping in an authenticated API is a one-file change. The first entry is
 * treated as the default, which keeps the model simple and matches how most
 * shoppers use it.
 */
export function AddressBook() {
  const [addresses, setAddresses] = useBrowserStore(addressStore);
  const hydrated = useIsHydrated();

  const [open, setOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Address>(EMPTY);
  const [errors, setErrors] = useState<Errors<Field>>({});
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Clear the form when the dialog closes so a cancelled edit does not leak into
  // the next "add". Done during render, not in an effect.
  useResetOnChange(open, () => {
    if (!open) {
      setDraft(EMPTY);
      setEditingIndex(null);
      setErrors({});
    }
  });

  const set = (field: Field, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validate = (): boolean => {
    // The same five fields checkout collects, validated by the same functions.
    const next: Errors<Field> = {
      name: required(draft.name, "Full name") ?? undefined,
      line1: required(draft.line1, "Address") ?? undefined,
      city: required(draft.city, "City") ?? undefined,
      region: required(draft.region, "State or county") ?? undefined,
      // Same rule as checkout, so the two forms cannot accept different things.
      postalCode: !/^[1-9][0-9]{5}$/.test((draft.postalCode ?? "").trim())
        ? "Enter a valid 6-digit pincode"
        : undefined,
      phone: validatePhone(draft.phone, false) ?? undefined,
    };

    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, value]) => Boolean(value)),
    ) as Errors<Field>;

    setErrors(cleaned);
    return Object.keys(cleaned).length === 0;
  };

  const save = () => {
    if (!validate()) return;

    setAddresses((current) => {
      if (editingIndex !== null) {
        const next = [...current];
        next[editingIndex] = draft;
        return next;
      }

      /*
       * `upsertAddress` rather than a plain append, so adding an address that is
       * already in the book brings the existing one forward instead of listing
       * it twice. Same function checkout uses — one definition of "same
       * address" for both.
       */
      return upsertAddress(current, draft);
    });
    setOpen(false);
  };

  const startEdit = (index: number) => {
    setDraft(addresses[index]);
    setEditingIndex(index);
    setOpen(true);
  };

  const makeDefault = (index: number) => {
    setAddresses((current) => {
      const next = [...current];
      const [entry] = next.splice(index, 1);
      return [entry, ...next];
    });
  };

  if (!hydrated) {
    return (
      <div role="status" aria-label="Loading your addresses" className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      {addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin size={22} aria-hidden />}
          title="No saved addresses"
          description="Save an address to check out faster next time."
        >
          <Button size="md" onClick={() => setOpen(true)}>
            <Plus size={14} aria-hidden />
            Add an address
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="flex justify-end">
            <Button variant="outline" size="md" onClick={() => setOpen(true)}>
              <Plus size={14} aria-hidden />
              Add an address
            </Button>
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {addresses.map((address, index) => (
              <li
                key={`${address.line1}-${index}`}
                className="border border-line bg-surface p-5"
              >
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {index === 0 ? (
                    <p className="text-2xs font-medium uppercase tracking-[0.12em] text-accent">
                      Default
                    </p>
                  ) : null}

                  {/*
                    Entries saved before the pincode field existed. Flagged
                    rather than hidden: the shopper needs to know why checkout
                    will not let them use it, and editing it takes one click.
                  */}
                  {!isDeliverable(address) ? (
                    <p className="text-2xs font-medium uppercase tracking-[0.12em] text-warning-700 dark:text-warning-100">
                      Needs a pincode
                    </p>
                  ) : null}
                </div>

                <address className="text-sm not-italic leading-relaxed text-content-muted">
                  <span className="block font-medium text-content">
                    {addressName(address)}
                  </span>
                  {address.line1}
                  {address.line2 ? (
                    <>
                      <br />
                      {address.line2}
                    </>
                  ) : null}
                  <br />
                  {address.city}, {address.region}
                  {address.postalCode ? (
                    <>
                      <br />
                      {address.postalCode}
                    </>
                  ) : null}
                  {address.country ? (
                    <>
                      <br />
                      {address.country}
                    </>
                  ) : null}
                  {address.phone ? (
                    <>
                      <br />
                      <span data-numeric>{address.phone}</span>
                    </>
                  ) : null}
                </address>

                <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={() => startEdit(index)}
                    className="inline-flex items-center gap-1.5 py-1 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
                  >
                    <PencilSimple size={12} aria-hidden />
                    Edit
                  </button>

                  {index !== 0 ? (
                    <button
                      type="button"
                      onClick={() => makeDefault(index)}
                      className="py-1 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
                    >
                      Make default
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setConfirmDelete(index)}
                    className="ml-auto inline-flex items-center gap-1.5 py-1 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-danger-500"
                  >
                    <Trash size={12} aria-hidden />
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Add / edit */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingIndex === null ? "Add an address" : "Edit address"}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="md" onClick={save}>
              {editingIndex === null ? "Save address" : "Save changes"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <TextField
            label="Full name"
            autoComplete="name"
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
            error={errors.name}
            required
          />

          <TextField
            label="Address"
            autoComplete="street-address"
            value={draft.line1}
            onChange={(event) => set("line1", event.target.value)}
            error={errors.line1}
            required
          />

          {/* Same two controls as checkout — one form teaching a different shape of
              address to the same shopper would be worse than either choice. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="State"
              options={STATE_OPTIONS}
              value={draft.region}
              onValueChange={(next) => set("region", next)}
              error={errors.region}
              placeholder="Select a state"
              required
            />
            <ComboboxField
              label="City"
              suggestions={citySuggestions(draft.region)}
              value={draft.city}
              onValueChange={(next) => set("city", next)}
              error={errors.city}
              placeholder="Start typing"
              required
            />
          </div>

          {/*
            Required, like it is at checkout. The courier routes on it and
            Delhivery refuses a shipment without one, so an address saved
            without a pincode cannot actually be delivered to — which is what
            made the entries saved before this field existed unusable.
          */}
          <TextField
            label="Pincode"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="385001"
            maxLength={6}
            value={draft.postalCode ?? ""}
            onChange={(event) =>
              set("postalCode", event.target.value.replace(/\D/g, ""))
            }
            error={errors.postalCode}
            hint="6-digit postal code, used to route the parcel."
            required
          />

          <TextField
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={draft.phone}
            onChange={(event) => set("phone", event.target.value)}
            error={errors.phone}
            hint="Required — how the courier reaches you if there is a problem."
            required
          />
        </div>
      </Modal>

      {/* Delete confirmation — destructive actions always confirm. */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Remove this address?"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                if (confirmDelete === null) return;
                setAddresses((current) => current.filter((_, i) => i !== confirmDelete));
                setConfirmDelete(null);
              }}
            >
              Remove address
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-content-muted">
          This only removes the address from your address book. Orders already placed to it
          are not affected.
        </p>
      </Modal>
    </>
  );
}
