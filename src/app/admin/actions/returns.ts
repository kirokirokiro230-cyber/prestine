"use server";

import { revalidatePath } from "next/cache";
import type { ReturnStatus } from "@/lib/delhivery/types";
import { canMoveReturn, staffReturnLabel } from "@/lib/return-flow";
import { recordAudit } from "@/server/audit";
import { addOrderNote, getOrder } from "@/server/repositories/orders";
import { getReturn, updateReturnStatus } from "@/server/repositories/shipping";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Staff actions on a return: approve, reject, mark received, mark refunded, cancel.
 *
 * ## The UPI ID
 *
 * Nothing here reads it, writes it, logs it or puts it in the audit trail. It is displayed
 * in the admin panel (which loads the return directly) and erased by `updateReturnStatus`
 * when a return reaches a final state. The audit entry says what happened to the return, in
 * words, and names the order — enough to answer "who refunded this", without the audit log
 * becoming a second copy of customers' payment addresses that more people can read.
 */

export interface ReturnActionState {
  error?: string;
  success?: string;
}

const STATUSES: readonly ReturnStatus[] = [
  "requested",
  "approved",
  "rejected",
  "picked_up",
  "in_transit",
  "received",
  "refunded",
  "cancelled",
];

function isReturnStatus(value: string): value is ReturnStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export async function updateReturnAction(
  _previous: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  try {
    const admin = await requirePermission("orders:write");

    const returnId = String(formData.get("returnId") ?? "").trim();
    const target = String(formData.get("to") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();

    if (!returnId || !isReturnStatus(target)) return { error: "That is not a valid action." };

    const record = await getReturn(returnId);
    if (!record) return { error: "That return no longer exists." };

    // The transition table is the rule; the buttons only offer what it allows, and this
    // refuses anything else, because a form post does not have to come from a button.
    if (!canMoveReturn(record.status, target)) {
      return {
        error: `A return that is ${staffReturnLabel(record.status).toLowerCase()} cannot be marked ${staffReturnLabel(target).toLowerCase()}.`,
      };
    }

    const order = await getOrder(record.order_id);
    if (!order) return { error: "The order for this return no longer exists." };

    /*
     * Turning a return down needs a reason. The customer will ask why, and "rejected" with
     * nothing behind it is the answer nobody can defend a week later.
     */
    if (target === "rejected" && !note) {
      return { error: "Give a reason for declining this return." };
    }

    let refundAmount: number | undefined;

    if (target === "refunded") {
      const major = Number(String(formData.get("refundAmount") ?? "").replace(/,/g, ""));

      if (!Number.isFinite(major) || major <= 0) {
        return { error: "Enter the amount you refunded." };
      }

      refundAmount = Math.round(major * 100);

      // A typo of an extra zero is the realistic mistake, and it is recorded as money
      // returned. Never more than the customer paid.
      if (refundAmount > order.totals.total) {
        return {
          error: `That is more than the order total of ${(order.totals.total / 100).toFixed(2)}.`,
        };
      }
    }

    const updated = await updateReturnStatus(returnId, target, {
      refundAmount,
      // Only apply if nobody else has moved it since this page loaded.
      expectedFrom: record.status,
    });

    if (!updated) {
      return {
        error: "This return was changed by someone else. Reload the page to see where it is now.",
      };
    }

    // Staff's reasoning goes on the order's internal notes. It must not overwrite
    // `returns.notes`, which holds what the CUSTOMER wrote.
    if (note) {
      await addOrderNote(
        order.id,
        `${admin.name}: return ${staffReturnLabel(target).toLowerCase()} — ${note}`,
      );
    }

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "status",
      entity: "return",
      entityId: returnId,
      summary:
        target === "refunded" && refundAmount !== undefined
          ? `Return for ${order.id} marked refunded (${(refundAmount / 100).toFixed(2)})`
          : `Return for ${order.id} moved from ${staffReturnLabel(record.status).toLowerCase()} to ${staffReturnLabel(target).toLowerCase()}`,
    });

    revalidatePath(`/admin/orders/${order.id}`);
    revalidatePath("/admin/orders");

    return {
      success:
        target === "refunded"
          ? "Marked as refunded. The customer’s UPI ID has been erased."
          : `Return marked ${staffReturnLabel(target).toLowerCase()}.`,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };

    // The message only: it is a database or network failure, and must not be the vehicle
    // for anything row-shaped.
    console.error("[returns] staff action failed:", (error as Error).message);
    return { error: "Something went wrong. Please try again." };
  }
}
