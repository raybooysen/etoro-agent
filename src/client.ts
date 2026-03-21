import { RateLimiter } from "./utils/rate-limiter.js";
import { EtoroApiError } from "./types/errors.js";
import type { EtoroConfig } from "./types/config.js";

const BASE_URL = "https://public-api.etoro.com";
const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export class EtoroClient {
  private readonly config: EtoroConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly fetchFn: typeof fetch;

  constructor(
    config: EtoroConfig,
    options?: {
      rateLimiter?: RateLimiter;
      fetchFn?: typeof fetch;
    },
  ) {
    this.config = config;
    this.rateLimiter = options?.rateLimiter ?? new RateLimiter();
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
      "x-user-key": this.config.userKey,
      "x-request-id": crypto.randomUUID(),
    };
  }

  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
      timeout?: number;
    },
  ): Promise<T> {
    const rateLimitType = method === "GET" ? "GET" : "WRITE";
    await this.rateLimiter.acquire(rateLimitType);

    const url = new URL(path, BASE_URL);
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          options?.timeout ?? DEFAULT_TIMEOUT,
        );

        const response = await this.fetchFn(url.toString(), {
          method,
          headers: this.buildHeaders(),
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : RETRY_BASE_DELAY * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          const body = await response.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          const errorCode =
            typeof parsed === "object" &&
            parsed !== null &&
            "errorCode" in parsed
              ? String((parsed as Record<string, unknown>).errorCode)
              : undefined;
          const message =
            typeof parsed === "object" &&
            parsed !== null &&
            "message" in parsed
              ? String((parsed as Record<string, unknown>).message)
              : `HTTP ${response.status}: ${response.statusText}`;
          throw new EtoroApiError(message, response.status, parsed, errorCode);
        }

        const text = await response.text();
        if (!text) return undefined as T;
        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof EtoroApiError && error.statusCode !== 429) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === MAX_RETRIES) break;
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body });
  }
}
