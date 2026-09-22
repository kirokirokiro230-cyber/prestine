"use client";

import { useActionState, useState } from "react";
import { PencilSimple, Plus, X } from "@phosphor-icons/react";
import {
  deletePromoAction,
  savePromoAction,
  type SettingsActionState,
} from "@/app/admin/actions/settings";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { createMoneyFormatter } from "@/lib/format";
import { ConfirmSubmit, FormFeedback, Panel, SubmitButton } from "./primitives";

interface DiscountRow {
  code: string;
  description: string;
  percentOff?: number;
  amountOff?: number;
  minSubtotal?: number;
  orders: number;
  discounted: number;
}

/**
 * Discount code editor.
 *
 * The percentage/fixed-amount choice is a radio-style select rather than two
 * always-visible fields, because a code with both set is invalid — the server
 * rejects it, and the form should not invite the mistake in the first place.
 */
export function DiscountManager({
  codes,
  currency,
  locale,
}: {
  codes: DiscountRow[];
  currency: string;
  locale: string;
}) {
  const [state, action] = useActionState<SettingsActionState, FormData>(savePromoAction, {});
  const money = createMoneyFormatter(currency, locale);

  /** `null` = closed, `""` = creating, otherwise the code being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const current = editing ? codes.find((entry) => entry.code === editing) : undefined;

  const [kind, setKind] = useState<"percent" | "amount">(
    current?.amountOff ? "amount" : "percent",
  );

  const openEditor = (code: string) => {
    const target = codes.find((entry) => entry.code === code);
    setKind(target?.amountOff ? "amount" : "percent");
    setEditing(code);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
      <Panel
        title="Codes"
        description="Shown to shoppers only if you tell them — nothing lists these publicly."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setKind("percent");
              setEditing(editing === "" ? null : "");
            }}
          >
            <Plus size={13} aria-hidden />
            New code
          </Button>
        }
        bodyClassName="px-0 py-0"
      >
        {codes.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-content-muted">
            No discount codes yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {codes.map((entry) => (
              <li key={entry.code} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code
                      data-numeric
                      className="bg-surface-sunken px-2 py-1 font-mono text-sm font-medium"
                    >
                      {entry.code}
                    </code>
                    <span className="text-sm text-content">
                      {entry.percentOff
                        ? `${entry.percentOff}% off`
                        : `${money(entry.amountOff ?? 0)} off`}
                    </span>
                    {entry.minSubtotal ? (
                      <span className="text-xs text-content-subtle">
                        over {money(entry.minSubtotal)}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs text-content-muted">{entry.description}</p>

                  <p data-numeric className="mt-1.5 text-2xs text-content-subtle">
                    {entry.orders} redemption{entry.orders === 1 ? "" : "s"} ·{" "}
                    {money(entry.discounted)} given away
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditor(entry.code)}
                    aria-label={`Edit ${entry.code}`}
                    title="Edit"
                    className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
                  >
                    <PencilSimple size={14} aria-hidden />
                  </button>

                  <form action={deletePromoAction}>
                    <input type="hidden" name="code" value={entry.code} />
                    <ConfirmSubmit confirmLabel="Confirm delete">Delete</ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editing !== null ? (
        <Panel
          title={current ? `Edit ${current.code}` : "New discount"}
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

          <form key={editing} action={action} className="mt-2 flex flex-col gap-5">
            <input type="hidden" name="existingCode" value={current?.code ?? ""} />

            <TextField
              label="Code"
              name="code"
              defaultValue={current?.code}
              hint="Case-insensitive; stored and matched in upper case."
              required
            />

            <TextField
              label="Description"
              name="description"
              defaultValue={current?.description}
              hint="Shown in the cart when the code is applied."
              required
            />

            <SelectField
              label="Discount type"
              name="kind"
              value={kind}
              onValueChange={(next) => setKind(next as "percent" | "amount")}
              options={[
                { value: "percent", label: "Percentage off" },
                { value: "amount", label: "Fixed amount off" },
              ]}
            />

            {kind === "percent" ? (
              <TextField
                label="Percent off"
                name="percentOff"
                type="number"
                min={1}
                max={100}
                defaultValue={current?.percentOff ? String(current.percentOff) : ""}
                required
              />
            ) : (
              <TextField
                label={`Amount off (${currency})`}
                name="amountOff"
                inputMode="decimal"
                defaultValue={current?.amountOff ? (current.amountOff / 100).toFixed(2) : ""}
                required
              />
            )}

            <TextField
              label={`Minimum spend (${currency})`}
              name="minSubtotal"
              inputMode="decimal"
              defaultValue={current?.minSubtotal ? (current.minSubtotal / 100).toFixed(2) : ""}
              hint="Optional. Applies to the merchandise subtotal before shipping and tax."
            />

            <div className="flex items-center gap-3">
              <SubmitButton>{current ? "Save changes" : "Create code"}</SubmitButton>
              <Button type="button" variant="ghost" size="md" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : (
        <Panel title="How discounts behave">
          <ul className="flex flex-col gap-3 text-sm leading-relaxed text-content-muted">
            <li>Applied to the merchandise subtotal, before shipping and tax.</li>
            <li>Only one code per order — the cart replaces rather than stacks.</li>
            <li>A discount can never exceed the subtotal, so a total cannot go negative.</li>
            <li>
              The free-shipping threshold is judged on the discounted subtotal, so a large
              code can push an order back under it.
            </li>
          </ul>
        </Panel>
      )}
    </div>
  );
}
