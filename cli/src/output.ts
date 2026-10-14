/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Command } from "commander";

/** Indica si el usuario pidió el modo legible para humanos con la flag global --text. */
export function textRequested(program: Command): boolean {
  const options: Record<string, unknown> = program.optsWithGlobals();
  return options.text === true;
}

/** Escribe los datos como JSON pretty en stdout (modo por defecto). */
export function emit(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/** Escribe líneas de texto simple en stdout (modo --text, sin librería de tablas). */
export function emitText(lines: string[]): void {
  for (const line of lines) process.stdout.write(`${line}\n`);
}

/** Devuelve el valor como objeto si lo es; si no, un objeto vacío. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Campo escalar de un registro como string; null/undefined se vuelven cadena vacía. */
export function field(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return value === null || value === undefined ? "" : String(value);
}

/** Vuelca un registro a líneas `clave: valor` (modo --text para un único objeto). */
export function recordToLines(record: Record<string, unknown>): string[] {
  return Object.entries(record).map(([key, value]) => `${key}: ${valueToText(value)}`);
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
