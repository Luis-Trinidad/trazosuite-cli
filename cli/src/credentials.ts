/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Credenciales del CLI para uso humano: `trazosuite login` guarda URL+token en
 * un archivo con permisos 0600 (~/.config/trazosuite/credentials.json, o la
 * ruta que indique TRAZO_CREDENTIALS_PATH, útil para tests). Precedencia: las
 * variables de entorno TRAZO_API_URL/TRAZO_API_TOKEN ganan siempre sobre lo
 * almacenado — los agentes siguen configurando el entorno y no lo leen.
 */

import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type StoredCredentials = {
  /** URL base de la API validada al hacer login (sin barra final). */
  url: string;
  /** Token de API validado; nunca se imprime completo. */
  token: string;
};

/** Ruta del archivo de credenciales (TRAZO_CREDENTIALS_PATH la puede mover). */
export function credentialsPath(): string {
  const override = process.env.TRAZO_CREDENTIALS_PATH;
  if (override !== undefined && override !== "") return override;
  return join(homedir(), ".config", "trazosuite", "credentials.json");
}

/** Carga las credenciales almacenadas; null si no existen o están corruptas. */
export async function loadCredentials(): Promise<StoredCredentials | null> {
  const path = credentialsPath();
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const url = record.url;
    const token = record.token;
    if (typeof url !== "string" || url === "" || typeof token !== "string" || token === "") return null;
    return { url, token };
  } catch {
    return null;
  }
}

/** Guarda las credenciales creando el directorio 0700 y el archivo 0600. */
export async function saveCredentials(credentials: StoredCredentials): Promise<void> {
  const path = credentialsPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  // La umask puede suavizar el modo pedido; se asegura explícitamente.
  await chmod(path, 0o600);
}

/** Borra las credenciales; devuelve true si existían. */
export async function clearCredentials(): Promise<boolean> {
  const path = credentialsPath();
  try {
    await rm(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inyecta las credenciales almacenadas como valores por defecto del proceso:
 * solo cubre las variables que el entorno no trae. Se llama una vez al arranque
 * del binario, antes de ejecutar cualquier comando.
 * @returns lo que se aplicó, para que `whoami` muestre el origen del token.
 */
export function applyStoredCredentials(stored: StoredCredentials | null): { tokenFromStore: boolean } {
  if (stored === null) return { tokenFromStore: false };
  if (process.env.TRAZO_API_URL === undefined || process.env.TRAZO_API_URL === "") {
    process.env.TRAZO_API_URL = stored.url;
  }
  if (process.env.TRAZO_API_TOKEN === undefined || process.env.TRAZO_API_TOKEN === "") {
    process.env.TRAZO_API_TOKEN = stored.token;
    return { tokenFromStore: true };
  }
  return { tokenFromStore: false };
}

/** Describe de dónde salió el token en uso, sin imprimirlo completo. */
export async function describeTokenSource(): Promise<string> {
  const token = process.env.TRAZO_API_TOKEN ?? "";
  if (token === "") return "ninguna";
  const stored = await loadCredentials();
  if (stored !== null && stored.token === token) {
    return `almacenada (…${token.slice(-4)})`;
  }
  return "entorno";
}

/** Si el entorno ya trae token, el almacenado no se aplica (los agentes mandan). */
export function envHasToken(): boolean {
  const token = process.env.TRAZO_API_TOKEN;
  return token !== undefined && token !== "";
}

/** Advierte (mensaje, no excepción) si el archivo de credenciales es más abierto que 0600. */
export async function permissionsWarning(): Promise<string | null> {
  try {
    const info = await stat(credentialsPath());
    // eslint-disable-next-line no-bitwise -- los modos de archivo se leen con máscaras de bits
    if ((info.mode & 0o077) !== 0) {
      return "El archivo de credenciales es legible por otros usuarios del sistema; ejecuta: chmod 600 $(ruta del archivo).";
    }
  } catch {
    // Sin archivo no hay nada que advertir.
  }
  return null;
}
