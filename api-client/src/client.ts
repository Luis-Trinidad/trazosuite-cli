/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Minimal REST client over the TrazoSuite app API.
 *
 * Authentication uses an API token sent as `X-Api-Key`. In the hosted SSE
 * servers every connection presents its own token (finance-scoped tokens from
 * profile → MCP Finanzas), so `apiTokenContext` carries the active session's
 * token and `getApiToken()` prefers it over the process-level
 * `TRAZO_API_TOKEN`. Every request is executed with the token owner's
 * permissions: the Django backend enforces the rules, so the AI can never
 * bypass them.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

const API_BASE_URL = (process.env.TRAZO_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/**
 * Per-session API token. finance-sse.ts wraps each POST /messages handling in
 * `apiTokenContext.run(sessionToken, …)` so all tool calls of a session hit
 * the backend with that session's token, never another tenant's.
 */
export const apiTokenContext = new AsyncLocalStorage<string>();

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getApiToken(): string {
  const sessionToken = apiTokenContext.getStore();
  if (sessionToken !== undefined && sessionToken !== "") return sessionToken;
  const token = process.env.TRAZO_API_TOKEN ?? "";
  if (token === "") {
    throw new Error("TRAZO_API_TOKEN is required: use your personal TrazoSuite API token.");
  }
  return token;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method: ApiMethod;
  path: string;
  body?: Record<string, unknown> | undefined;
  query?: Record<string, string | number | undefined> | undefined;
};

export async function apiRequest<T>(options: RequestOptions): Promise<T> {
  const { method, path, body, query } = options;
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  // Fuera del try: un token ausente es un error propio ("TRAZO_API_TOKEN is
  // required") y no debe disfrazarse de fallo de conexión.
  const token = getApiToken();

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: {
        "X-Api-Key": token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : null,
    });
  } catch (error) {
    throw new Error(`No se pudo conectar con TrazoSuite en ${API_BASE_URL}.`, { cause: error });
  }

  if (response.status === 204 || response.status === 202) {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown = null;
  if (text !== "") {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = extractErrorDetail(data) ?? `HTTP ${response.status}`;
    const hint = response.status === 403 ? " (tu usuario no tiene permisos para esta acción)" : "";
    throw new ApiError(response.status, `${detail}${hint}`);
  }

  return data as T;
}

function extractErrorDetail(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (typeof record.detail === "string") return record.detail;
  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const first = record.errors[0];
    if (first !== null && typeof first === "object") {
      const firstRecord = first as Record<string, unknown>;
      if (typeof firstRecord.message === "string") return firstRecord.message;
    }
  }
  return drfFieldErrorDetail(record);
}

/**
 * DRF renders field-level validation errors as `{field: [messages], ...}`;
 * those are not covered by error/detail/errors, so format the first field
 * errors into a readable line (e.g. "estimated_max: This field is required.").
 */
function drfFieldErrorDetail(record: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const [field, value] of Object.entries(record)) {
    if (typeof value === "string") {
      parts.push(`${field}: ${value}`);
      continue;
    }
    if (!Array.isArray(value)) continue;
    const messages = value.filter((message): message is string => typeof message === "string");
    if (messages.length === 0) continue;
    const label = field === "non_field_errors" ? "error" : field;
    parts.push(`${label}: ${messages.join("; ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
