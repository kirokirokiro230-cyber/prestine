"use server";

import { revalidatePath } from "next/cache";
import { parseRefundAmount, refundNoteError } from "@/lib/refund";
import { recordAudit } from "@/server/audit";
import { issueRefund, refreshRefund } from "@/server/refunds";
import { addOrderNote } from "@/server/repositories/orders";
import { getRefund } from "@/server/repositories/refunds";
import { getReturn } from "@/server/repositories/shipping";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Staff actions on refunds to the customer's original payment method.
 *
 * ## Authority
 *
 * `orders:write`, the same as marking a COD return refunded: whoever can say "this
 * customer is owed money" can send it. This moves real money out of the merchant account,
 * so it is the thing to tighten first if a role between "manager" and "staff" is ever
 * wanted. Every refund is attributed (the ledger row, the order note and the audit log all
 * carry who), and the amount is capped at what the order was paid.
 *
 * ## Why the key is in the form
 *
 * The page renders a fresh UUID into each refund form. It becomes the refund id, so
 * submitting the same form twice (a double click, a retry after a slow response) asks for
 * the same refund twice, and the second is refused. Without it, "press refund again
 * because nothing seemed to happen" is a double refund.
 */

export interface RefundActionState {
  error?: string;
  success?: string;
  /**
   * The form's key has been used up and the form should make a new one. True after a refund
   * that went through and after one Cashfree definitely refused (the same key would only
   * ever answer "already submitted"). False after a typo, which used nothing, and after an
   * unconfirmed refund, where reusing the key is exactly what stops a second one.
   */
  reset?: boolean;
}

const rupees = (minor: number) => `₹${(minor / 100).toFixed(2)}`;

export async function issueRefundAction(
  _previous: RefundActionState,
  formData: FormData,
): Promise<RefundActionState> {
  try {
    const admin = await requirePermission("orders:write");

    const orderId = String(formData.get("orderId") ?? "").trim();
    const key = String(formData.get("key") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const returnId = String(formData.get("returnId") ?? "").trim() || undefined;

    if (!orderId) return { error: "That is not a valid refund." };

    const amount = parseRefundAmount(String(formData.get("amount") ?? ""));
    if (!amount.ok) return { error: amount.error };

    const noteProblem = refundNoteError(note);
    if (noteProblem) return { error: noteProblem };

    /*
     * A refund started from a return must belong to this order and the return must have
     * been received. The buttons only offer it then, but a form post does not have to come
     * from a button, and a refund against the wrong return would mark it refunded.
     */
    if (returnId) {
      const record = await getReturn(returnId);

      if (!record || record.order_id !== orderId) {
        return { error: "That return does not belong to this order." };
      }
      if (record.status !== "received") {
        return { error: "Mark the items received before refunding the return." };
      }
    }

    const result = await issueRefund({
      orderId,
      amount: amount.minor,
      note,
      key,
      returnId,
      actorEmail: admin.email,
    });

    revalidatePath(`/admin/orders/${orderId}`);

    if (!result.ok) {
      /*
       * Cashfree gave no answer. A refund may exist, so this is recorded: the next person
       * to open the order should be able to see that someone tried.
       */
      if (result.refund && result.refund.status === "requested") {
        await recordAudit({
          actorId: admin.id,
          actorEmail: admin.email,
          action: "update",
          entity: "order",
          entityId: orderId,
          summary: `Refund of ${rupees(amount.minor)} requested; Cashfree has not confirmed it`,
        });
      }
      return { error: result.error, reset: result.refund?.status === "failed" };
    }

    await addOrderNote(
      orderId,
      `${admin.name}: refunded ${rupees(amount.minor)} to the original payment method. ${note} (${result.refund.refundId})`,
    ).catch((error) =>
      console.error("[refund] could not add the order note:", (error as Error).message),
    );

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "update",
      entity: "order",
      entityId: orderId,
      summary: `Refunded ${rupees(amount.minor)} through Cashfree (${result.refund.refundId})`,
    });

    revalidatePath("/admin/orders");

    return { success: result.message, reset: true };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };

    console.error("[refund] staff action failed:", (error as Error).message);
    return { error: "Something went wrong. Nothing was refunded; check the refund list before trying again." };
  }
}

/** Ask Cashfree where a refund is, and bring the record up to date. */
export async function refreshRefundAction(
  _previous: RefundActionState,
  formData: FormData,
): Promise<RefundActionState> {
  try {
    await requirePermission("orders:write");

    const id = String(formData.get("refundRowId") ?? "").trim();
    if (!id) return { error: "That is not a valid refund." };

    const row = await getRefund(id);
    if (!row) return { error: "That refund no longer exists." };

    const result = await refreshRefund(id);

    revalidatePath(`/admin/orders/${row.orderId}`);

    return result.ok ? { success: result.message } : { error: result.error };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };

    console.error("[refund] status check failed:", (error as Error).message);
    return { error: "Could not check the refund. Try again." };
  }
}
