/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES, assertAttachmentSize, mimeForExtension, toPriority } from "../src/commands/issue.js";
import { UsageError } from "../src/errors.js";

describe("mimeForExtension", () => {
  it("mapea las extensiones conocidas del mapa mínimo", () => {
    expect(mimeForExtension("captura.PNG")).toBe("image/png");
    expect(mimeForExtension("foto.jpg")).toBe("image/jpeg");
    expect(mimeForExtension("foto.jpeg")).toBe("image/jpeg");
    expect(mimeForExtension("anim.gif")).toBe("image/gif");
    expect(mimeForExtension("demo.webm")).toBe("video/webm");
    expect(mimeForExtension("icono.webp")).toBe("image/webp");
    expect(mimeForExtension("informe.pdf")).toBe("application/pdf");
    expect(mimeForExtension("notas.txt")).toBe("text/plain");
    expect(mimeForExtension("datos.csv")).toBe("text/csv");
    expect(mimeForExtension("payload.json")).toBe("application/json");
    expect(mimeForExtension("leeme.md")).toBe("text/markdown");
  });

  it("devuelve undefined para extensiones fuera del mapa o sin extensión", () => {
    expect(mimeForExtension("binario.exe")).toBeUndefined();
    expect(mimeForExtension("sinextension")).toBeUndefined();
  });
});

describe("assertAttachmentSize", () => {
  it("acepta archivos de hasta 5 MB", () => {
    expect(() => assertAttachmentSize(MAX_ATTACHMENT_BYTES, "ok.pdf")).not.toThrow();
  });

  it("rechaza con UsageError los archivos de más de 5 MB antes de leerlos", () => {
    expect(() => assertAttachmentSize(MAX_ATTACHMENT_BYTES + 1, "grande.pdf")).toThrow(UsageError);
    expect(() => assertAttachmentSize(MAX_ATTACHMENT_BYTES + 1, "grande.pdf")).toThrow(/supera el límite de 5 MB/);
  });
});

describe("toPriority", () => {
  it("acepta las prioridades del backend", () => {
    expect(toPriority("urgent")).toBe("urgent");
    expect(toPriority("high")).toBe("high");
    expect(toPriority("medium")).toBe("medium");
    expect(toPriority("low")).toBe("low");
    expect(toPriority("none")).toBe("none");
  });

  it("devuelve undefined sin prioridad y rechaza valores inválidos", () => {
    expect(toPriority(undefined)).toBeUndefined();
    expect(() => toPriority("critica")).toThrow(UsageError);
  });
});
