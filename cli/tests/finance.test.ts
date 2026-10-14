/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  assertOriginExclusive,
  toExpenseState,
  toInteger,
  toOptionalBoolean,
  toPeriodicity,
  toRequiredInteger,
} from "../src/commands/finance.js";
import { UsageError } from "../src/errors.js";

describe("toExpenseState", () => {
  it("acepta los estados del filtro y default a all", () => {
    expect(toExpenseState("all")).toBe("all");
    expect(toExpenseState("pending")).toBe("pending");
    expect(toExpenseState("paid")).toBe("paid");
    expect(toExpenseState(undefined)).toBe("all");
  });

  it("rechaza estados inválidos", () => {
    expect(() => toExpenseState("cobrado")).toThrow(UsageError);
  });
});

describe("toPeriodicity", () => {
  it("acepta las periodicidades del backend", () => {
    expect(toPeriodicity("weekly")).toBe("weekly");
    expect(toPeriodicity("monthly")).toBe("monthly");
    expect(toPeriodicity("yearly")).toBe("yearly");
  });

  it("rechaza periodicidades inválidas o ausentes", () => {
    expect(() => toPeriodicity("anual")).toThrow(UsageError);
    expect(() => toPeriodicity(undefined)).toThrow(UsageError);
  });
});

describe("toOptionalBoolean", () => {
  it("acepta true/false y devuelve undefined sin flag", () => {
    expect(toOptionalBoolean("true", "--active")).toBe(true);
    expect(toOptionalBoolean("false", "--active")).toBe(false);
    expect(toOptionalBoolean(undefined, "--active")).toBeUndefined();
  });

  it("rechaza valores que no son true/false", () => {
    expect(() => toOptionalBoolean("sí", "--active")).toThrow(UsageError);
  });
});

describe("toInteger / toRequiredInteger", () => {
  it("convierte enteros válidos y devuelve undefined sin flag", () => {
    expect(toInteger("15", "--due-day")).toBe(15);
    expect(toInteger(undefined, "--due-month")).toBeUndefined();
  });

  it("rechaza no enteros y required rechaza ausente", () => {
    expect(() => toInteger("3.5", "--due-day")).toThrow(UsageError);
    expect(() => toInteger("diez", "--due-day")).toThrow(UsageError);
    expect(() => toRequiredInteger(undefined, "--due-day")).toThrow(UsageError);
    expect(toRequiredInteger("7", "--due-day")).toBe(7);
  });
});

describe("assertOriginExclusive", () => {
  it("acepta solo proyecto, solo cliente o ninguno", () => {
    expect(() => assertOriginExclusive("p1", undefined)).not.toThrow();
    expect(() => assertOriginExclusive(undefined, "c1")).not.toThrow();
    expect(() => assertOriginExclusive(undefined, undefined)).not.toThrow();
  });

  it("rechaza project y client a la vez con error de uso", () => {
    expect(() => assertOriginExclusive("p1", "c1")).toThrow(UsageError);
    expect(() => assertOriginExclusive("p1", "c1")).toThrow(/no ambos/);
  });
});
