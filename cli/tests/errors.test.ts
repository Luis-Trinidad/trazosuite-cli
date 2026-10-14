/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ApiError } from "@trazo-suite/api-client";
import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";
import { EXIT_API_ERROR, EXIT_AUTH, EXIT_OK, EXIT_USAGE, UsageError, exitCodeFor } from "../src/errors.js";

describe("exitCodeFor", () => {
  it("mapea ApiError 401/403 a auth/permisos (3)", () => {
    expect(exitCodeFor(new ApiError(401, "no autenticado"))).toBe(EXIT_AUTH);
    expect(exitCodeFor(new ApiError(403, "no tienes permisos (tu usuario no tiene permisos para esta acción)"))).toBe(
      EXIT_AUTH
    );
  });

  it("mapea ApiError 5xx y demás estados HTTP a error de API (1)", () => {
    expect(exitCodeFor(new ApiError(500, "HTTP 500"))).toBe(EXIT_API_ERROR);
    expect(exitCodeFor(new ApiError(404, "no encontrado"))).toBe(EXIT_API_ERROR);
  });

  it("mapea UsageError a uso inválido (2)", () => {
    expect(exitCodeFor(new UsageError("extensión no soportada"))).toBe(EXIT_USAGE);
  });

  it("normaliza el uso inválido de commander (exit 1) a 2", () => {
    const error = new CommanderError(1, "commander.missingMandatoryOptionValue", "error");
    expect(exitCodeFor(error)).toBe(EXIT_USAGE);
  });

  it("conserva el exit 0 de commander para --help/--version", () => {
    const help = new CommanderError(0, "commander.helpDisplayed", "ayuda");
    const version = new CommanderError(0, "commander.version", "versión");
    expect(exitCodeFor(help)).toBe(EXIT_OK);
    expect(exitCodeFor(version)).toBe(EXIT_OK);
  });

  it("mapea errores de red y desconocidos a error de API (1)", () => {
    expect(exitCodeFor(new Error("No se pudo conectar con TrazoSuite."))).toBe(EXIT_API_ERROR);
    expect(exitCodeFor("boom")).toBe(EXIT_API_ERROR);
  });
});
