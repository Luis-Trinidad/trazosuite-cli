/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as fs from "node:fs/promises";
import { basename } from "node:path";
import {
  assignWorkItemToCycle,
  assignWorkItemToModule,
  changeWorkItemStatus,
  createWorkItem,
  deleteWorkItem,
  getWorkItem,
  listWorkItemAttachments,
  listWorkItems,
  updateWorkItem,
  uploadWorkItemAttachmentBytes,
} from "@trazo-suite/api-client";
import type { WorkItemInput } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { UsageError } from "../errors.js";
import { asRecord, emit, emitText, field, recordToLines, textRequested } from "../output.js";
import { resolveIssueId, resolveProjectId } from "../resolve.js";

/** Límite FILE_SIZE_LIMIT del backend para adjuntos. */
export const MAX_ATTACHMENT_BYTES = 5_242_880;

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
type Priority = (typeof PRIORITIES)[number];

const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webm: "video/webm",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
};

/** Acumula valores repetibles (`--label a --label b` → ["a", "b"]). */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

type ListOptions = {
  state?: string | undefined;
  priority?: string | undefined;
  label?: string[] | undefined;
  assignee?: string[] | undefined;
  cycle?: string | undefined;
  module?: string | undefined;
};

type WriteOptions = {
  name?: string | undefined;
  description?: string | undefined;
  state?: string | undefined;
  priority?: string | undefined;
  assignee?: string[] | undefined;
  label?: string[] | undefined;
  startDate?: string | undefined;
  targetDate?: string | undefined;
  parent?: string | undefined;
  estimatePoint?: string | undefined;
};

type AttachOptions = {
  type?: string | undefined;
};

/** Valida la prioridad del CLI contra los valores que acepta el backend. */
export function toPriority(value: string | undefined): Priority | undefined {
  if (value === undefined) return undefined;
  const found = PRIORITIES.find((priority) => priority === value);
  if (found === undefined) {
    throw new UsageError(`Prioridad inválida: "${value}". Valores válidos: ${PRIORITIES.join(", ")}.`);
  }
  return found;
}

/** MIME conocido según la extensión del archivo; undefined si no está en el mapa mínimo. */
export function mimeForExtension(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return undefined;
  return EXTENSION_MIME[fileName.slice(dot + 1).toLowerCase()];
}

/** Rechaza antes de leer cualquier archivo que supere el límite de 5 MB del backend. */
export function assertAttachmentSize(size: number, fileName: string): void {
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new UsageError(
      `"${fileName}" pesa ${(size / 1_048_576).toFixed(1)} MB y supera el límite de 5 MB por adjunto.`
    );
  }
}

/**
 * Valida y sube un archivo como adjunto. Las validaciones locales (extensión,
 * existencia, tamaño) fallan con UsageError antes de tocar la red.
 */
async function attachOneFile(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  ruta: string,
  forcedMime: string | undefined
): Promise<Record<string, unknown>> {
  const mimeType = mimeForExtension(ruta) ?? forcedMime;
  if (mimeType === undefined) {
    throw new UsageError(`Extensión no soportada para "${ruta}": pasa --type <mime_type> para adjuntarlo.`);
  }
  // Validación con fs.stat antes de leer: tamaño y existencia.
  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(ruta);
  } catch {
    throw new UsageError(`No se pudo leer el archivo "${ruta}".`);
  }
  if (!stats.isFile()) {
    throw new UsageError(`"${ruta}" no es un archivo regular.`);
  }
  assertAttachmentSize(stats.size, ruta);

  const name = basename(ruta);
  const bytes = await fs.readFile(ruta);
  const result = await uploadWorkItemAttachmentBytes(workspaceSlug, projectId, issueId, {
    name,
    mime_type: mimeType,
    bytes,
  });
  return { file: name, ...result };
}

