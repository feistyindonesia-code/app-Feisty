// Shared utilities for Edge Functions

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface WebhookPayload {
  signature: string;
  timestamp: number;
  data: any;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public code: string = "VALIDATION_ERROR"
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AuthError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export function validateRequiredFields(
  data: Record<string, any>,
  fields: string[]
): void {
  const missing = fields.filter((f) => !data[f]);
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(", ")}`,
      "MISSING_FIELDS"
    );
  }
}

export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = globalThis.crypto;
  // Use HMAC-SHA256 for signature validation
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  // This is a placeholder - actual implementation depends on your webhook provider
  return signature.length > 0; // Replace with actual signature validation
}

export function createErrorResponse(
  message: string,
  code: string = "ERROR"
): ApiResponse {
  return {
    success: false,
    error: message,
    code,
  };
}

export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

export async function logToServer(
  supabaseUrl: string,
  supabaseKey: string,
  logData: any
): Promise<void> {
  try {
    const { data, error } = await fetch(
      `${supabaseUrl}/rest/v1/audit_logs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          entity_type: "edge_function",
          action: "execute",
          changes: logData,
        }),
      }
    ).then((r) => r.json());
  } catch (err) {
    console.error("Logging error:", err);
  }
}
