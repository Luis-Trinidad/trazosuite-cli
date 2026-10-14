/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createCycle, listCycles } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";
import { resolveProjectId } from "../resolve.js";

export function registerCycleCommands(program: Command): void {
  const cycle = program.command("cycle").description("Ciclos de un proyecto.");

  cycle
    .command("list")
    .description("Lista los ciclos de un proyecto.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .action(async (workspaceSlug: string, projectId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const rows = await listCycles(workspaceSlug, projectId);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "name")}\t${field(record, "status")}\t${field(record, "start_date")} → ${field(record, "end_date")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  cycle
    .command("create")
    .description("Crea un ciclo (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .requiredOption("--name <nombre>", "nombre del ciclo")
    .option("--start-date <fecha>", "fecha de inicio (YYYY-MM-DD)")
    .option("--end-date <fecha>", "fecha de fin (YYYY-MM-DD)")
    .action(
      async (
        workspaceSlug: string,
        projectId: string,
        options: {
          name: string;
          startDate?: string | undefined;
          endDate?: string | undefined;
        }
      ) => {
        projectId = await resolveProjectId(workspaceSlug, projectId);
        const result = await createCycle(workspaceSlug, projectId, {
          name: options.name,
          start_date: options.startDate,
          end_date: options.endDate,
        });
        if (textRequested(program)) {
          emitText([`Ciclo creado: ${field(result, "id")}`]);
          return;
        }
        emit(result);
      }
    );
}
