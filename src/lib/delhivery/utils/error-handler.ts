/**
 * Error handling utilities for Delhivery API
 */

import type { DelhiveryError } from '../types';

/**
 * Check if error is a Delhivery API error
 */
export function isDelhiveryError(error: unknown): error is DelhiveryError & Error {
  return error instanceof Error && 'code' in error;
}

/**
 * Extract error message from Delhivery API response
 */
export function extractErrorMessage(error: unknown): string {
  if (isDelhiveryError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'Error' in error) {
    return String(error.Error);
  }

  return 'An unknown error occurred';
}

/**
 * Create a user-friendly error message
 */
export function getUserFriendlyError(error: unknown): string {
  const message = extractErrorMessage(error);

  // Map common Delhivery errors to friendly messages
  const errorMap: Record<string, string> = {
    'Invalid pincode': 'The delivery pincode is invalid. Please check and try again.',
    'Pincode not serviceable':
      'Sorry, we do not deliver to this pincode at the moment.',
    'Invalid pickup location':
      'The pickup location is not recognized. Please contact support.',
    'Waybill not found': 'The tracking number was not found in our system.',
    'Unauthorized': 'Authentication failed. Please contact support.',
    'Rate limit exceeded': 'Too many requests. Please try again in a few minutes.',

    // Delhivery's own wording for a prepaid wallet below the minimum balance.
    'recharge your wallet':
      'The shipment could not be created because the Delhivery wallet balance is below the minimum required to manifest a package. Top it up and retry.',

    // Delhivery returns this generic text for several account-level problems.
    // An empty or under-funded prepaid wallet is by far the most common, and
    // the raw message gives no hint of that — so name it here rather than
    // leaving the next person to rediscover it.
    'ClientWarehouse matching query does not exist':
      'The pickup location does not match a warehouse registered with Delhivery. Check the name matches exactly, including case.',
    'An internal Error has occurred':
      'Delhivery rejected the shipment with a generic account-level error. Check the wallet balance first (a minimum balance is required to manifest), then whether the account is enabled for API manifestation.',
  };

  // Check if message contains any known error
  for (const [key, friendlyMessage] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return friendlyMessage;
    }
  }

  // Return original message if no mapping found
  return message;
}

/**
 * Log error with context
 */
export function logDelhiveryError(
  error: unknown,
  context: string,
  metadata?: Record<string, unknown>
): void {
  console.error(`[Delhivery Error] ${context}:`, {
    error: isDelhiveryError(error)
      ? {
          message: error.message,
          code: error.code,
          details: error.details,
        }
      : error,
    metadata,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!isDelhiveryError(error)) return false;

  const retryableCodes = [
    'NETWORK_ERROR',
    'TIMEOUT',
    '429', // Rate limit
    '500', // Internal server error
    '502', // Bad gateway
    '503', // Service unavailable
    '504', // Gateway timeout
  ];

  return retryableCodes.includes(error.code || '');
}

/**
 * Retry an async function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if not a retryable error
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase delay for next attempt
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      console.log(
        `[Delhivery] Retrying request (attempt ${attempt + 1}/${maxRetries})...`
      );
    }
  }

  throw lastError;
}

/**
 * Validate API response for success
 */
export function validateResponse(response: {
  success?: boolean;
  Error?: string;
  [key: string]: unknown;
}): void {
  if (response.Error) {
    throw new Error(response.Error);
  }

  if ('success' in response && !response.success) {
    throw new Error('API request failed');
  }
}

/**
 * Wrap async function with error handling and logging
 * Note: For simple wrapped exports, omit this and handle errors at call site
 */
export function withErrorHandling<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  context: string
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      logDelhiveryError(error, context, {
        args: args.map((arg) => {
          // Don't log sensitive data
          if (typeof arg === 'object' && arg !== null && 'apiToken' in arg) {
            return '[REDACTED]';
          }
          return arg;
        }),
      });
      throw error;
    }
  };
}
