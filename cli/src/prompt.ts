/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Preguntas interactivas para `trazosuite login` usando node:readline (cero
 * dependencias nuevas). Dos caminos:
 *
 * - stdin NO interactivo (piped): una única interfaz `terminal: false` con
 *   cola de líneas. Crear readlines secuenciales sobre el mismo stdin pierde
 *   las líneas bufferizadas y EOF deja las preguntas sin resolver — por eso la
 *   cola. El `close` con pregunta pendiente resuelve con "" (fin de entrada).
 * - stdin TTY: `question()` normal para lo visible y lectura en modo raw para
 *   el token (eco oculto). El readline se cierra tras cada pregunta porque el
 *   secreto en raw necesita ser el único dueño de stdin.
 */

import { createInterface } from "node:readline";
import type { Interface } from "node:readline";

let pipedRl: Interface | null = null;
const lineQueue: string[] = [];
let pendingLine: ((line: string) => void) | null = null;

/** Lector con cola para stdin piped: una sola interfaz durante todo el proceso. */
function pipedReadLine(): Promise<string> {
  if (pipedRl === null) {
    pipedRl = createInterface({ input: process.stdin, terminal: false });
    pipedRl.on("line", (line) => {
      if (pendingLine !== null) {
        const resolve = pendingLine;
        pendingLine = null;
        resolve(line);
      } else {
        lineQueue.push(line);
      }
    });
    pipedRl.on("close", () => {
      if (pendingLine !== null) {
        const resolve = pendingLine;
        pendingLine = null;
        resolve("");
      }
    });
  }
  if (lineQueue.length > 0) {
    return Promise.resolve(lineQueue.shift() ?? "");
  }
  return new Promise((resolve) => {
    pendingLine = resolve;
  });
}

let ttyRl: Interface | null = null;

/** Pregunta visible en TTY con readline; cierra la interfaz al resolver. */
function ttyAsk(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (ttyRl === null) {
      ttyRl = createInterface({ input: process.stdin, output: process.stdout });
    }
    ttyRl.question(`${question}: `, (answer) => {
      ttyRl?.close();
      ttyRl = null;
      resolve(answer);
    });
  });
}

/** Lectura carácter a carácter en modo raw: el terminal no hace eco del token. */
function ttyReadSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    ttyRl?.close();
    ttyRl = null;
    process.stdout.write(`${question}: `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let input = "";
    const onData = (chunk: Buffer): void => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", onData);
          process.stdin.pause();
          process.stdout.write("\n");
          resolve(input);
          return;
        }
        if (char === "\u0003") {
          // Ctrl-C: corta el proceso como esperaría el usuario.
          process.stdout.write("\n");
          process.exit(2);
        }
        if (char === "\u007f" || char === "\b") {
          input = input.slice(0, -1);
          continue;
        }
        if (char >= " ") input += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

/** Lee una línea de texto visible (con eco en TTY); usa el fallback si llega vacía. */
export async function ask(question: string, fallback?: string): Promise<string> {
  const raw = process.stdin.isTTY ? await ttyAsk(question) : await pipedReadLine();
  const answer = raw.trim();
  return answer === "" && fallback !== undefined ? fallback : answer;
}

/** Lee una línea sin eco (para pegar el token). */
export async function askSecret(question: string): Promise<string> {
  const answer = process.stdin.isTTY ? await ttyReadSecret(question) : await pipedReadLine();
  return answer.trim();
}

/** Libera stdin: llamar cuando ya no quedan preguntas en el comando. */
export function closePrompt(): void {
  pipedRl?.close();
  pipedRl = null;
  ttyRl?.close();
  ttyRl = null;
}
