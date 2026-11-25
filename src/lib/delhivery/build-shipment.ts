/**
 * Turn one of our orders into the input Delhivery's manifestation API expects.
 *
 * Split out from the server action that calls it so the mapping can be
 * exercised on its own — manifesting costs real money, so the only way to test
 * this logic repeatedly is to be able to build and inspect the payload without
 * sending it.
 */

import type { Order } from '@/lib/types';
import type { CreateShipmentInput, PickupLocation } from './types';
import { packShipment } from './packaging';

/** Default HSN code. Should move onto the product record per category. */
const FALLBACK_HSN_CODE = '610910';

/**
 * Strip a phone number down to the ten digits Delhivery wants, dropping a
 * country code if one is present.
 */
export function normalisePhoneForDelhivery(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^91/, '').substring(0, 10);
}

export function buildShipmentInput(
  order: Order,
  pickupLocation: PickupLocation
): CreateShipmentInput {
  // Weight and dimensions scale with the number of pieces in the box.
  const quantity = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const packed = packShipment(quantity);

  // Optional. Left unset, Delhivery uses the GST details held against the
  // account rather than a per-shipment value.
  const sellerGstTin = process.env.SELLER_GST_TIN?.trim() || undefined;

  /*
   * Read from the order's recorded method, never inferred from payment status.
   * The previous `paymentStatus === 'paid'` test meant any order manifested
   * before its payment confirmed would ship as COD for its full total — asking a
   * customer who had already paid online to pay again at the door.
   */
  const isCod = order.paymentMethod === 'cod';

  return {
    orderId: order.id,
    customerName: order.shippingAddress.name,
    customerAddress: order.shippingAddress.line1,
    customerCity: order.shippingAddress.city,
    customerState: order.shippingAddress.region,
    customerPincode: order.shippingAddress.postalCode ?? '',
    customerPhone: normalisePhoneForDelhivery(order.shippingAddress.phone),
    orderNumber: order.id,
    paymentMode: isCod ? 'COD' : 'Prepaid',
    // The full amount the courier must collect, fee included.
    codAmount: isCod ? order.totals.total : 0,
    totalAmount: order.totals.total,
    productDescription: order.lines.map((line) => line.name).join(', '),
    hsnCode: FALLBACK_HSN_CODE,
    quantity,
    weightGrams: packed.weightGrams,
    dimensions: packed.dimensions,
    pickupLocation: pickupLocation.name,
    sellerGstTin,
    invoiceNumber: order.id,
    returnAddress: {
      name: pickupLocation.name,
      address: pickupLocation.address,
      city: pickupLocation.city,
      state: pickupLocation.state,
      pincode: pickupLocation.pincode,
      phone: pickupLocation.phone,
    },
    shippingMode: 'Surface',
  };
}
