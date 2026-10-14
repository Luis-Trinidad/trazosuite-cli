/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ApiError } from "@trazo-suite/api-client";
import { CommanderError } from "commander";

/** Exit codes del CLI. */
export const EXIT_OK = 0;
/** Error de API o de red (incluye HTTP 5xx). */
export const EXIT_API_ERROR = 1;
/** Uso inválido del CLI (argumentos, flags o archivos locales). */
export const EXIT_USAGE = 2;
/** Auth o permisos insuficientes (HTTP 401/403). */
export const EXIT_AUTH = 3;

/**
 * Error de uso local del CLI: argumentos inválidos, archivos que no cumplen las
 * reglas de attach, etc. Se reporta con exit code 2.
 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * Mapea un error capturado al exit code del CLI:
 * 0 ok, 1 API/red, 2 uso inválido, 3 auth/permisos.
 */
export function exitCodeFor(error: unknown): number {
  if (error instanceof ApiError) {
    // El mensaje de ApiError ya trae la pista de permisos del backend (403).
    return error.status === 401 || error.status === 403 ? EXIT_AUTH : EXIT_API_ERROR;
  }
  if (error instanceof UsageError) return EXIT_USAGE;
  if (error instanceof CommanderError) {
    // Commander usa 0 para --help/--version y 1 para uso inválido; se normaliza a 2.
    return error.exitCode === EXIT_OK ? EXIT_OK : EXIT_USAGE;
  }
  // Errores de red y fallos inesperados del cliente (fetch fallido, token ausente…).
  return EXIT_API_ERROR;
}

/** Imprime `{ "error": mensaje }` en stderr y termina con el exit code correspondiente. */
export function fail(error: unknown): never {
  const code = exitCodeFor(error);
  if (code !== EXIT_OK) {
    // Con exit 0 (ayuda/versión) commander ya escribió la salida; no es un error.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  }
  process.exit(code);
}
