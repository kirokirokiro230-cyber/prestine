/**
 * Delhivery Webhook Handler
 *
 * Process incoming webhook notifications from Delhivery for shipment status updates.
 */

import crypto from 'node:crypto';

import type { DelhiveryWebhookPayload } from '../types';
import { parseDelhiveryDateTime } from '../utils/transformer';

export interface ProcessedWebhookData {
  waybill: string;
  status: string;
  statusCode: string;
  scanDatetime: string | null;
  location: string;
  instructions: string;
  orderId?: string;
  rawPayload: unknown;
}

/**
 * Validate webhook payload structure
 */
export function validateWebhookPayload(
  payload: unknown
): payload is DelhiveryWebhookPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as Record<string, unknown>;
  
  return (
    typeof p.waybill === 'string' &&
    typeof p.status === 'string' &&
    typeof p.status_code === 'string'
  );
}


/**
 * Process webhook payload
 */
export function processWebhookPayload(
  payload: DelhiveryWebhookPayload
): ProcessedWebhookData {
  return {
    waybill: payload.waybill,
    status: payload.status,
    statusCode: payload.status_code,
    scanDatetime: parseDelhiveryDateTime(payload.scan_datetime),
    location: payload.scanned_location || '',
    instructions: payload.instructions || '',
    orderId: payload.order_id,
    rawPayload: payload,
  };
}

/**
 * Verify webhook authenticity (signature validation)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Fails closed. Returning true here on a missing secret would make the
  // endpoint accept anything, and this route writes to the database with the
  // Supabase service role.
  if (!secret || !signature) return false;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const received = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    // timingSafeEqual throws on length mismatch, so compare lengths first.
    if (received.length !== expected.length) return false;

    return crypto.timingSafeEqual(received, expected);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}

/**
 * Determine if webhook should trigger customer notification
 */
export function shouldNotifyCustomer(statusCode: string): boolean {
  const notificationCodes = [
    'X-DDD3FD', // Out for delivery
    'EOD-38',   // Delivered
    'X-UCI',    // Manifested
  ];
  
  return notificationCodes.some(code => 
    statusCode.toLowerCase().includes(code.toLowerCase())
  );
}


/**
 * Determine webhook event type
 */
export type WebhookEventType = 
  | 'manifested'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'rto'
  | 'unknown';

export function getWebhookEventType(statusCode: string): WebhookEventType {
  const code = statusCode.toLowerCase();
  
  if (code.includes('uci') || code.includes('manifest')) {
    return 'manifested';
  }
  if (code.includes('pickup') || code.includes('pur')) {
    return 'picked_up';
  }
  if (code.includes('ibd') || code.includes('transit')) {
    return 'in_transit';
  }
  if (code.includes('ddd') || code.includes('out for delivery')) {
    return 'out_for_delivery';
  }
  if (code.includes('eod') || code.includes('delivered')) {
    return 'delivered';
  }
  if (code.includes('ndr') || code.includes('failed')) {
    return 'failed';
  }
  if (code.includes('rto')) {
    return 'rto';
  }
  
  return 'unknown';
}

/**
 * Handle webhook with full processing pipeline
 */
export async function handleWebhook(
  rawPayload: string,
  signature: string | null,
  webhookSecret: string | undefined,
  onProcess: (data: ProcessedWebhookData) => Promise<void>
): Promise<{ success: boolean; message: string; unauthorized?: boolean }> {
  try {
    /*
     * Always verify. An earlier version only checked the signature when both the
     * header and the secret were present, which meant a caller could skip
     * verification entirely by omitting the header — on an endpoint that updates
     * shipment status through the service-role client.
     */
    if (!verifyWebhookSignature(rawPayload, signature ?? '', webhookSecret ?? '')) {
      return {
        success: false,
        message: 'Invalid webhook signature',
        unauthorized: true,
      };
    }

    // Parse payload
    const payload = JSON.parse(rawPayload);

    // Validate structure
    if (!validateWebhookPayload(payload)) {
      return {
        success: false,
        message: 'Invalid webhook payload structure',
      };
    }

    // Process data
    const processedData = processWebhookPayload(payload);

    // Execute callback
    await onProcess(processedData);

    return {
      success: true,
      message: 'Webhook processed successfully',
    };
  } catch (error) {
    console.error('Webhook processing error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
