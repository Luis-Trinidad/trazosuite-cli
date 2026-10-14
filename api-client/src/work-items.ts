/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { apiRequest } from "./client.js";

/** Tolerant normalizer over the API JSON shapes (lists, paginated results). */
function toArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results;
    if (Array.isArray(record.issues)) return record.issues;
    if (Array.isArray(record.projects)) return record.projects;
    if (Array.isArray(record.workspaces)) return record.workspaces;
    if (Array.isArray(record.comments)) return record.comments;
    if (Array.isArray(record.cycles)) return record.cycles;
    if (Array.isArray(record.modules)) return record.modules;
    if (Array.isArray(record.labels)) return record.labels;
    if (Array.isArray(record.pages)) return record.pages;
  }
  return [];
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickWorkItem(value: unknown): Record<string, unknown> {
  const item = recordOf(value);
  return {
    id: item.id ?? null,
    name: item.name ?? null,
    sequence_id: item.sequence_id ?? null,
    priority: item.priority ?? null,
    state_id: item.state_id ?? null,
    state: recordOf(item.state).name ?? null,
    project_id: item.project_id ?? null,
    created_at: item.created_at ?? null,
    updated_at: item.updated_at ?? null,
    completed_at: item.completed_at ?? null,
    // TRAZO-8: expose what the backend already returns
    start_date: item.start_date ?? null,
    target_date: item.target_date ?? null,
    parent_id: item.parent_id ?? null,
    estimate_point: item.estimate_point ?? null,
    cycle_id: item.cycle_id ?? null,
    module_ids: Array.isArray(item.module_ids) ? item.module_ids : [],
    label_ids: Array.isArray(item.label_ids) ? item.label_ids : [],
    assignee_ids: Array.isArray(item.assignee_ids) ? item.assignee_ids : [],
    // TRAZO-15: assignee id + nombre when the backend expands `assignees`
    // (get_work_item with ?expand=assignees); the list endpoint fills this
    // array through the project members lookup instead.
    assignees: Array.isArray(item.assignees)
      ? item.assignees.map((assignee) => {
          const row = recordOf(assignee);
          return {
            id: row.id ?? null,
            display_name: row.display_name ?? row.name ?? null,
            email: row.email ?? null,
          };
        })
      : null,
  };
}

export type WorkItemInput = {
  name?: string | undefined;
  description_html?: string | undefined;
  state_id?: string | undefined;
  priority?: "urgent" | "high" | "medium" | "low" | "none" | undefined;
  assignee_ids?: string[] | undefined;
  label_ids?: string[] | undefined;
  start_date?: string | undefined;
  target_date?: string | undefined;
  parent_id?: string | null | undefined;
  estimate_point?: string | undefined;
};

export async function listWorkspaces(): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: "/api/workspaces/" });
  return toArray(data).map((workspace) => {
    const row = recordOf(workspace);
    return { id: row.id, name: row.name, slug: row.slug, role: row.role };
  });
}

export async function listProjects(workspaceSlug: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `/api/workspaces/${workspaceSlug}/projects/` });
  return toArray(data).map((project) => {
    const row = recordOf(project);
    return { id: row.id, name: row.name, identifier: row.identifier };
  });
}

export type WorkItemFilters = {
  state_id?: string | null | undefined;
  priority?: string | null | undefined;
  label_ids?: string[] | null | undefined;
  assignee_ids?: string[] | null | undefined;
  cycle_id?: string | null | undefined;
  module_id?: string | null | undefined;
};

