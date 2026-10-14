/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { listProjects } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";

export function registerProjectCommands(program: Command): void {
  program
    .command("project")
    .description("Proyectos de un workspace.")
    .command("list")
    .description("Lista los proyectos de un workspace.")
    .argument("<workspace_slug>", "slug del workspace")
    .action(async (workspaceSlug: string) => {
      const rows = await listProjects(workspaceSlug);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "identifier")}\t${field(record, "name")}\t${field(record, "id")}`;
          })
        );
        return;
      }
      emit(rows);
    });
}
