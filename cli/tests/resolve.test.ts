/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as apiClient from "@trazo-suite/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageError } from "../src/errors.js";
import { isUuid, resolveIssueId, resolveProjectId } from "../src/resolve.js";

vi.mock("@trazo-suite/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@trazo-suite/api-client")>();
  return {
    ...actual,
    listProjects: vi.fn(),
    listWorkItems: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveProjectId", () => {
  it("un uuid pasa tal cual sin llamadas de red", async () => {
    const uuid = "0b7f8c1e-1c1d-4b8e-9a7f-2c3d4e5f6a7b";
    expect(await resolveProjectId("acme", uuid)).toBe(uuid);
    expect(apiClient.listProjects).not.toHaveBeenCalled();
  });

  it("resuelve el identificador del proyecto (sin distinguir mayúsculas)", async () => {
    vi.mocked(apiClient.listProjects).mockResolvedValue([{ id: "uuid-proyecto", name: "Demo", identifier: "DEMO" }]);
    expect(await resolveProjectId("acme", "demo")).toBe("uuid-proyecto");
    expect(apiClient.listProjects).toHaveBeenCalledWith("acme");
  });

  it("falla con UsageError si el identificador no existe", async () => {
    vi.mocked(apiClient.listProjects).mockResolvedValue([]);
    await expect(resolveProjectId("acme", "nope")).rejects.toBeInstanceOf(UsageError);
  });
});

describe("resolveIssueId", () => {
  const projectId = "uuid-proyecto";

  it("un uuid pasa tal cual sin llamadas de red", async () => {
    const uuid = "1b7f8c1e-1c1d-4b8e-9a7f-2c3d4e5f6a7b";
    expect(await resolveIssueId("acme", projectId, uuid)).toBe(uuid);
    expect(apiClient.listWorkItems).not.toHaveBeenCalled();
  });

  it("resuelve el sequence id con y sin prefijo del proyecto", async () => {
    vi.mocked(apiClient.listWorkItems).mockResolvedValue([{ id: "uuid-issue", sequence_id: 12, name: "Tarea" }]);
    expect(await resolveIssueId("acme", projectId, "12")).toBe("uuid-issue");
    expect(await resolveIssueId("acme", projectId, "DEMO-12")).toBe("uuid-issue");
  });

  it("falla con UsageError con un ref que no es uuid ni sequence", async () => {
    await expect(resolveIssueId("acme", projectId, "xyz")).rejects.toBeInstanceOf(UsageError);
  });
});

describe("isUuid", () => {
  it("acepta mayúsculas y minúsculas", () => {
    expect(isUuid("0B7F8C1E-1C1D-4B8E-9A7F-2C3D4E5F6A7B")).toBe(true);
    expect(isUuid("demo")).toBe(false);
  });
});
