/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createLabel, listLabels } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";
import { resolveProjectId } from "../resolve.js";

export function registerLabelCommands(program: Command): void {
  const label = program.command("label").description("Etiquetas de un proyecto.");

  label
    .command("list")
    .description("Lista las etiquetas de un proyecto.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .action(async (workspaceSlug: string, projectId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const rows = await listLabels(workspaceSlug, projectId);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "name")}\t${field(record, "color")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  label
    .command("create")
    .description("Crea una etiqueta (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .requiredOption("--name <nombre>", "nombre de la etiqueta")
    .option("--color <color>", "color en hex (por ejemplo #02b5ed)")
    .action(
      async (
        workspaceSlug: string,
        projectId: string,
        options: {
          name: string;
          color?: string | undefined;
        }
      ) => {
        projectId = await resolveProjectId(workspaceSlug, projectId);
        const result = await createLabel(workspaceSlug, projectId, {
          name: options.name,
          color: options.color,
        });
        if (textRequested(program)) {
          emitText([`Etiqueta creada: ${field(result, "id")}`]);
          return;
        }
        emit(result);
      }
    );
}