export async function listWorkItems(
  workspaceSlug: string,
  projectId: string,
  filters: WorkItemFilters = {}
): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`,
    query: {
      ...(filters.state_id ? { state: filters.state_id } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.label_ids && filters.label_ids.length ? { labels: filters.label_ids.join(",") } : {}),
      ...(filters.assignee_ids && filters.assignee_ids.length ? { assignees: filters.assignee_ids.join(",") } : {}),
      ...(filters.cycle_id ? { cycle: filters.cycle_id } : {}),
      ...(filters.module_id ? { module: filters.module_id } : {}),
    },
  });
  const items = toArray(data).map(pickWorkItem);
  // TRAZO-15: the issues list endpoint only returns assignee ids, so resolve
  // the assignee names (id + nombre) from the project members list. The state
  // name gets the same treatment (the endpoint only carries state_id).
  if (items.length > 0) {
    const [memberNames, stateNames] = await Promise.all([
      loadMemberNameMap(workspaceSlug, projectId),
      loadStateNameMap(workspaceSlug, projectId),
    ]);
    return items.map((item) => withStateName(withAssigneeNames(item, memberNames), stateNames));
  }
  return items;
}

export async function getWorkItem(
  workspaceSlug: string,
  projectId: string,
  issueId: string
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
    // TRAZO-15: ask the backend for the assignee profiles (id + nombre).
    query: { expand: "assignees" },
  });
  const item = recordOf(data);
  const detail = {
    ...pickWorkItem(item),
    description_html: item.description_html ?? null,
    sub_issues_count: item.sub_issues_count ?? null,
  };
  // Fallback for backends that ignore the expand param: resolve names from the
  // project members list. The state name resolves in parallel either way.
  const rawAssignees = item.assignees;
  const needsMemberFallback = !Array.isArray(rawAssignees) || rawAssignees.length === 0;
  const [stateNames, memberNames] = await Promise.all([
    loadStateNameMap(workspaceSlug, projectId),
    needsMemberFallback ? loadMemberNameMap(workspaceSlug, projectId) : Promise.resolve(null),
  ]);
  const withState = withStateName(detail, stateNames);
  if (needsMemberFallback && memberNames !== null) {
    return withAssigneeNames(withState, memberNames);
  }
  return withState;
}

/**
 * Map of user id -> { display_name, email } for the members of a project.
 * Feeds the TRAZO-15 assignee names in list_work_items / get_work_item.
 */
async function loadMemberNameMap(
  workspaceSlug: string,
  projectId: string
): Promise<Map<string, { display_name: string | null; email: string | null }>> {
  const members = await listMembers(workspaceSlug, projectId);
  const names = new Map<string, { display_name: string | null; email: string | null }>();
  for (const member of members) {
    const row = recordOf(member);
    if (typeof row.member_id === "string") {
      names.set(row.member_id, {
        display_name: typeof row.name === "string" ? row.name : null,
        email: typeof row.email === "string" ? row.email : null,
      });
    }
  }
  return names;
}

/** Map of state id -> name for the project (estado legible en la salida). */
async function loadStateNameMap(workspaceSlug: string, projectId: string): Promise<Map<string, string>> {
  const states = await listStates(workspaceSlug, projectId);
  const names = new Map<string, string>();
  for (const state of states) {
    const row = recordOf(state);
    if (typeof row.id === "string" && typeof row.name === "string") {
      names.set(row.id, row.name);
    }
  }
  return names;
}

/** Adds an `assignees: [{id, display_name, email}]` array to a work item. */
function withAssigneeNames(
  item: Record<string, unknown>,
  memberNames: Map<string, { display_name: string | null; email: string | null }>
): Record<string, unknown> {
  if (!Array.isArray(item.assignee_ids)) return item;
  const assignees = (item.assignee_ids as unknown[])
    .filter((id): id is string => typeof id === "string")
    .map((id) => {
      const member = memberNames.get(id);
      return { id, display_name: member?.display_name ?? null, email: member?.email ?? null };
    });
  return { ...item, assignees };
}

/** Resolves `state` (nombre legible) desde el state_id con el mapa de estados. */
function withStateName(item: Record<string, unknown>, stateNames: Map<string, string>): Record<string, unknown> {
  const stateId = item.state_id;
  if (typeof stateId !== "string") return item;
  return { ...item, state: stateNames.get(stateId) ?? null };
}

export async function createWorkItem(
  workspaceSlug: string,
  projectId: string,
  input: WorkItemInput
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description_html !== undefined) body.description_html = input.description_html;
  if (input.state_id !== undefined) body.state_id = input.state_id;
  if (input.priority !== undefined) body.priority = input.priority;
  if (input.assignee_ids !== undefined) body.assignee_ids = input.assignee_ids;
  if (input.label_ids !== undefined) body.label_ids = input.label_ids;
  if (input.start_date !== undefined) body.start_date = input.start_date;
  if (input.target_date !== undefined) body.target_date = input.target_date;
  if (input.parent_id !== undefined) body.parent_id = input.parent_id;
  if (input.estimate_point !== undefined) body.estimate_point = input.estimate_point;

  const data = await apiRequest<unknown>({
    method: "POST",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`,
    body,
  });
  const item = pickWorkItem(data);
  const stateNames = await loadStateNameMap(workspaceSlug, projectId);
  return withStateName(item, stateNames);
}

