/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { listMembers } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";
import { resolveProjectId } from "../resolve.js";

export function registerMemberCommands(program: Command): void {
  program
    .command("member")
    .description("Miembros de un proyecto.")
    .command("list")
    .description("Lista los miembros de un proyecto con id, nombre y rol.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .action(async (workspaceSlug: string, projectId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const rows = await listMembers(workspaceSlug, projectId);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "member_id")}\t${field(record, "name")}\t${field(record, "email")}\t${field(record, "role")}`;
          })
        );
        return;
      }
      emit(rows);
    });
}
