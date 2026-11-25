/**
 * Delhivery API Client
 *
 * Core client for interacting with Delhivery's shipping API.
 * Handles authentication, base URL selection, and common request patterns.
 */

import type {
  DelhiveryConfig,
  DelhiveryEnvironment,
  DelhiveryError,
} from './types';

const BASE_URLS: Record<DelhiveryEnvironment, string> = {
  staging: 'https://staging-express.delhivery.com',
  production: 'https://track.delhivery.com',
};

export class DelhiveryClient {
  private readonly config: Required<DelhiveryConfig>;
  private readonly baseUrl: string;

  constructor(config: DelhiveryConfig) {
    if (!config.apiToken) {
      throw new Error('Delhivery API token is required');
    }

    this.config = {
      apiToken: config.apiToken,
      environment: config.environment || 'staging',
      clientName: config.clientName || '',
      defaultPickupLocation: config.defaultPickupLocation || '',
      webhookSecret: config.webhookSecret || '',
    };

    this.baseUrl = BASE_URLS[this.config.environment];
  }

  /**
   * Build a request URL with the auth token as a query parameter.
   *
   * Delhivery's documented auth mechanism is the `Authorization` header (see
   * authHeaders below). A few of their older endpoints also read `?token=`, so
   * we send both. When the header is honoured the query param is ignored.
   */
  private buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean>
  ): URL {
    const url = new URL(endpoint, this.baseUrl);
    url.searchParams.set('token', this.config.apiToken);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    return url;
  }

  /**
   * Auth headers for every request, in both environments.
   *
   * Delhivery authenticates on the `Authorization: Token <token>` header. This
   * is the same for staging and production — only the host and the token value
   * differ between them. Omitting this header is what produces their
   * "Authentication credentials were not provided." response.
   */
  private authHeaders(extra: Record<string, string>): Record<string, string> {
    return {
      ...extra,
      Accept: 'application/json',
      Authorization: `Token ${this.config.apiToken}`,
    };
  }

  /**
   * Make a GET request to Delhivery API
   */
  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw this.createError(
          `Delhivery API error: ${response.status}`,
          response.status.toString(),
          data
        );
      }

      // Check for API-level errors in response
      if (data.Error) {
        throw this.createError(data.Error, 'API_ERROR', data);
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error; // Already a DelhiveryError
      }
      throw this.createError(
        error instanceof Error ? error.message : 'Unknown error',
        'NETWORK_ERROR',
        error
      );
    }
  }

  /**
   * Make a POST request to Delhivery API
   */
  async post<T>(
    endpoint: string,
    body: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw this.createError(
          `Delhivery API error: ${response.status}`,
          response.status.toString(),
          data
        );
      }

      // Check for API-level errors in response
      if (data.Error) {
        throw this.createError(data.Error, 'API_ERROR', data);
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error; // Already a DelhiveryError
      }
      throw this.createError(
        error instanceof Error ? error.message : 'Unknown error',
        'NETWORK_ERROR',
        error
      );
    }
  }

  /**
   * Make a POST request with form-urlencoded body (used by some Delhivery endpoints)
   */
  async postForm<T>(
    endpoint: string,
    body: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params);

    // Delhivery order creation expects format=json&data={...}
    const formData = new URLSearchParams();
    formData.set('format', 'json');
    formData.set('data', JSON.stringify(body));

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: this.authHeaders({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: formData.toString(),
      });

      // Read as text first. Delhivery answers auth failures with an HTML login
      // page, which would otherwise surface as an opaque JSON parse error.
      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw this.createError(
          `Delhivery returned a non-JSON response (HTTP ${response.status}): ${responseText
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200)}`,
          'PARSE_ERROR',
          { status: response.status }
        );
      }

      if (!response.ok) {
        throw this.createError(
          `Delhivery API error: ${response.status}`,
          response.status.toString(),
          data
        );
      }

      // Check for API-level errors in response
      if (data.Error) {
        throw this.createError(data.Error, 'API_ERROR', data);
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error; // Already a DelhiveryError
      }
      throw this.createError(
        error instanceof Error ? error.message : 'Unknown error',
        'NETWORK_ERROR',
        error
      );
    }
  }

  /**
   * Create a standardized error object
   */
  private createError(
    message: string,
    code: string,
    details?: unknown
  ): DelhiveryError & Error {
    const error = new Error(message) as DelhiveryError & Error;
    error.code = code;
    error.details = details;
    return error;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<Required<DelhiveryConfig>> {
    return this.config;
  }

  /**
   * Get base URL for current environment
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

/**
 * Create a Delhivery client from environment variables
 */
export function createDelhiveryClient(): DelhiveryClient {
  const apiToken = process.env.DELHIVERY_API_TOKEN;
  const environment = process.env.DELHIVERY_ENVIRONMENT as
    | DelhiveryEnvironment
    | undefined;
  const clientName = process.env.DELHIVERY_CLIENT_NAME;
  const defaultPickupLocation = process.env.DELHIVERY_DEFAULT_PICKUP_LOCATION;
  const webhookSecret = process.env.DELHIVERY_WEBHOOK_SECRET;

  if (!apiToken) {
    throw new Error(
      'DELHIVERY_API_TOKEN environment variable is required. Add it to .env.local'
    );
  }

  return new DelhiveryClient({
    apiToken,
    environment: environment === 'production' ? 'production' : 'staging',
    clientName,
    defaultPickupLocation,
    webhookSecret,
  });
}

/**
 * Singleton instance for server-side use
 */
let clientInstance: DelhiveryClient | null = null;

export function getDelhiveryClient(): DelhiveryClient {
  if (!clientInstance) {
    clientInstance = createDelhiveryClient();
  }
  return clientInstance;
}