export async function updateWorkItem(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  input: WorkItemInput
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description_html !== undefined) body.description_html = input.description_html;
  if (input.state_id !== undefined) body.state_id = input.state_id;
  if (input.priority !== undefined) body.priority = input.priority;
  if (input.assignee_ids !== undefined) body.assignee_ids = input.assignee_ids;
  if (input.label_ids !== undefined) body.label_ids = input.label_ids;
  if (input.start_date !== undefined) body.start_date = input.start_date;
  if (input.target_date !== undefined) body.target_date = input.target_date;
  if (input.parent_id !== undefined) body.parent_id = input.parent_id;
  if (input.estimate_point !== undefined) body.estimate_point = input.estimate_point;

  await apiRequest<void>({
    method: "PATCH",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
    body,
  });
}

export async function changeWorkItemStatus(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  stateId: string
): Promise<void> {
  await apiRequest<void>({
    method: "PATCH",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
    body: { state_id: stateId },
  });
}

export async function deleteWorkItem(workspaceSlug: string, projectId: string, issueId: string): Promise<void> {
  await apiRequest<void>({
    method: "DELETE",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
  });
}

export async function listComments(workspaceSlug: string, projectId: string, issueId: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`,
  });
  return toArray(data).map((comment) => {
    const row = recordOf(comment);
    return {
      id: row.id,
      comment_html: row.comment_html ?? null,
      created_at: row.created_at ?? null,
      actor: recordOf(row.actor).display_name ?? row.actor ?? null,
    };
  });
}

export async function addComment(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  commentHtml: string
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`,
    body: { comment_html: commentHtml },
  });
  return { id: recordOf(data).id ?? null };
}

export async function createCycle(
  workspaceSlug: string,
  projectId: string,
  input: { name: string; start_date?: string | undefined; end_date?: string | undefined }
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.start_date !== undefined) body.start_date = input.start_date;
  if (input.end_date !== undefined) body.end_date = input.end_date;
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`,
    body,
  });
  return recordOf(data);
}

export async function listCycles(workspaceSlug: string, projectId: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`,
  });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return {
      id: r.id,
      name: r.name,
      status: r.status ?? null,
      start_date: r.start_date ?? null,
      end_date: r.end_date ?? null,
    };
  });
}

export async function createModule(
  workspaceSlug: string,
  projectId: string,
  input: { name: string; description?: string | undefined }
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.description !== undefined) body.description = input.description;
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/`,
    body,
  });
  return recordOf(data);
}

export async function listModules(workspaceSlug: string, projectId: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/`,
  });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return { id: r.id, name: r.name, status: r.status ?? null };
  });
}

export async function createPage(
  workspaceSlug: string,
  projectId: string,
  input: { name: string }
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/`,
    body: { name: input.name },
  });
  return recordOf(data);
}

export async function listPages(workspaceSlug: string, projectId: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/`,
  });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return { id: r.id, name: r.name, archived_at: r.archived_at ?? null };
  });
}

export async function createLabel(
  workspaceSlug: string,
  projectId: string,
  input: { name: string; color?: string | undefined }
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.color !== undefined) body.color = input.color;
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-labels/`,
    body,
  });
  return recordOf(data);
}

export async function listLabels(workspaceSlug: string, projectId: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-labels/`,
  });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return { id: r.id, name: r.name, color: r.color ?? null };
  });
}

export async function listStates(workspaceSlug: string, projectId: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/states/`,
  });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return {
      id: r.id ?? null,
      name: r.name ?? null,
      group: r.group ?? null,
      color: r.color ?? null,
      default: r.default ?? false,
    };
  });
}

export async function listMembers(workspaceSlug: string, projectId: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/members/`,
    // TRAZO-15: ask the backend to nest the user profile (id + nombre) in each
    // member row via ?expand=member. Backends without support keep returning
    // the bare user uuid in `member`; the mapping below handles both shapes.
    query: { expand: "member" },
  });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    const memberValue = r.member;
    const memberIsNested = memberValue !== null && typeof memberValue === "object";
    const nested = memberIsNested ? recordOf(memberValue) : {};
    const nestedId = memberIsNested ? nested.id : memberValue;
    return {
      id: r.id ?? null,
      member_id: typeof nestedId === "string" ? nestedId : (r.member_id ?? null),
      name:
        typeof r.display_name === "string"
          ? r.display_name
          : typeof nested.display_name === "string"
            ? nested.display_name
            : null,
      email: typeof r.email === "string" ? r.email : typeof nested.email === "string" ? nested.email : null,
      role: r.role ?? null,
      is_lead: r.is_lead ?? null,
    };
  });
}

/**
 * TRAZO-13: work item attachments (upload + list) through the hosted API.
 *
 * The backend follows a presigned-upload flow: POST the file metadata to get an
 * S3 presigned POST (url + fields), upload the bytes straight to S3, then PATCH
 * the attachment to mark it as uploaded. Everything happens without a human.
 */

