/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as apiClient from "@trazo-suite/api-client";
import type { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/cli.js";
import { UsageError } from "../src/errors.js";

// Solo se sustituyen las funciones cuyas llamadas quiere observarse; el resto
// del cliente (p. ej. ApiError) queda real. No hay red: los mocks no tocan fetch.
vi.mock("@trazo-suite/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trazo-suite/api-client")>();
  return {
    ...actual,
    listWorkItems: vi.fn(),
    createExpenseEntry: vi.fn(),
  };
});

// UUID de proyecto para los tests de parseo: al ser un uuid, resolveProjectId
// es un passthrough y no dispara la llamada de resolución a listProjects.
const PROJ_UUID = "0b7f8c1e-1c1d-4b8e-9a7f-2c3d4e5f6a7b";

/** Parsea argv en memoria (sin proceso ni red) sobre un programa recién construido. */
function parse(args: string[]): Promise<Command> {
  return buildProgram().parseAsync(args, { from: "user" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.listWorkItems).mockResolvedValue([]);
  vi.mocked(apiClient.createExpenseEntry).mockResolvedValue({ id: "gasto-1" });
});

describe("issue list (parseo de argumentos)", () => {
  it("arma los filtros correctos a partir de las flags", async () => {
    await parse([
      "issue",
      "list",
      "acme",
      PROJ_UUID,
      "--state",
      "st-1",
      "--priority",
      "high",
      "--label",
      "l-1",
      "--label",
      "l-2",
      "--assignee",
      "u-1",
      "--cycle",
      "c-1",
      "--module",
      "m-1",
    ]);

    expect(apiClient.listWorkItems).toHaveBeenCalledTimes(1);
    const call = vi.mocked(apiClient.listWorkItems).mock.calls[0];
    expect(call?.[0]).toBe("acme");
    expect(call?.[1]).toBe(PROJ_UUID);
    expect(call?.[2]).toEqual({
      state_id: "st-1",
      priority: "high",
      label_ids: ["l-1", "l-2"],
      assignee_ids: ["u-1"],
      cycle_id: "c-1",
      module_id: "m-1",
    });
  });

  it("sin flags no filtra por estado/prioridad/ciclo/módulo y envía listas vacías", async () => {
    await parse(["issue", "list", "acme", PROJ_UUID]);

    expect(apiClient.listWorkItems).toHaveBeenCalledTimes(1);
    const filters = vi.mocked(apiClient.listWorkItems).mock.calls[0]?.[2];
    expect(filters?.state_id).toBeUndefined();
    expect(filters?.priority).toBeUndefined();
    expect(filters?.cycle_id).toBeUndefined();
    expect(filters?.module_id).toBeUndefined();
    expect(filters?.label_ids).toEqual([]);
    expect(filters?.assignee_ids).toEqual([]);
  });
});

describe("finance expense create (parseo de argumentos)", () => {
  const baseArgs = [
    "finance",
    "expense",
    "create",
    "acme",
    "--amount",
    "149.99",
    "--category",
    "cat-1",
    "--date",
    "2026-10-11",
  ];

  it("rechaza --project y --client juntos con error de uso, sin llamar a la API", async () => {
    await expect(parse([...baseArgs, "--project", "proj-1", "--client", "cli-1"])).rejects.toThrow(UsageError);
    await expect(parse([...baseArgs, "--project", "proj-1", "--client", "cli-1"])).rejects.toThrow(/no ambos/);
    expect(apiClient.createExpenseEntry).not.toHaveBeenCalled();
  });

  it("con solo --project construye el input con el origen de gasto correcto", async () => {
    await parse([...baseArgs, "--project", "proj-1", "--description", "servidor", "--currency", "MXN"]);

    expect(apiClient.createExpenseEntry).toHaveBeenCalledTimes(1);
    const call = vi.mocked(apiClient.createExpenseEntry).mock.calls[0];
    expect(call?.[0]).toBe("acme");
    const input = call?.[1];
    expect(input?.amount).toBe("149.99");
    expect(input?.category_id).toBe("cat-1");
    expect(input?.date).toBe("2026-10-11");
    expect(input?.description).toBe("servidor");
    expect(input?.currency).toBe("MXN");
    expect(input?.project_id).toBe("proj-1");
    expect(input?.client_id).toBeUndefined();
    expect(input?.employee_ids).toBeUndefined();
  });
});

describe("programa (parseo en memoria)", () => {
  it("convierte --help en CommanderError con exit code 0 gracias a exitOverride", async () => {
    await expect(parse(["--help"])).rejects.toMatchObject({ exitCode: 0 });
  });

  it("rechaza argumentos requeridos ausentes con CommanderError de uso inválido", async () => {
    await expect(parse(["issue", "list", "solo-workspace"])).rejects.toMatchObject({ exitCode: 1 });
  });
});
