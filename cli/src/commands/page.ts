/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createPage, listPages } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";
import { resolveProjectId } from "../resolve.js";

export function registerPageCommands(program: Command): void {
  const page = program.command("page").description("Páginas de un proyecto.");

  page
    .command("list")
    .description("Lista las páginas de un proyecto.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .action(async (workspaceSlug: string, projectId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const rows = await listPages(workspaceSlug, projectId);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "name")}\t${field(record, "archived_at")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  page
    .command("create")
    .description("Crea una página (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .requiredOption("--name <nombre>", "título de la página")
    .action(async (workspaceSlug: string, projectId: string, options: { name: string }) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const result = await createPage(workspaceSlug, projectId, { name: options.name });
      if (textRequested(program)) {
        emitText([`Página creada: ${field(result, "id")}`]);
        return;
      }
      emit(result);
    });
}
