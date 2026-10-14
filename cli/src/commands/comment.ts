/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { addComment, deleteComment, listComments, updateComment } from "@trazo-suite/api-client";
import type { Command } from "commander";
import { asRecord, emit, emitText, field, textRequested } from "../output.js";
import { resolveIssueId, resolveProjectId } from "../resolve.js";

export function registerCommentCommands(program: Command): void {
  const comment = program.command("comment").description("Comentarios de un work item.");

  comment
    .command("list")
    .description("Lista los comentarios de un work item.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .action(async (workspaceSlug: string, projectId: string, issueId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      const rows = await listComments(workspaceSlug, projectId, issueId);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "actor")}\t${field(record, "comment_html")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  comment
    .command("add")
    .description("Añade un comentario a un work item (miembro, líder y admin).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .requiredOption("--html <contenido>", "contenido del comentario en HTML")
    .action(async (workspaceSlug: string, projectId: string, issueId: string, options: { html: string }) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      const result = await addComment(workspaceSlug, projectId, issueId, options.html);
      if (textRequested(program)) {
        emitText([`Comentario creado: ${field(result, "id")}`]);
        return;
      }
      emit(result);
    });

  comment
    .command("update")
    .description("Edita un comentario (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .argument("<comment_id>", "id del comentario")
    .requiredOption("--html <contenido>", "nuevo contenido del comentario en HTML")
    .action(
      async (
        workspaceSlug: string,
        projectId: string,
        issueId: string,
        commentId: string,
        options: { html: string }
      ) => {
        projectId = await resolveProjectId(workspaceSlug, projectId);
        issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
        const result = await updateComment(workspaceSlug, projectId, issueId, commentId, options.html);
        if (textRequested(program)) {
          emitText([`Comentario actualizado: ${commentId}`]);
          return;
        }
        emit(result);
      }
    );

  comment
    .command("delete")
    .description("Elimina un comentario (solo admin y líder del proyecto).")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<project_id>", "id (o identificador) del proyecto")
    .argument("<issue_id>", "id (o sequence id) del work item")
    .argument("<comment_id>", "id del comentario")
    .action(async (workspaceSlug: string, projectId: string, issueId: string, commentId: string) => {
      projectId = await resolveProjectId(workspaceSlug, projectId);
      issueId = await resolveIssueId(workspaceSlug, projectId, issueId);
      await deleteComment(workspaceSlug, projectId, issueId, commentId);
      if (textRequested(program)) {
        emitText([`Comentario eliminado: ${commentId}`]);
        return;
      }
      emit({ deleted: true, id: commentId });
    });
}
