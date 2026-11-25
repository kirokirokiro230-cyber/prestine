"use server";

import { revalidatePath } from "next/cache";
import type { Order } from "@/lib/types";
import { recordAudit } from "@/server/audit";
import { cashfreeConfig } from "@/server/cashfree";
import { afterResponse } from "@/server/email/after-response";
import { closePaymentIfOpen } from "@/server/payment-settlement";
import { dispatchStatusEmail } from "@/server/email/dispatch";
import {
  addOrderNote,
  getOrder,
  updateOrderStatus,
} from "@/server/repositories/orders";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Order fulfilment actions.
 *
 * Status transitions are validated in the repository, not here, so the same rules
 * apply however an order is moved.
 */

export interface OrderActionState {
  error?: string;
  success?: string;
}

function revalidateOrder(id: string): void {
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

export async function updateOrderStatusAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  try {
    const admin = await requirePermission("orders:write");

    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "") as Order["status"];
    const reason = String(formData.get("reason") ?? "").trim();

    const before = await getOrder(id);
    if (!before) return { error: "That order no longer exists." };

    /*
     * An unpaid prepaid order must not be marked shipped or delivered. Payment is
     * confirmed only by Cashfree, and until it is the goods have not been paid for —
     * marking one shipped emails the customer "on its way" for something they could
     * still abandon at the payment page. COD is exempt, since cash comes on delivery.
     * Cancelling is always allowed.
     */
    if (
      (status === "shipped" || status === "delivered") &&
      before.paymentMethod !== "cod" &&
      before.paymentStatus !== "paid"
    ) {
      return {
        error:
          "This order has not been paid for yet. Wait for the payment to be confirmed before shipping it.",
      };
    }

    /*
     * There is no "add a tracking number first" gate any more. The waybill is
     * assigned by Delhivery at manifestation and copied onto the order by
     * `create_shipment`, so there is nothing for staff to type — and demanding
     * it here would block a correction on an order whose shipment failed to
     * manifest.
     */

    /*
     * A cancellation without a reason is the one status change that is genuinely
     * unhelpful later: the customer asks why, and the order says only that somebody
     * cancelled it. Required here rather than merely encouraged.
     */
    if (status === "cancelled" && !reason) {
      return { error: "Give a reason for cancelling — the customer will see it." };
    }

    const updated = await updateOrderStatus(id, status, { reason });

    // A cancelled order must not stay payable at Cashfree. See `closePaymentIfOpen`.
    if (status === "cancelled") await closePaymentIfOpen(cashfreeConfig(), before);

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "status",
      entity: "order",
      entityId: id,
      summary:
        status === "cancelled"
          ? `Order ${id} cancelled — ${reason}`
          : `Order ${id} moved from ${before.status} to ${status}`,
    });

    revalidateOrder(id);

    /*
     * Notify unless the merchant asked not to. The opt-out exists for the one case the
     * lifecycle cannot distinguish on its own: correcting a status clicked by mistake.
     * Without it, fixing a fat-fingered "delivered" would tell the customer their parcel
     * had arrived, and there is no way to unsend that.
     *
     * `=== "on"` because an unchecked checkbox is absent from the payload entirely, so
     * there is no "off" value to test for. The form renders the box checked, which is what
     * makes notifying the default — an email nobody remembered to tick is the whole
     * problem this was asked to solve.
     */
    const notify = formData.get("notify") === "on";
    if (notify) afterResponse(() => dispatchStatusEmail(updated));

    return {
      success: notify
        ? `Order marked as ${status}. The customer has been emailed.`
        : `Order marked as ${status}. No email sent.`,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

export async function addOrderNoteAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  try {
    const admin = await requirePermission("orders:write");

    const id = String(formData.get("id") ?? "");
    const body = String(formData.get("note") ?? "").trim();
    if (!body) return { error: "Write something first." };

    await addOrderNote(id, `${admin.name}: ${body}`);
    revalidateOrder(id);
    return { success: "Note added." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}