export async function listWorkItemAttachments(
  workspaceSlug: string,
  projectId: string,
  issueId: string
): Promise<unknown[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/attachments/`,
  });
  return toArray(data).map((row) => mapAttachment(recordOf(row)));
}

export type AttachWorkItemFileInput = {
  name: string;
  mime_type: string;
  content_base64: string;
};

/**
 * Uploads raw file bytes as a work item attachment through the 3-step
 * presigned flow (register -> S3 upload -> confirm). Enforces the backend's
 * 5 MB FILE_SIZE_LIMIT before starting.
 */
export async function uploadWorkItemAttachmentBytes(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  input: { name: string; mime_type: string; bytes: Buffer }
): Promise<Record<string, unknown>> {
  const bytes = input.bytes;
  if (bytes.length === 0) {
    throw new Error("content_base64 no contiene datos válidos (no se pudo decodificar el archivo).");
  }
  if (bytes.length > 5_242_880) {
    throw new Error("El archivo supera el límite de 5 MB del backend (FILE_SIZE_LIMIT).");
  }
  const basePath = `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/attachments`;

  // 1) Register the attachment and get the presigned S3 POST (url + fields).
  const presign = recordOf(
    await apiRequest<unknown>({
      method: "POST",
      path: `${basePath}/`,
      body: { name: input.name, type: input.mime_type, size: bytes.length },
    })
  );
  const uploadData = recordOf(presign.upload_data);
  const url = uploadData.url;
  const fields = recordOf(uploadData.fields);
  const assetId = presign.asset_id;
  if (typeof url !== "string") {
    throw new Error("La API no devolvió una URL de subida (upload_data.url).");
  }
  if (typeof assetId !== "string") {
    throw new Error("La API no devolvió asset_id para el adjunto.");
  }

  // 2) Upload the file bytes to the presigned S3 POST endpoint.
  await uploadToPresignedPost(url, fields, bytes, input.name, input.mime_type);

  // 3) Mark the attachment as uploaded so it shows up in the lists.
  await apiRequest<void>({ method: "PATCH", path: `${basePath}/${assetId}/`, body: {} });

  return {
    asset_id: assetId,
    attachment: presign.attachment ?? null,
    status: "uploaded",
  };
}

/** Decodes `content_base64` and delegates to `uploadWorkItemAttachmentBytes`. */
export async function attachWorkItemFile(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  input: AttachWorkItemFileInput
): Promise<Record<string, unknown>> {
  const bytes = Buffer.from(input.content_base64, "base64");
  return uploadWorkItemAttachmentBytes(workspaceSlug, projectId, issueId, {
    name: input.name,
    mime_type: input.mime_type,
    bytes,
  });
}

function mapAttachment(row: Record<string, unknown>): Record<string, unknown> {
  const attributes = recordOf(row.attributes);
  return {
    id: row.id ?? null,
    name: attributes.name ?? row.name ?? null,
    type: attributes.type ?? row.type ?? null,
    size: attributes.size ?? row.size ?? null,
    is_uploaded: row.is_uploaded ?? false,
    created_at: row.created_at ?? null,
    asset_url: row.asset_url ?? null,
  };
}

/**
 * Performs the multipart/form-data POST against the presigned S3 URL using the
 * exact `fields` returned by the backend plus the file part ("file").
 */
async function uploadToPresignedPost(
  url: string,
  fields: Record<string, unknown>,
  bytes: Buffer,
  fileName: string,
  mimeType: string
): Promise<void> {
  const boundary = `----trazo-suite-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`)
    );
  }
  const safeName = fileName.replace(/["\r\n]/g, "");
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    )
  );
  parts.push(bytes);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`La subida al almacenamiento falló (HTTP ${response.status}): ${detail}`);
  }
}

export async function assignWorkItemToCycle(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  cycleId: string
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/`,
    body: { issues: [issueId] },
  });
  return recordOf(data);
}

export async function assignWorkItemToModule(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  moduleId: string
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/modules/`,
    body: { modules: [moduleId] },
  });
  return recordOf(data);
}

export async function updateComment(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  commentId: string,
  commentHtml: string
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "PATCH",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/${commentId}/`,
    body: { comment_html: commentHtml },
  });
  return recordOf(data);
}

export async function deleteComment(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  commentId: string
): Promise<boolean> {
  await apiRequest<unknown>({
    method: "DELETE",
    path: `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/${commentId}/`,
  });
  return true;
}
