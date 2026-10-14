/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyStoredCredentials,
  clearCredentials,
  credentialsPath,
  describeTokenSource,
  loadCredentials,
  permissionsWarning,
  saveCredentials,
} from "../src/credentials.js";
import { normalizeUrl, validateCredentials } from "../src/commands/login.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "trazo-creds-"));
  vi.stubEnv("TRAZO_CREDENTIALS_PATH", join(dir, "credentials.json"));
  vi.stubEnv("TRAZO_API_URL", "");
  vi.stubEnv("TRAZO_API_TOKEN", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("credenciales (guardar y cargar)", () => {
  it("guarda y carga en roundtrip", async () => {
    await saveCredentials({ url: "https://www.trazolab.app", token: "tok-1234" });
    expect(await loadCredentials()).toEqual({ url: "https://www.trazolab.app", token: "tok-1234" });
    const raw = await readFile(credentialsPath(), "utf8");
    expect(raw).toContain("tok-1234");
  });

  it("el archivo queda con permisos 0600", async () => {
    await saveCredentials({ url: "https://x", token: "t" });
    const info = await readFile(credentialsPath());
    expect(info.length).toBeGreaterThan(0);
    expect(await permissionsWarning()).toBeNull();
  });

  it("carga devuelve null con archivo ausente o corrupto", async () => {
    expect(await loadCredentials()).toBeNull();
    await writeFile(credentialsPath(), "{ no json", "utf8");
    expect(await loadCredentials()).toBeNull();
  });

  it("carga devuelve null con json incompleto", async () => {
    await writeFile(credentialsPath(), JSON.stringify({ url: "https://x" }), "utf8");
    expect(await loadCredentials()).toBeNull();
  });

  it("logout borra y devuelve false la segunda vez", async () => {
    await saveCredentials({ url: "https://x", token: "t" });
    expect(await clearCredentials()).toBe(true);
    expect(await clearCredentials()).toBe(false);
    expect(await loadCredentials()).toBeNull();
  });

  it("advierte si el archivo es más abierto que 0600", async () => {
    await writeFile(credentialsPath(), JSON.stringify({ url: "u", token: "t" }), "utf8");
    await chmod(credentialsPath(), 0o644);
    expect(await permissionsWarning()).toMatch(/chmod 600/);
  });
});

describe("applyStoredCredentials (precedencia)", () => {
  const stored = { url: "https://store", token: "store-token" };

  it("sin entorno: aplica url y token desde el almacén", () => {
    expect(applyStoredCredentials(stored)).toEqual({ tokenFromStore: true });
    expect(process.env.TRAZO_API_URL).toBe("https://store");
    expect(process.env.TRAZO_API_TOKEN).toBe("store-token");
  });

  it("con token en el entorno: el almacenado no pisa nada", () => {
    vi.stubEnv("TRAZO_API_URL", "https://env");
    vi.stubEnv("TRAZO_API_TOKEN", "env-token");
    expect(applyStoredCredentials(stored)).toEqual({ tokenFromStore: false });
    expect(process.env.TRAZO_API_URL).toBe("https://env");
    expect(process.env.TRAZO_API_TOKEN).toBe("env-token");
  });

  it("sin credenciales almacenadas no toca el entorno", () => {
    expect(applyStoredCredentials(null)).toEqual({ tokenFromStore: false });
    expect(process.env.TRAZO_API_TOKEN).toBe("");
  });
});

describe("describeTokenSource", () => {
  it("ninguna sin token", async () => {
    expect(await describeTokenSource()).toBe("ninguna");
  });

  it("entorno cuando el token no coincide con el almacenado", async () => {
    vi.stubEnv("TRAZO_API_TOKEN", "env-token-abcd");
    expect(await describeTokenSource()).toBe("entorno");
  });

  it("almacenada con últimos 4 caracteres cuando coincide", async () => {
    await saveCredentials({ url: "https://x", token: "trazo-secret-9876" });
    vi.stubEnv("TRAZO_API_TOKEN", "trazo-secret-9876");
    expect(await describeTokenSource()).toBe("almacenada (…9876)");
  });
});

describe("login (validación)", () => {
  it("normalizeUrl quita barras finales", () => {
    expect(normalizeUrl("https://www.trazolab.app///")).toBe("https://www.trazolab.app");
  });

  it("token válido: devuelve el usuario del backend", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ email: "admin@x.test", display_name: "Admin" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const me = await validateCredentials("https://x", "tok");
    expect(me.email).toBe("admin@x.test");
    expect(fetchMock).toHaveBeenCalledWith("https://x/api/users/me/", { headers: { "X-Api-Key": "tok" } });
  });

  it("token inválido (401): UsageError con mensaje claro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(validateCredentials("https://x", "malo")).rejects.toThrow(/no es válido/);
  });

  it("sin conexión: UsageError con la URL incluida", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(validateCredentials("https://x", "tok")).rejects.toThrow(/https:\/\/x/);
  });
});
