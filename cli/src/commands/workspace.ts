/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { listWorkspaces } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";

export function registerWorkspaceCommands(program: Command): void {
  program
    .command("workspace")
    .description("Espacios de trabajo accesibles con el token.")
    .command("list")
    .description("Lista los workspaces del usuario y su rol en cada uno.")
    .action(async () => {
      const rows = await listWorkspaces();
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "slug")}\t${field(record, "name")}\t${field(record, "role")}`;
          })
        );
        return;
      }
      emit(rows);
    });
}
