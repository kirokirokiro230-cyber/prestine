/**
 * Calculate Shipping Cost
 * POST /api/shipping/calculate
 *
 * Staff only. The quote exposes our negotiated courier rates, and the request
 * body is caller-supplied data forwarded to Delhivery, so both the rates and the
 * account's API quota are worth protecting.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getDelhiveryClient,
  calculateShippingRate,
  type CalculateRateInput,
} from '@/lib/delhivery';
import { getUserFriendlyError, isValidPincode } from '@/lib/delhivery/utils';
import { PermissionError, requirePermission } from '@/server/session';

export async function POST(request: NextRequest) {
  try {
    await requirePermission('orders:write');

    const body = (await request.json()) as Partial<CalculateRateInput>;

    if (
      !isValidPincode(String(body.originPincode ?? '')) ||
      !isValidPincode(String(body.destinationPincode ?? ''))
    ) {
      return NextResponse.json(
        { error: 'Origin and destination must be valid 6-digit pincodes' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(body.weightGrams) || (body.weightGrams as number) <= 0) {
      return NextResponse.json(
        { error: 'Weight must be a positive number of grams' },
        { status: 400 }
      );
    }

    if (body.paymentMode !== 'Prepaid' && body.paymentMode !== 'COD') {
      return NextResponse.json(
        { error: 'paymentMode must be "Prepaid" or "COD"' },
        { status: 400 }
      );
    }

    // Rebuilt field by field rather than forwarded, so nothing unexpected in
    // the body reaches Delhivery.
    const input: CalculateRateInput = {
      originPincode: String(body.originPincode),
      destinationPincode: String(body.destinationPincode),
      weightGrams: body.weightGrams as number,
      paymentMode: body.paymentMode,
      codAmount: Number.isFinite(body.codAmount) ? body.codAmount : undefined,
      shippingMode: body.shippingMode === 'Express' ? 'Express' : 'Surface',
      dimensions: body.dimensions,
    };

    const client = getDelhiveryClient();
    const rate = await calculateShippingRate(client, input);

    return NextResponse.json(rate);
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
    }
    console.error('Shipping calculation error:', error);
    return NextResponse.json(
      { error: getUserFriendlyError(error) },
      { status: 500 }
    );
  }
}
