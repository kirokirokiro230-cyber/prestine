/**
 * Delhivery Webhook Endpoint
 *
 * Receives status updates from Delhivery and updates database.
 * POST /api/webhooks/delhivery
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleWebhook, type ProcessedWebhookData } from '@/lib/delhivery/webhook';
import { callRpc, db } from '@/server/supabase';

/**
 * Process webhook data and update database
 *
 * Goes through the shared lazy client in `src/server/supabase.ts` rather than
 * constructing its own. The previous version built one at module scope with
 * `process.env.SUPABASE_URL!`, which turned a missing variable into a throw the
 * moment anything *imported* this route rather than a clear failure when it was
 * called — the same trap documented at length on the lazy client in
 * `src/server/repositories/shipping.ts`. `callRpc` also type-checks these two
 * argument lists against `database.types.ts`, which a bare `.rpc()` string call
 * did not, and it is what `src/server/tracking-sync.ts` already uses for the
 * very same pair of functions.
 */
async function processWebhookData(data: ProcessedWebhookData): Promise<void> {
  const {
    waybill,
    status,
    statusCode,
    scanDatetime,
    location,
    instructions,
  } = data;

  // Update shipment status
  const { error: updateError } = await callRpc(db(), 'update_shipment_status', {
    p_waybill: waybill,
    p_status: status,
    p_status_code: statusCode,
    p_location: location,
    p_picked_up_at: status.toLowerCase().includes('picked') ? scanDatetime : null,
    p_delivered_at: status.toLowerCase().includes('delivered') ? scanDatetime : null,
  });

  if (updateError) {
    console.error('Failed to update shipment status:', updateError);
    throw new Error(updateError.message);
  }

  // Add scan entry
  if (scanDatetime) {
    const { error: scanError } = await callRpc(db(), 'add_shipping_scan', {
      p_waybill: waybill,
      p_scan_datetime: scanDatetime,
      p_scan_type: 'UD',
      p_scan_status: status,
      p_status_code: statusCode,
      p_location: location,
      p_instructions: instructions,
      p_raw_data: data.rawPayload,
    });

    if (scanError) {
      console.error('Failed to add shipping scan:', scanError);
      // Don't throw - scan is secondary
    }
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.DELHIVERY_WEBHOOK_SECRET?.trim();

  /*
   * No secret, no endpoint — the same fail-closed shape as the Cashfree webhook.
   * 503 because the fault is configuration, not the caller. This route writes
   * shipment status with the Supabase service role, so it must never run
   * unauthenticated.
   */
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Delhivery webhooks are not configured, so this endpoint is disabled.' },
      { status: 503 },
    );
  }

  try {
    // Raw text before anything parses it — the signature covers these exact bytes.
    const rawBody = await request.text();
    const signature = request.headers.get('x-delhivery-signature');

    const result = await handleWebhook(
      rawBody,
      signature,
      webhookSecret,
      processWebhookData
    );

    if (!result.success) {
      if (result.unauthorized) {
        console.error('[delhivery] webhook signature did not match; rejecting.');
        return NextResponse.json({ error: result.message }, { status: 401 });
      }
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
