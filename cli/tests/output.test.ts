/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asRecord, emit, emitText, field, recordToLines, textRequested } from "../src/output.js";

function captureStdout(): string[] {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  });
  return chunks;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("emit", () => {
  it("escribe JSON pretty en stdout", () => {
    const chunks = captureStdout();
    emit({ id: "abc", nested: { ok: true } });
    expect(chunks.join("")).toBe(
      `{
  "id": "abc",
  "nested": {
    "ok": true
  }
}
`
    );
  });
});

describe("emitText", () => {
  it("escribe líneas simples en stdout", () => {
    const chunks = captureStdout();
    emitText(["a\tb", "c"]);
    expect(chunks.join("")).toBe("a\tb\nc\n");
  });

  it("escribe la cadena vacía para listas sin elementos", () => {
    const chunks = captureStdout();
    emitText([]);
    expect(chunks.join("")).toBe("");
  });
});

describe("recordToLines", () => {
  it("vuelca escalares y serializa objetos/anidados", () => {
    expect(recordToLines({ id: "1", ok: true, tags: ["a", "b"], extra: null })).toEqual([
      "id: 1",
      "ok: true",
      'tags: ["a","b"]',
      "extra: ",
    ]);
  });
});

describe("asRecord / field", () => {
  it("field devuelve cadena vacía para null y undefined", () => {
    const record = asRecord({ a: null });
    expect(field(record, "a")).toBe("");
    expect(field(record, "missing")).toBe("");
    expect(field(asRecord({ a: 7 }), "a")).toBe("7");
  });

  it("asRecord devuelve objeto vacío para no objetos", () => {
    expect(asRecord("texto")).toEqual({});
    expect(asRecord(null)).toEqual({});
  });
});

describe("textRequested", () => {
  function programWithArgs(args: string[]): Command {
    const program = new Command();
    program.name("trazosuite").option("--text", "salida legible").exitOverride();
    program.parse(args, { from: "user" });
    return program;
  }

  it("es false por defecto (salida JSON)", () => {
    expect(textRequested(programWithArgs([]))).toBe(false);
  });

  it("es true cuando se pasa --text", () => {
    expect(textRequested(programWithArgs(["--text"]))).toBe(true);
  });
});
