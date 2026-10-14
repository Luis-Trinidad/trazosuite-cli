/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { apiRequest } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { describeTokenSource } from "../credentials.js";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";

export function registerWhoamiCommand(program: Command): void {
  program
    .command("whoami")
    .description("Muestra el usuario dueño del token actual (GET /api/users/me/).")
    .action(async () => {
      const me: unknown = await apiRequest<unknown>({ method: "GET", path: "/api/users/me/" });
      const source = await describeTokenSource();
      if (textRequested(program)) {
        const row = asRecord(me);
        emitText([
          `id: ${field(row, "id")}`,
          `email: ${field(row, "email")}`,
          `nombre: ${field(row, "display_name") || field(row, "first_name")}`,
          `credencial: ${source}`,
        ]);
        return;
      }
      emit({ credencial: source, ...(me as Record<string, unknown>) });
    });
}
