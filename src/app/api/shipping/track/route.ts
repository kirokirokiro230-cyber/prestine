/**
 * Track Shipment
 * GET /api/shipping/track?waybill=ABC123456
 *
 * Staff only. A waybill number is not proof of ownership, and the tracking
 * record carries the consignee's name and full delivery history — so without a
 * gate this would hand any customer's details to anyone who supplied a number.
 *
 * A customer-facing equivalent must resolve the waybill from an order the caller
 * proved they hold, via the id-plus-email claim ticket in
 * `src/app/actions/orders.ts`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDelhiveryClient, getDetailedTrackingInfo } from '@/lib/delhivery';
import { getUserFriendlyError, isValidWaybill } from '@/lib/delhivery/utils';
import { PermissionError, requirePermission } from '@/server/session';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('orders:write');

    const waybill = request.nextUrl.searchParams.get('waybill');

    if (!waybill || !isValidWaybill(waybill)) {
      return NextResponse.json(
        { error: 'A valid waybill is required' },
        { status: 400 }
      );
    }

    const client = getDelhiveryClient();
    const tracking = await getDetailedTrackingInfo(client, waybill);

    if (!tracking) {
      return NextResponse.json(
        { error: 'Tracking information not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(tracking);
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
    }
    console.error('Tracking error:', error);
    return NextResponse.json(
      { error: getUserFriendlyError(error) },
      { status: 500 }
    );
  }
}
