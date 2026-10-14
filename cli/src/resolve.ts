/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Referencias amables para el CLI: los comandos aceptan el identificador del
 * proyecto ("DEMO") y el sequence id del work item ("DEMO-1", "12"), pero el
 * backend solo acepta UUIDs en sus rutas. Estas funciones resuelven antes de
 * llamar; un UUID de entrada se devuelve tal cual (cero llamadas extra).
 */

import { listProjects, listWorkItems } from "@trazo-suite/api-client";
import { UsageError } from "./errors.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Acepta el id uuid o el identificador del proyecto (p. ej. "DEMO"), sin distinguir mayúsculas. */
export async function resolveProjectId(workspaceSlug: string, projectRef: string): Promise<string> {
  if (isUuid(projectRef)) return projectRef;
  const projects = await listProjects(workspaceSlug);
  const wanted = projectRef.toUpperCase();
  const match = projects.find((project) => {
    const row = project as Record<string, unknown>;
    return row.identifier === wanted || row.id === projectRef;
  });
  if (match === undefined) {
    throw new UsageError(`No existe el proyecto "${projectRef}" en "${workspaceSlug}" (ver project list).`);
  }
  return String((match as Record<string, unknown>).id);
}

/**
 * Acepta el id uuid o el sequence id del work item (12 o DEMO-12). Se resuelve
 * contra la primera página del listado del proyecto; si el proyecto es enorme
 * y el issue no está ahí, pasa el uuid explícito.
 */
export async function resolveIssueId(workspaceSlug: string, projectId: string, issueRef: string): Promise<string> {
  if (isUuid(issueRef)) return issueRef;
  const sequence = Number(issueRef.replace(/^\D+/, ""));
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new UsageError(`"${issueRef}" no es ni un UUID ni un sequence id (p. ej. 12 o DEMO-12).`);
  }
  const items = await listWorkItems(workspaceSlug, projectId);
  const match = items.find((item) => {
    const row = item as Record<string, unknown>;
    return row.sequence_id === sequence;
  });
  if (match === undefined) {
    throw new UsageError(
      `No se encontró el work item ${sequence} en la primera página del proyecto; usa el uuid (ver issue list).`
    );
  }
  return String((match as Record<string, unknown>).id);
}
