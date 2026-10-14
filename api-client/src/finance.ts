/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { apiRequest } from "./client.js";

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results;
  }
  return [];
}

const base = (workspaceSlug: string) => `/api/workspaces/${workspaceSlug}/finance`;

export async function listExpenseCategories(workspaceSlug: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `${base(workspaceSlug)}/expense-categories/` });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return { id: r.id, name: r.name, expense_count: r.expense_count ?? 0 };
  });
}

export async function createExpenseCategory(workspaceSlug: string, name: string): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${base(workspaceSlug)}/expense-categories/`,
    body: { name },
  });
  return recordOf(data);
}

export type ExpenseStateFilter = "all" | "pending" | "paid";

type ListedExpenseEntry = {
  id: unknown;
  amount: unknown;
  currency: unknown;
  category_id: unknown;
  date: unknown;
  is_paid: boolean;
  paid_date: unknown;
  employee_ids: unknown;
  origin_id: unknown;
  description: unknown;
  project_id: unknown;
  client_id: unknown;
  project_name: unknown;
  client_name: unknown;
};

export async function listExpenseEntries(workspaceSlug: string, state: ExpenseStateFilter = "all"): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `${base(workspaceSlug)}/expense-entries/` });
  const rows = toArray(data).map((row): ListedExpenseEntry => {
    const r = recordOf(row);
    const paid_date = r.paid_date ?? null;
    const is_paid = r.is_paid === true || paid_date !== null;
    return {
      id: r.id,
      amount: r.amount ?? null,
      currency: r.currency ?? null,
      category_id: r.category_id ?? null,
      date: r.date ?? null,
      is_paid,
      paid_date,
      employee_ids: r.employee_ids ?? [],
      origin_id: r.origin_id ?? null,
      description: r.description ?? "",
      project_id: r.project_id ?? null,
      client_id: r.client_id ?? null,
      project_name: r.project_name ?? null,
      client_name: r.client_name ?? null,
    };
  });
  if (state === "pending") return rows.filter((row) => !row.is_paid);
  if (state === "paid") return rows.filter((row) => row.is_paid);
  return rows;
}

export type ExpenseEntryInput = {
  amount: string | number;
  category_id: string;
  date: string;
  description?: string | undefined;
  employee_ids?: string[] | undefined;
  currency?: string | undefined;
  paid_date?: string | null | undefined;
  project_id?: string | null | undefined;
  client_id?: string | null | undefined;
};

export async function createExpenseEntry(
  workspaceSlug: string,
  input: ExpenseEntryInput
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${base(workspaceSlug)}/expense-entries/`,
    body: { ...input },
  });
  return recordOf(data);
}

export type ExpenseEntryUpdate = {
  amount?: string | number | undefined;
  currency?: string | undefined;
  category_id?: string | undefined;
  employee_ids?: string[] | undefined;
  description?: string | null | undefined;
  date?: string | undefined;
  paid_date?: string | null | undefined;
  project_id?: string | null | undefined;
  client_id?: string | null | undefined;
};

export async function updateExpenseEntry(
  workspaceSlug: string,
  entryId: string,
  input: ExpenseEntryUpdate
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "PATCH",
    path: `${base(workspaceSlug)}/expense-entries/${entryId}/`,
    body: { ...input },
  });
  return recordOf(data);
}

export async function deleteExpenseEntry(workspaceSlug: string, entryId: string): Promise<boolean> {
  await apiRequest<unknown>({
    method: "DELETE",
    path: `${base(workspaceSlug)}/expense-entries/${entryId}/`,
  });
  return true;
}

export type RecurringExpenseInput = {
  name: string;
  category_id: string;
  estimated_min: string | number;
  estimated_max?: string | number | undefined;
  employee_ids?: string[] | undefined;
  currency?: string | undefined;
  periodicity: "weekly" | "monthly" | "yearly";
  due_day: number;
  due_month?: number | null | undefined;
  active?: boolean | undefined;
};

export async function createRecurringExpense(
  workspaceSlug: string,
  input: RecurringExpenseInput
): Promise<Record<string, unknown>> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${base(workspaceSlug)}/recurring-expenses/`,
    body: { ...input },
  });
  return recordOf(data);
}

export async function listFinanceProjects(workspaceSlug: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `${base(workspaceSlug)}/projects/` });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return { id: r.id, name: r.name ?? null, identifier: r.identifier ?? null, client_id: r.client_id ?? null };
  });
}

export async function listFinanceClients(workspaceSlug: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `${base(workspaceSlug)}/clients/` });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return { id: r.id, name: r.name ?? null, currency: r.currency ?? null };
  });
}

export async function listCostCenters(workspaceSlug: string): Promise<{ projects: unknown[]; clients: unknown[] }> {
  const [projects, clients] = await Promise.all([
    listFinanceProjects(workspaceSlug),
    listFinanceClients(workspaceSlug),
  ]);
  return { projects, clients };
}

export async function listRecurringExpenses(workspaceSlug: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `${base(workspaceSlug)}/recurring-expenses/` });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return {
      id: r.id,
      name: r.name,
      amount_estimated: r.estimated_min ?? r.estimated_max ?? null,
      periodicity: r.periodicity ?? null,
      category_id: r.category_id ?? null,
    };
  });
}

export async function listEmployees(workspaceSlug: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `${base(workspaceSlug)}/employees/` });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return {
      id: r.id,
      name: r.name ?? null,
      employee_code: r.employee_code ?? null,
      pay_frequency: r.pay_frequency ?? null,
    };
  });
}

export async function listIncome(workspaceSlug: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `${base(workspaceSlug)}/income/` });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return {
      id: r.id,
      contract_number: r.contract_number ?? null,
      contract_title: r.contract_title ?? null,
      client_name: r.client_name ?? null,
      amount: r.amount ?? null,
      currency: r.currency ?? null,
      due_date: r.due_date ?? null,
      paid_date: r.paid_date ?? null,
      state: r.state ?? null,
      is_overdue: r.is_overdue ?? false,
    };
  });
}

export async function listPayrollRuns(workspaceSlug: string): Promise<unknown[]> {
  const data = await apiRequest<unknown>({ method: "GET", path: `${base(workspaceSlug)}/payroll/runs/` });
  return toArray(data).map((row) => {
    const r = recordOf(row);
    return {
      id: r.id,
      period_start: r.period_start ?? null,
      period_end: r.period_end ?? null,
      cadence: r.cadence ?? null,
      state: r.state ?? null,
      totals: r.totals ?? [],
    };
  });
}