function buildWorkItemInput(options: WriteOptions): WorkItemInput {
  const priority = toPriority(options.priority);
  return {
    name: options.name,
    description_html: options.description,
    state_id: options.state,
    priority,
    // Sin flags repetibles no se envía la clave: un array vacío borraría
    // asignados/etiquetas en el backend.
    assignee_ids: options.assignee !== undefined && options.assignee.length > 0 ? options.assignee : undefined,
    label_ids: options.label !== undefined && options.label.length > 0 ? options.label : undefined,
    start_date: options.startDate,
    target_date: options.targetDate,
    parent_id: options.parent,
    estimate_point: options.estimatePoint,
  };
}

function countSetFields(input: WorkItemInput): number {
  return Object.values(input).filter((value) => value !== undefined).length;
}

function formatWorkItemLine(item: unknown): string {
  const record = asRecord(item);
  return [
    field(record, "sequence_id"),
    field(record, "state"),
    field(record, "priority"),
    field(record, "name"),
    field(record, "id"),
  ].join("\t");
}

export function registerIssueCommands(program: Command): void {
  const issue = program.command("issue").description("Work items: listado, detalle y cambios.");

  issue
    .command("list")
    .description("Lista los work items de un proyecto con filtros opcionales.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .option("--state <state_id>", "filtra por id de estado")
    .option("--priority <prioridad>", "filtra por prioridad (urgent, high, medium, low, none)")
    .option("--label <label_id>", "filtra por id de etiqueta (repetible)", collect, [])
    .option("--assignee <assignee_id>", "filtra por id de asignado (repetible)", collect, [])
    .option("--cycle <cycle_id>", "filtra por id de ciclo")
    .option("--module <module_id>", "filtra por id de módulo")
    .action(async (workspaceSlug: string, projectId: string, options: ListOptions) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const items = await listWorkItems(workspaceSlug, projectId, {
        state_id: options.state,
        priority: options.priority,
        label_ids: options.label,
        assignee_ids: options.assignee,
        cycle_id: options.cycle,
        module_id: options.module,
      });
      if (textRequested(program)) {
        emitText(items.map((item) => formatWorkItemLine(item)));
        return;
      }
      emit(items);
    });

  issue
    .command("get")
    .description("Muestra el detalle de un work item, con asignados expandidos (id + nombre).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .action(async (workspaceSlug: string, projectId: string, issueId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      const item = await getWorkItem(workspaceSlug, projectId, issueId);
      if (textRequested(program)) {
        emitText(recordToLines(item));
        return;
      }
      emit(item);
    });

  issue
    .command("create")
    .description("Crea un work item (miembro, líder y admin del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .requiredOption("--name <nombre>", "título del work item")
    .option("--description <html>", "descripción en HTML")
    .option("--state <state_id>", "id del estado inicial")
    .option("--priority <prioridad>", "prioridad: urgent, high, medium, low, none")
    .option("--assignee <assignee_id>", "id de asignado (repetible)", collect, [])
    .option("--label <label_id>", "id de etiqueta (repetible)", collect, [])
    .option("--start-date <fecha>", "fecha de inicio (YYYY-MM-DD)")
    .option("--target-date <fecha>", "fecha objetivo (YYYY-MM-DD)")
    .option("--parent <issue_id>", "id del work item padre")
    .option("--estimate-point <id>", "id del punto de estimación")
    .action(async (workspaceSlug: string, projectId: string, options: WriteOptions) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      const item = await createWorkItem(workspaceSlug, projectId, buildWorkItemInput(options));
      if (textRequested(program)) {
        emitText(recordToLines(item));
        return;
      }
      emit(item);
    });

  issue
    .command("update")
    .description("Actualiza campos de un work item (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .option("--name <nombre>", "nuevo título")
    .option("--description <html>", "nueva descripción en HTML")
    .option("--state <state_id>", "id del nuevo estado")
    .option("--priority <prioridad>", "prioridad: urgent, high, medium, low, none")
    .option("--assignee <assignee_id>", "id de asignado (repetible, reemplaza la lista actual)", collect, [])
    .option("--label <label_id>", "id de etiqueta (repetible, reemplaza la lista actual)", collect, [])
    .option("--start-date <fecha>", "fecha de inicio (YYYY-MM-DD)")
    .option("--target-date <fecha>", "fecha objetivo (YYYY-MM-DD)")
    .option("--parent <issue_id>", "id del work item padre")
    .option("--estimate-point <id>", "id del punto de estimación")
    .action(async (workspaceSlug: string, projectId: string, issueId: string, options: WriteOptions) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      const input = buildWorkItemInput(options);
      if (countSetFields(input) === 0) {
        throw new UsageError(
          "No hay nada que actualizar: indica al menos un campo (--name, --description, --state, --priority, --assignee, --label, --start-date, --target-date, --parent, --estimate-point)."
        );
      }
      await updateWorkItem(workspaceSlug, projectId, issueId, input);
      if (textRequested(program)) {
        emitText([`Actualizado ${issueId}`]);
        return;
      }
      emit({ updated: true, id: issueId });
    });

  issue
    .command("delete")
    .description("Elimina un work item (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .action(async (workspaceSlug: string, projectId: string, issueId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      await deleteWorkItem(workspaceSlug, projectId, issueId);
      if (textRequested(program)) {
        emitText([`Eliminado ${issueId}`]);
        return;
      }
      emit({ deleted: true, id: issueId });
    });

  issue
    .command("move")
    .description("Mueve un work item a otro estado (miembro, líder y admin).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .requiredOption("--state <state_id>", "id del estado destino (ver state list)")
    .action(async (workspaceSlug: string, projectId: string, issueId: string, options: { state: string }) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      await changeWorkItemStatus(workspaceSlug, projectId, issueId, options.state);
      if (textRequested(program)) {
        emitText([`Movido ${issueId} al estado ${options.state}`]);
        return;
      }
      emit({ moved: true, id: issueId, state_id: options.state });
    });

  issue
    .command("attach")
    .description("Adjunta archivos locales a un work item (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .argument("<rutas...>", "rutas de los archivos a adjuntar (máx. 5 MB cada uno)")
    .option(
      "--type <mime_type>",
      "MIME type para archivos con extensión fuera del mapa conocido (png, jpg, jpeg, gif, webm, webp, pdf, txt, csv, json, md)"
    )
    .action(
      async (workspaceSlug: string, projectId: string, issueId: string, rutas: string[], options: AttachOptions) => {
        projectId = await resolveProjectId(workspaceSlug, projectId);
        issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
        const results: Record<string, unknown>[] = [];
        for (const ruta of rutas) {
          // eslint-disable-next-line no-await-in-loop -- subida secuencial: valida y sube un archivo a la vez, falla rápido sin saturar la API
          results.push(await attachOneFile(workspaceSlug, projectId, issueId, ruta, options.type));
        }
        if (textRequested(program)) {
          emitText(results.map((result) => `Subido ${field(result, "file")} (asset ${field(result, "asset_id")})`));
          return;
        }
        emit(results);
      }
    );

  issue
    .command("attachments")
    .description("Lista los adjuntos de un work item.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .action(async (workspaceSlug: string, projectId: string, issueId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      const rows = await listWorkItemAttachments(workspaceSlug, projectId, issueId);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "name")}\t${field(record, "type")}\t${field(record, "size")}\t${field(record, "id")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  issue
    .command("assign-cycle")
    .description("Asigna un work item a un ciclo (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .requiredOption("--cycle <cycle_id>", "id del ciclo destino")
    .action(async (workspaceSlug: string, projectId: string, issueId: string, options: { cycle: string }) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      const result = await assignWorkItemToCycle(workspaceSlug, projectId, issueId, options.cycle);
      if (textRequested(program)) {
        emitText([`Asignado ${issueId} al ciclo ${options.cycle}`]);
        return;
      }
      emit({ assigned: true, id: issueId, cycle_id: options.cycle, result });
    });

  issue
    .command("assign-module")
    .description("Asigna un work item a un módulo (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .requiredOption("--module <module_id>", "id del módulo destino")
    .action(async (workspaceSlug: string, projectId: string, issueId: string, options: { module: string }) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      const result = await assignWorkItemToModule(workspaceSlug, projectId, issueId, options.module);
      if (textRequested(program)) {
        emitText([`Asignado ${issueId} al módulo ${options.module}`]);
        return;
      }
      emit({ assigned: true, id: issueId, module_id: options.module, result });
    });
}
