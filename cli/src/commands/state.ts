/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { listStates } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";
import { resolveProjectId } from "../resolve.js";

export function registerStateCommands(program: Command): void {
  program
    .command("state")
    .description("Estados (workflow) de un proyecto.")
    .command("list")
    .description("Lista los estados de un proyecto (útil para issue move --state).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .action(async (workspaceSlug: string, projectId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const rows = await listStates(workspaceSlug, projectId);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            const isDefault = record.default === true ? "default" : "";
            return `${field(record, "id")}\t${field(record, "name")}\t${field(record, "group")}\t${isDefault}`;
          })
        );
        return;
      }
      emit(rows);
    });
}
