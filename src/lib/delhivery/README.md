# Delhivery Shipping Integration

Complete shipping integration with Delhivery's API for order fulfillment, tracking, and returns management.

## Phase 1 Complete: Core Infrastructure ✅

### What's Been Built

1. **Database Schema** (`supabase/migrations/00000000000008_shipping.sql`)
   - `pickup_locations`: Warehouse management
   - `shipping_info`: Shipment tracking records
   - `shipping_scans`: Detailed tracking history
   - `returns`: Return request lifecycle
   - Database functions for shipment operations

2. **TypeScript Types** (`types.ts`)
   - Complete type definitions for all Delhivery API endpoints
   - Database model interfaces
   - Helper types for data transformation

3. **API Client** (`client.ts`)
   - `DelhiveryClient` class with GET/POST methods
   - Environment-based URL selection (staging/production)
   - Token-based authentication
   - Singleton instance for server-side use

4. **Utility Functions**
   - `validator.ts`: Input validation (pincode, phone, GST, HSN)
   - `transformer.ts`: Data transformation between app and Delhivery formats
   - `error-handler.ts`: Error handling, retry logic, user-friendly messages

5. **Configuration**
   - Environment variables added to `.env.example` and `.env.local`
   - Staging/production environment support

## File Structure

```
src/lib/delhivery/
├── README.md              # This file
├── index.ts              # Main exports
├── types.ts              # TypeScript interfaces
├── client.ts             # API client
└── utils/
    ├── index.ts          # Utility exports
    ├── validator.ts      # Input validation
    ├── transformer.ts    # Data transformation
    └── error-handler.ts  # Error handling
```

## Setup

### 1. Run Database Migration

```bash
# Apply the shipping tables migration
# Run this against your Supabase project
```

Apply `supabase/migrations/00000000000008_shipping.sql` to your Supabase database.

### 2. Configure Environment Variables

Add to your `.env.local`:

```env
DELHIVERY_API_TOKEN=your_token_here
DELHIVERY_ENVIRONMENT=staging  # or 'production'
DELHIVERY_CLIENT_NAME=Your Company Name
DELHIVERY_DEFAULT_PICKUP_LOCATION=Your Warehouse
DELHIVERY_WEBHOOK_SECRET=generate_a_random_secret
```

To get your Delhivery API token:
1. Log in to Delhivery Dashboard
2. Go to Settings → API Setup → API Token
3. Copy your token

### 3. Test the Client

```typescript
import { getDelhiveryClient } from '@/lib/delhivery';

// Get singleton client instance
const client = getDelhiveryClient();

// Client automatically reads from environment variables
console.log(client.getBaseUrl());
```

## Usage Examples

### Validate Input

```typescript
import { isValidPincode, isValidPhone, isValidGstNumber } from '@/lib/delhivery';

if (!isValidPincode('400001')) {
  console.error('Invalid pincode');
}

if (!isValidPhone('9876543210')) {
  console.error('Invalid phone number');
}
```

### Transform Data

```typescript
import { transformToDeliveryShipment, createOrderPayload } from '@/lib/delhivery';

const shipmentInput = {
  orderId: 'ORD-001',
  customerName: 'John Doe',
  customerAddress: '123 Main St, Apartment 4B',
  customerCity: 'Mumbai',
  customerState: 'Maharashtra',
  customerPincode: '400001',
  customerPhone: '9876543210',
  orderNumber: 'ORD-001',
  paymentMode: 'Prepaid' as const,
  totalAmount: 1999,
  productDescription: 'Premium Cotton T-Shirt',
  hsnCode: '610910',
  quantity: 1,
  weightGrams: 250,
  pickupLocation: 'Mumbai Warehouse',
  sellerGstTin: '27AABCU9603R1ZM',
};

const payload = createOrderPayload(shipmentInput, 'Mumbai Warehouse');
// payload is ready to send to Delhivery API
```

### Error Handling

```typescript
import {
  isDelhiveryError,
  getUserFriendlyError,
  retryWithBackoff,
} from '@/lib/delhivery';

try {
  const result = await retryWithBackoff(
    () => someApiCall(),
    { maxRetries: 3 }
  );
} catch (error) {
  if (isDelhiveryError(error)) {
    console.error('Delhivery error:', error.code, error.message);
  }
  
  // Show user-friendly message
  const friendlyMessage = getUserFriendlyError(error);
  showErrorToUser(friendlyMessage);
}
```

## Next Steps: Phase 2 - API Endpoints

The next phase will implement:

1. **Pincode Serviceability** (`endpoints/serviceability.ts`)
   - Check if delivery is available to a pincode
   - Determine COD availability

2. **Shipping Rate Calculation** (`endpoints/pricing.ts`)
   - Calculate shipping costs
   - Get delivery estimates

3. **Order Creation** (`endpoints/order.ts`)
   - Create shipments
   - Generate waybills
   - Schedule pickups

4. **Tracking** (`endpoints/tracking.ts`)
   - Get shipment status
   - Fetch tracking history

5. **Webhook Handler** (`webhook/handler.ts`)
   - Process Delhivery status updates
   - Update database
   - Trigger notifications

6. **API Routes**
   - `/api/shipping/create`
   - `/api/shipping/track`
   - `/api/shipping/calculate`
   - `/api/shipping/serviceability`
   - `/api/webhooks/delhivery`

## Database Schema

### Tables Created

1. **pickup_locations**: Warehouse locations registered with Delhivery
2. **shipping_info**: One row per shipment (forward or reverse)
3. **shipping_scans**: Tracking event history
4. **returns**: Return request lifecycle

### Functions Created

1. **create_shipment()**: Insert new shipment and link to order
2. **update_shipment_status()**: Update status from webhook
3. **add_shipping_scan()**: Record tracking scan event

All functions are security definer and only accessible to service_role.

## Testing

### Staging Environment

Always test with `DELHIVERY_ENVIRONMENT=staging` first:

- Staging URL: `https://staging-express.delhivery.com`
- Production URL: `https://track.delhivery.com`

Delhivery provides a staging environment for testing without affecting live shipments.

### Test Pincodes

Common test pincodes for staging:
- `110001` - Delhi (serviceable)
- `400001` - Mumbai (serviceable)
- `560001` - Bangalore (serviceable)

Check Delhivery documentation for complete test data.

## Security

⚠️ **Important Security Notes:**

1. **API Token**: Never commit `DELHIVERY_API_TOKEN` to version control
2. **Server-Only**: Never prefix Delhivery credentials with `NEXT_PUBLIC_`
3. **Webhook Secret**: Generate a strong secret for webhook validation
4. **Input Validation**: Always validate and sanitize user input before API calls

## Resources

- [Delhivery API Documentation](https://help.delhivery.com/docs/client-developer-portal-1)
- [Order Creation API](https://delhivery-express-api-doc.readme.io/reference/order-creation-api)
- [Tracking API](https://delhivery-express-api-doc.readme.io/reference/tracking-api)
- [API Token Generation](https://help.delhivery.com/docs/api-token-generation)

## Support

For issues with:
- **This integration**: Check error logs and validate configuration
- **Delhivery API**: Contact Delhivery support with API errors
- **Database**: Verify migrations ran successfully

---

**Status**: Phase 1 Complete - Core infrastructure ready for endpoint implementation
