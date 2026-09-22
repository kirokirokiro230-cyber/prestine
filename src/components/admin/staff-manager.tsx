"use client";

import { useActionState, useState } from "react";
import { PencilSimple, Plus, X } from "@phosphor-icons/react";
import {
  createStaffAction,
  deleteStaffAction,
  updateStaffAction,
  type SettingsActionState,
} from "@/app/admin/actions/settings";
import { Button } from "@/components/ui/button";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { formatDate } from "@/lib/format";
import type { AdminRole } from "@/lib/types";
import { ConfirmSubmit, FormFeedback, Panel, SubmitButton } from "./primitives";

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  createdAt: string;
  lastLoginAt?: string;
  disabled?: boolean;
  /** True for the signed-in user, who cannot delete or demote themselves. */
  isSelf: boolean;
}

const ROLE_OPTIONS: Array<{ value: AdminRole; label: string }> = [
  { value: "owner", label: "Owner — everything, including settings and staff" },
  { value: "manager", label: "Manager — catalogue, orders and discounts" },
  { value: "staff", label: "Staff — orders and fulfilment only" },
];

/**
 * Staff accounts.
 *
 * Passwords are only ever set, never displayed — there is no way to read an existing
 * one back, which is the point of hashing them. Resetting means typing a new one.
 */
export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const [createState, createAction] = useActionState<SettingsActionState, FormData>(
    createStaffAction,
    {},
  );
  const [updateState, updateAction] = useActionState<SettingsActionState, FormData>(
    updateStaffAction,
    {},
  );

  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const current = editing ? staff.find((entry) => entry.id === editing) : undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
      <Panel
        title="Accounts"
        description={`${staff.length} account${staff.length === 1 ? "" : "s"} can sign in.`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setCreating((value) => !value);
            }}
          >
            <Plus size={13} aria-hidden />
            Add account
          </Button>
        }
        bodyClassName="px-0 py-0"
      >
        <ul className="divide-y divide-line">
          {staff.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{entry.name}</h3>
                  <span className="bg-surface-sunken px-2 py-0.5 text-2xs uppercase tracking-[0.08em] text-content-muted">
                    {entry.role}
                  </span>
                  {entry.isSelf ? (
                    <span className="text-2xs uppercase tracking-[0.08em] text-accent">You</span>
                  ) : null}
                  {entry.disabled ? (
                    <span className="bg-danger-100 px-2 py-0.5 text-2xs uppercase tracking-[0.08em] text-danger-700 dark:bg-danger-700/25 dark:text-danger-100">
                      Disabled
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 truncate text-xs text-content-muted">{entry.email}</p>
                <p className="mt-1 text-2xs text-content-subtle">
                  Added {formatDate(entry.createdAt, "short")}
                  {entry.lastLoginAt
                    ? ` · last signed in ${formatDate(entry.lastLoginAt, "short")}`
                    : " · never signed in"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditing(editing === entry.id ? null : entry.id);
                  }}
                  aria-label={`Edit ${entry.name}`}
                  title="Edit"
                  className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
                >
                  <PencilSimple size={14} aria-hidden />
                </button>

                {entry.isSelf ? null : (
                  <form action={deleteStaffAction}>
                    <input type="hidden" name="id" value={entry.id} />
                    <ConfirmSubmit confirmLabel="Confirm remove">Remove</ConfirmSubmit>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {creating ? (
        <Panel
          title="Add an account"
          action={
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Close"
              className="grid size-8 place-items-center text-content-muted transition-colors hover:text-content"
            >
              <X size={15} aria-hidden />
            </button>
          }
        >
          <FormFeedback error={createState.error} success={createState.success} />

          <form action={createAction} className="mt-2 flex flex-col gap-5">
            <TextField label="Name" name="name" required />
            <TextField label="Email address" name="email" type="email" required />
            <TextField
              label="Temporary password"
              name="password"
              type="password"
              autoComplete="new-password"
              hint="At least 12 characters, with upper and lower case and a number. Share it securely and ask them to change it."
              required
            />
            <SelectField label="Role" name="role" defaultValue="staff" options={ROLE_OPTIONS} />

            <div className="flex items-center gap-3">
              <SubmitButton>Create account</SubmitButton>
              <Button type="button" variant="ghost" size="md" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : current ? (
        <Panel
          title={`Edit ${current.name}`}
          action={
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close"
              className="grid size-8 place-items-center text-content-muted transition-colors hover:text-content"
            >
              <X size={15} aria-hidden />
            </button>
          }
        >
          <FormFeedback error={updateState.error} success={updateState.success} />

          <form key={current.id} action={updateAction} className="mt-2 flex flex-col gap-5">
            <input type="hidden" name="id" value={current.id} />

            <TextField label="Name" name="name" defaultValue={current.name} />

            <SelectField
              label="Role"
              name="role"
              defaultValue={current.role}
              options={ROLE_OPTIONS}
              hint={
                current.isSelf
                  ? "Take care changing your own role — you could lock yourself out of settings."
                  : undefined
              }
            />

            <TextField
              label="Reset password"
              name="password"
              type="password"
              autoComplete="new-password"
              hint="Leave blank to keep the current password. Existing passwords cannot be read back."
            />

            {current.isSelf ? null : (
              <Checkbox
                label="Disabled"
                name="disabled"
                hint="Blocks sign-in without deleting the account or its audit history."
                defaultChecked={current.disabled ?? false}
              />
            )}

            <div className="flex items-center gap-3">
              <SubmitButton>Save changes</SubmitButton>
              <Button type="button" variant="ghost" size="md" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : (
        <Panel title="Roles">
          <ul className="flex flex-col gap-4 text-sm leading-relaxed">
            <li>
              <strong className="font-medium">Owner</strong>
              <p className="text-content-muted">
                Everything, including store settings and adding or removing staff. There must
                always be at least one active owner.
              </p>
            </li>
            <li>
              <strong className="font-medium">Manager</strong>
              <p className="text-content-muted">
                Products, categories, collections, orders and discounts. Cannot change
                settings or manage staff.
              </p>
            </li>
            <li>
              <strong className="font-medium">Staff</strong>
              <p className="text-content-muted">
                Orders and fulfilment only. Cannot see or change prices, products or
                discounts — the right level for someone packing parcels.
              </p>
            </li>
          </ul>

          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-content-subtle">
            Permissions are enforced on the server for every action, not just hidden in the
            navigation. A staff account calling a product endpoint directly is rejected.
          </p>
        </Panel>
      )}
    </div>
  );
}
