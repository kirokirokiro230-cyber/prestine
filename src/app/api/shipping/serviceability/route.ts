/**
 * Check Pincode Serviceability
 * GET /api/shipping/serviceability?pincode=110001
 *
 * Deliberately open: a shopper asking whether we deliver to them has no session,
 * and the answer discloses nothing about any person or order. The format check is
 * what keeps it from being used as an arbitrary proxy onto the Delhivery account.
 *
 * The storefront's own pincode box does not use this — it goes through
 * `src/server/delhivery.ts`, which fails open so a courier outage never tells a
 * shopper we do not deliver to them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDelhiveryClient, getServiceabilityInfo } from '@/lib/delhivery';
import { getUserFriendlyError, isValidPincode } from '@/lib/delhivery/utils';
import { LIMITS, consumeIpRateLimit, rateLimitMessage } from '@/server/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const pincode = request.nextUrl.searchParams.get('pincode');

    if (!pincode || !isValidPincode(pincode)) {
      return NextResponse.json(
        { error: 'A valid 6-digit pincode is required' },
        { status: 400 }
      );
    }

    // Being open, this is the easiest route to our Delhivery quota. Bounded per
    // caller, counted after the format check so typos are free.
    const limited = await consumeIpRateLimit('pincode', LIMITS.pincodeLookup);
    if (limited) {
      return NextResponse.json(
        { error: rateLimitMessage(limited) },
        { status: 429, headers: { 'Retry-After': String(limited.secondsRemaining) } }
      );
    }

    const client = getDelhiveryClient();
    const info = await getServiceabilityInfo(client, pincode);

    return NextResponse.json(info);
  } catch (error) {
    console.error('Serviceability check error:', error);
    return NextResponse.json(
      { error: getUserFriendlyError(error) },
      { status: 500 }
    );
  }
}
