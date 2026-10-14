/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { uploadWorkItemAttachmentBytes } from "@trazo-suite/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ASSET_ID = "asset-123";
const PRESIGNED_URL = "https://storage.test/bucket/adjuntos/notas.txt";

/** Respuesta HTTP 200 con cuerpo JSON, como la que espera apiRequest. */
function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubEnv("TRAZO_API_TOKEN", "token-de-test");
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    // 1) POST presign: registra el adjunto y devuelve url+fields y asset_id.
    if (method === "POST" && url.endsWith("/attachments/")) {
      return jsonResponse({
        asset_id: ASSET_ID,
        attachment: { id: ASSET_ID, attributes: { name: "notas.txt" } },
        upload_data: {
          url: PRESIGNED_URL,
          fields: { key: "adjuntos/notas.txt", policy: "politica-firma", "x-amz-meta-owner": "acme" },
        },
      });
    }
    // 2) Subida al presigned POST (S3): 204 sin cuerpo.
    if (url === PRESIGNED_URL) return new Response(null, { status: 204 });
    // 3) PATCH de confirmación: marca el adjunto como subido.
    if (method === "PATCH" && url.endsWith(`/attachments/${ASSET_ID}/`)) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`fetch inesperado: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("uploadWorkItemAttachmentBytes (flujo de adjuntos con fetch simulado)", () => {
  it("ejecuta la secuencia completa presign -> subida al presigned POST -> PATCH de confirmación", async () => {
    const bytes = Buffer.from("hola", "utf8");
    const result = await uploadWorkItemAttachmentBytes("acme", "proj-1", "42", {
      name: "notas.txt",
      mime_type: "text/plain",
      bytes,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [presignCall, uploadCall, confirmCall] = fetchMock.mock.calls;

    // 1) Registro del adjunto: POST JSON con metadatos y token de API.
    const presignInit = presignCall?.[1] ?? {};
    expect(String(presignCall?.[0])).toMatch(
      /\/api\/assets\/v2\/workspaces\/acme\/projects\/proj-1\/issues\/42\/attachments\/$/
    );
    expect(presignInit.method).toBe("POST");
    expect((presignInit.headers as Record<string, string>)["X-Api-Key"]).toBe("token-de-test");
    expect((presignInit.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(presignInit.body))).toEqual({ name: "notas.txt", type: "text/plain", size: 4 });

    // 2) Subida de bytes: multipart/form-data con los campos firmados + el archivo.
    expect(String(uploadCall?.[0])).toBe(PRESIGNED_URL);
    const uploadInit = uploadCall?.[1] ?? {};
    const contentType = (uploadInit.headers as Record<string, string>)["Content-Type"] ?? "";
    expect(contentType).toContain("multipart/form-data; boundary=");
    const multipart = (uploadInit.body as Buffer).toString("latin1");
    expect(multipart).toContain('name="key"\r\n\r\nadjuntos/notas.txt\r\n');
    expect(multipart).toContain('name="policy"\r\n\r\npolitica-firma\r\n');
    expect(multipart).toContain('name="x-amz-meta-owner"\r\n\r\nacme\r\n');
    expect(multipart).toContain('name="file"; filename="notas.txt"');
    expect(multipart).toContain("Content-Type: text/plain");
    expect(multipart).toContain("hola");

    // 3) Confirmación: PATCH vacío sobre el asset devuelto por el presign.
    expect(String(confirmCall?.[0])).toMatch(new RegExp(`/attachments/${ASSET_ID}/$`));
    expect(confirmCall?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(confirmCall?.[1]?.body))).toEqual({});

    expect(result).toEqual({
      asset_id: ASSET_ID,
      attachment: { id: ASSET_ID, attributes: { name: "notas.txt" } },
      status: "uploaded",
    });
  });

  it("rechaza los archivos de más de 5 MB con mensaje claro, antes de tocar la red", async () => {
    const grande = Buffer.alloc(5_242_880 + 1, 0x61);

    await expect(
      uploadWorkItemAttachmentBytes("acme", "proj-1", "42", {
        name: "grande.pdf",
        mime_type: "application/pdf",
        bytes: grande,
      })
    ).rejects.toThrow(/supera el límite de 5 MB/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
