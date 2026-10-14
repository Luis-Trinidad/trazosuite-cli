/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createModule, listModules } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";
import { resolveProjectId } from "../resolve.js";

export function registerModuleCommands(program: Command): void {
  const module = program.command("module").description("Módulos de un proyecto.");

  module
    .command("list")
    .description("Lista los módulos de un proyecto.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .action(async (workspaceSlug: string, projectId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const rows = await listModules(workspaceSlug, projectId);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "name")}\t${field(record, "status")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  module
    .command("create")
    .description("Crea un módulo (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .requiredOption("--name <nombre>", "nombre del módulo")
    .option("--description <texto>", "descripción del módulo")
    .action(
      async (
        workspaceSlug: string,
        projectId: string,
        options: {
          name: string;
          description?: string | undefined;
        }
      ) => {
        projectId = await resolveProjectId(workspaceSlug, projectId);
        const result = await createModule(workspaceSlug, projectId, {
          name: options.name,
          description: options.description,
        });
        if (textRequested(program)) {
          emitText([`Módulo creado: ${field(result, "id")}`]);
          return;
        }
        emit(result);
      }
    );
}
