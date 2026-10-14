#!/usr/bin/env node
/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { registerCycleCommands } from "./commands/cycle.js";
import { registerCommentCommands } from "./commands/comment.js";
import { registerFinanceCommands } from "./commands/finance.js";
import { registerIssueCommands } from "./commands/issue.js";
import { registerLabelCommands } from "./commands/label.js";
import { registerLoginCommand, registerLogoutCommand } from "./commands/login.js";
import { registerMemberCommands } from "./commands/member.js";
import { registerModuleCommands } from "./commands/module.js";
import { registerPageCommands } from "./commands/page.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerStateCommands } from "./commands/state.js";
import { registerWhoamiCommand } from "./commands/whoami.js";
import { registerWorkspaceCommands } from "./commands/workspace.js";
import { applyStoredCredentials, loadCredentials, permissionsWarning } from "./credentials.js";
import { fail } from "./errors.js";

// La versión vive en package.json; así `--version` nunca se descuadra del paquete publicado.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

/** Construye el programa completo (comandos, flags y salida) sin ejecutarlo. Exportado para poder parsear argv en memoria desde los tests. */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name("trazosuite")
    .description("CLI de TrazoSuite para agentes y humanos")
    .version(version)
    .option("--text", "salida legible para humanos (por defecto la salida es JSON)")
    .exitOverride();

  registerWhoamiCommand(program);
  registerLoginCommand(program);
  registerLogoutCommand(program);
  registerWorkspaceCommands(program);
  registerProjectCommands(program);
  registerStateCommands(program);
  registerMemberCommands(program);
  registerIssueCommands(program);
  registerFinanceCommands(program);
  registerCommentCommands(program);
  registerCycleCommands(program);
  registerModuleCommands(program);
  registerLabelCommands(program);
  registerPageCommands(program);
  return program;
}

async function main(): Promise<void> {
  // Credenciales de `login` como valores por defecto: el entorno siempre gana.
  const { tokenFromStore } = applyStoredCredentials(await loadCredentials());
  if (tokenFromStore) {
    const warning = await permissionsWarning();
    if (warning !== null) process.stderr.write(`${JSON.stringify({ aviso: warning })}\n`);
  }
  await buildProgram().parseAsync(process.argv);
}

/** Indica si este módulo es el entrypoint del proceso (el bin ejecutado por Node). */
async function isEntrypoint(): Promise<boolean> {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const candidates = [pathToFileURL(entry).href];
  try {
    // El bin instalado se ejecuta a través de un symlink (node_modules/.bin);
    // Node resuelve el módulo a su ruta real, así que también comparamos con ella.
    candidates.push(pathToFileURL(await realpath(entry)).href);
  } catch {
    // La ruta del entrypoint ya no existe; no es una ejecución del bin.
  }
  return candidates.includes(import.meta.url);
}

if (await isEntrypoint()) {
  main().catch((error: unknown) => {
    fail(error);
  });
}
