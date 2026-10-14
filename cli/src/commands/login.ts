/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * `trazosuite login`: pide URL y token (el que se genera en TrazoSuite, perfil
 * → API tokens), los valida contra /api/users/me/ y solo si el backend
 * responde 200 los guarda en ~/.config/trazosuite/credentials.json (0600).
 */

import type { Command } from "commander";
import { clearCredentials, loadCredentials, saveCredentials } from "../credentials.js";
import { UsageError } from "../errors.js";
import { emit, emitText, textRequested } from "../output.js";
import { ask, askSecret, closePrompt } from "../prompt.js";

/** Resultado de la validación: el usuario dueño del token. */
type MeResponse = { email?: unknown; display_name?: unknown; first_name?: unknown };

/** Valida URL+token contra el backend; devuelve el usuario si es 200. */
export async function validateCredentials(url: string, token: string): Promise<MeResponse> {
  let response: Response;
  try {
    response = await fetch(`${url}/api/users/me/`, { headers: { "X-Api-Key": token } });
  } catch (error) {
    throw new UsageError(`No se pudo conectar con TrazoSuite en ${url}: ${(error as Error).message}`);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new UsageError(
        `El token no es válido para ${url} (HTTP ${response.status}). Revísalo en perfil → API tokens.`
      );
    }
    throw new UsageError(`El backend respondió HTTP ${response.status} al validar el token en ${url}.`);
  }
  const body: unknown = await response.json();
  if (body === null || typeof body !== "object") {
    throw new UsageError("La respuesta del backend no tiene el formato esperado.");
  }
  return body as MeResponse;
}

/** Quita la barra final de una URL base. */
export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Guarda URL y token de API (los valida contra el backend antes de almacenar).")
    .option("--url <url>", "URL base de TrazoSuite (p. ej. https://www.trazolab.app)")
    .option("--token <token>", "token de API (evita el prompt; cuidado con el historial del shell)")
    .action(async (options: { url?: string; token?: string }) => {
      const stored = await loadCredentials();
      const url = normalizeUrl(
        options.url ??
          (await ask("URL de TrazoSuite", stored?.url ?? process.env.TRAZO_API_URL ?? "http://localhost:8000"))
      );
      const token = options.token ?? (await askSecret("Token de API (se genera en TrazoSuite, perfil → API tokens)"));
      // Las preguntas terminaron: libera stdin para que el proceso pueda salir
      // (sobre todo con TTY, donde readline mantiene el event loop vivo).
      closePrompt();
      if (token === "") {
        throw new UsageError("No se recibió ningún token.");
      }

      const me = await validateCredentials(url, token);
      await saveCredentials({ url, token });
      const who = String(me.display_name ?? me.first_name ?? me.email ?? "usuario");
      if (textRequested(program)) {
        emitText([`Conectado como ${who} en ${url}. Credenciales guardadas (archivo 0600).`]);
        return;
      }
      emit({ connected: true, user: who, url, stored: true });
    });
}

export function registerLogoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Borra las credenciales almacenadas por login.")
    .action(async () => {
      const removed = await clearCredentials();
      if (textRequested(program)) {
        emitText([removed ? "Credenciales borradas." : "No había credenciales almacenadas."]);
        return;
      }
      emit({ removed });
    });
}
