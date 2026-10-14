/**
 * Copyright (c) 2023-present TrazoSuite Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {
  createExpenseCategory,
  createExpenseEntry,
  createRecurringExpense,
  deleteExpenseEntry,
  listCostCenters,
  listEmployees,
  listExpenseCategories,
  listExpenseEntries,
  listIncome,
  listPayrollRuns,
  listRecurringExpenses,
  updateExpenseEntry,
} from "@trazo-suite/api-client";
import type {
  ExpenseEntryInput,
  ExpenseEntryUpdate,
  ExpenseStateFilter,
  RecurringExpenseInput,
} from "@trazo-suite/api-client";
import type { Command } from "commander";
import { UsageError } from "../errors.js";
import { asRecord, emit, emitText, field, recordToLines, textRequested } from "../output.js";

const EXPENSE_STATES = ["all", "pending", "paid"] as const;
const PERIODICITIES = ["weekly", "monthly", "yearly"] as const;
type Periodicity = (typeof PERIODICITIES)[number];

/** Acumula valores repetibles (`--employees a --employees b` → ["a", "b"]). */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Valida el filtro de estado de gastos contra los que acepta la librería. */
export function toExpenseState(value: string | undefined): ExpenseStateFilter {
  if (value === undefined) return "all";
  const found = EXPENSE_STATES.find((state) => state === value);
  if (found === undefined) {
    throw new UsageError(`Estado inválido: "${value}". Valores válidos: ${EXPENSE_STATES.join(", ")}.`);
  }
  return found;
}

/** Valida la periodicidad de un gasto recurrente. */
export function toPeriodicity(value: string | undefined): Periodicity {
  if (value === undefined) {
    throw new UsageError("Falta la periodicidad: usa --periodicity weekly, monthly o yearly.");
  }
  const found = PERIODICITIES.find((periodicity) => periodicity === value);
  if (found === undefined) {
    throw new UsageError(`Periodicidad inválida: "${value}". Valores válidos: ${PERIODICITIES.join(", ")}.`);
  }
  return found;
}

/** Convierte --active en booleano; sin flag no se envía la clave (decide el backend). */
export function toOptionalBoolean(value: string | undefined, flagName: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new UsageError(`Valor inválido para ${flagName}: "${value}". Usa true o false.`);
}

/** Convierte un flag numérico (--due-day, --due-month) en entero válido. */
export function toInteger(value: string | undefined, flagName: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new UsageError(`Valor inválido para ${flagName}: "${value}". Debe ser un entero.`);
  }
  return parsed;
}

/** Igual que toInteger pero para flags obligatorios. */
export function toRequiredInteger(value: string | undefined, flagName: string): number {
  const parsed = toInteger(value, flagName);
  if (parsed === undefined) {
    throw new UsageError(`Falta ${flagName}.`);
  }
  return parsed;
}

/**
 * El origen del gasto es excluyente: un gasto se imputa a un proyecto O a un
 * cliente, nunca a ambos (validación local antes de tocar la red).
 */
export function assertOriginExclusive(projectId: string | undefined, clientId: string | undefined): void {
  if (projectId !== undefined && clientId !== undefined) {
    throw new UsageError("Usa --project o --client, no ambos: el origen del gasto es excluyente.");
  }
}

type ExpenseCreateOptions = {
  amount: string;
  category: string;
  date: string;
  description?: string | undefined;
  employees?: string[] | undefined;
  currency?: string | undefined;
  paidDate?: string | undefined;
  project?: string | undefined;
  client?: string | undefined;
};

type ExpenseUpdateOptions = {
  amount?: string | undefined;
  category?: string | undefined;
  date?: string | undefined;
  description?: string | undefined;
  employees?: string[] | undefined;
  currency?: string | undefined;
  paidDate?: string | undefined;
  project?: string | undefined;
  client?: string | undefined;
};

function buildExpenseCreateInput(options: ExpenseCreateOptions): ExpenseEntryInput {
  assertOriginExclusive(options.project, options.client);
  return {
    amount: options.amount,
    category_id: options.category,
    date: options.date,
    description: options.description,
    // Sin --employees no se envía la clave: un array vacío borraría asignaciones.
    employee_ids: options.employees !== undefined && options.employees.length > 0 ? options.employees : undefined,
    currency: options.currency,
    paid_date: options.paidDate,
    project_id: options.project,
    client_id: options.client,
  };
}

function buildExpenseUpdateInput(options: ExpenseUpdateOptions): ExpenseEntryUpdate {
  assertOriginExclusive(options.project, options.client);
  return {
    amount: options.amount,
    currency: options.currency,
    category_id: options.category,
    employee_ids: options.employees !== undefined && options.employees.length > 0 ? options.employees : undefined,
    description: options.description,
    date: options.date,
    paid_date: options.paidDate,
    project_id: options.project,
    client_id: options.client,
  };
}

function countSetFields(input: ExpenseEntryUpdate): number {
  return Object.values(input).filter((value) => value !== undefined).length;
}

type RecurringCreateOptions = {
  name: string;
  category: string;
  estimatedMin: string;
  estimatedMax?: string | undefined;
  periodicity?: string | undefined;
  dueDay?: string | undefined;
  dueMonth?: string | undefined;
  employees?: string[] | undefined;
  currency?: string | undefined;
  active?: string | undefined;
};

function formatExpenseLine(row: unknown): string {
  const record = asRecord(row);
  const origin = field(record, "project_name") || field(record, "client_name");
  const paid = record.is_paid === true ? "pagado" : "pendiente";
  return [
    field(record, "id"),
    field(record, "date"),
    field(record, "amount"),
    field(record, "currency"),
    paid,
    origin,
    field(record, "description"),
  ].join("\t");
}

export function registerFinanceCommands(program: Command): void {
  const finance = program
    .command("finance")
    .description("Área de Finanzas (solo admins del workspace — el backend rechaza con 403 a cualquier otro rol)");

  finance
    .command("cost-centers")
    .description("Centros de coste: proyectos y clientes del workspace.")
    .command("list")
    .description("Lista los centros de coste (proyectos y clientes).")
    .argument("<workspace_slug>", "slug del workspace")
    .action(async (workspaceSlug: string) => {
      const result = await listCostCenters(workspaceSlug);
      if (textRequested(program)) {
        const lines = ["PROYECTOS"];
        for (const project of result.projects) {
          const record = asRecord(project);
          lines.push(`${field(record, "id")}\t${field(record, "name")}\t${field(record, "identifier")}`);
        }
        lines.push("CLIENTES");
        for (const client of result.clients) {
          const record = asRecord(client);
          lines.push(`${field(record, "id")}\t${field(record, "name")}\t${field(record, "currency")}`);
        }
        emitText(lines);
        return;
      }
      emit(result);
    });

  const expense = finance.command("expense").description("Gastos del workspace.");

  expense
    .command("list")
    .description("Lista los gastos, con filtro opcional por estado de pago.")
    .argument("<workspace_slug>", "slug del workspace")
    .option("--state <estado>", "filtra por estado: all (por defecto), pending o paid", "all")
    .action(async (workspaceSlug: string, options: { state: string }) => {
      const rows = await listExpenseEntries(workspaceSlug, toExpenseState(options.state));
      if (textRequested(program)) {
        emitText(rows.map((row) => formatExpenseLine(row)));
        return;
      }
      emit(rows);
    });

  expense
    .command("create")
    .description("Registra un gasto con origen en un proyecto o en un cliente.")
    .argument("<workspace_slug>", "slug del workspace")
    .requiredOption("--amount <monto>", "monto del gasto (por ejemplo 149.99)")
    .requiredOption("--category <category_id>", "id de la categoría de gasto")
    .requiredOption("--date <fecha>", "fecha del gasto (YYYY-MM-DD)")
    .option("--description <texto>", "descripción del gasto")
    .option("--employees <employee_id>", "id de empleado asociado (repetible)", collect, [])
    .option("--currency <moneda>", "moneda (por ejemplo MXN, USD)")
    .option("--paid-date <fecha>", "fecha de pago (YYYY-MM-DD)")
    .option("--project <project_id>", "id del proyecto origen del gasto")
    .option("--client <client_id>", "id del cliente origen del gasto")
    .action(async (workspaceSlug: string, options: ExpenseCreateOptions) => {
      const result = await createExpenseEntry(workspaceSlug, buildExpenseCreateInput(options));
      if (textRequested(program)) {
        emitText(recordToLines(result));
        return;
      }
      emit(result);
    });

  expense
    .command("update")
    .description("Actualiza campos de un gasto.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<entry_id>", "id del gasto")
    .option("--amount <monto>", "nuevo monto")
    .option("--category <category_id>", "id de la nueva categoría")
    .option("--date <fecha>", "nueva fecha (YYYY-MM-DD)")
    .option("--description <texto>", "nueva descripción")
    .option("--employees <employee_id>", "id de empleado asociado (repetible, reemplaza la lista actual)", collect, [])
    .option("--currency <moneda>", "nueva moneda")
    .option("--paid-date <fecha>", "fecha de pago (YYYY-MM-DD)")
    .option("--project <project_id>", "id del proyecto origen del gasto")
    .option("--client <client_id>", "id del cliente origen del gasto")
    .action(async (workspaceSlug: string, entryId: string, options: ExpenseUpdateOptions) => {
      const input = buildExpenseUpdateInput(options);
      if (countSetFields(input) === 0) {
        throw new UsageError(
          "No hay nada que actualizar: indica al menos un campo (--amount, --category, --date, --description, --employees, --currency, --paid-date, --project, --client)."
        );
      }
      const result = await updateExpenseEntry(workspaceSlug, entryId, input);
      if (textRequested(program)) {
        emitText(recordToLines(result));
        return;
      }
      emit(result);
    });

  expense
    .command("delete")
    .description("Elimina un gasto.")
    .argument("<workspace_slug>", "slug del workspace")
    .argument("<entry_id>", "id del gasto")
    .action(async (workspaceSlug: string, entryId: string) => {
      await deleteExpenseEntry(workspaceSlug, entryId);
      if (textRequested(program)) {
        emitText([`Eliminado ${entryId}`]);
        return;
      }
      emit({ deleted: true, id: entryId });
    });

  const expenseCategory = finance.command("expense-category").description("Categorías de gasto.");

  expenseCategory
    .command("list")
    .description("Lista las categorías de gasto.")
    .argument("<workspace_slug>", "slug del workspace")
    .action(async (workspaceSlug: string) => {
      const rows = await listExpenseCategories(workspaceSlug);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "name")}\t${field(record, "expense_count")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  expenseCategory
    .command("create")
    .description("Crea una categoría de gasto.")
    .argument("<workspace_slug>", "slug del workspace")
    .requiredOption("--name <nombre>", "nombre de la categoría")
    .action(async (workspaceSlug: string, options: { name: string }) => {
      const result = await createExpenseCategory(workspaceSlug, options.name);
      if (textRequested(program)) {
        emitText([`Categoría creada: ${field(result, "id")}`]);
        return;
      }
      emit(result);
    });

  const recurring = finance.command("recurring").description("Gastos recurrentes.");

  recurring
    .command("list")
    .description("Lista los gastos recurrentes.")
    .argument("<workspace_slug>", "slug del workspace")
    .action(async (workspaceSlug: string) => {
      const rows = await listRecurringExpenses(workspaceSlug);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "name")}\t${field(record, "periodicity")}\t${field(record, "amount_estimated")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  recurring
    .command("create")
    .description("Crea un gasto recurrente.")
    .argument("<workspace_slug>", "slug del workspace")
    .requiredOption("--name <nombre>", "nombre del gasto recurrente")
    .requiredOption("--category <category_id>", "id de la categoría de gasto")
    .requiredOption("--estimated-min <monto>", "monto mínimo estimado")
    .option("--estimated-max <monto>", "monto máximo estimado")
    .requiredOption("--periodicity <periodicidad>", "periodicidad: weekly, monthly o yearly")
    .requiredOption("--due-day <día>", "día de vencimiento (entero; mensual/anual: día del mes)")
    .option("--due-month <mes>", "mes de vencimiento para periodicidad yearly (entero)")
    .option("--employees <employee_id>", "id de empleado asociado (repetible)", collect, [])
    .option("--currency <moneda>", "moneda (por ejemplo MXN, USD)")
    .option("--active <bool>", "si el gasto recurrente está activo: true o false")
    .action(async (workspaceSlug: string, options: RecurringCreateOptions) => {
      const input: RecurringExpenseInput = {
        name: options.name,
        category_id: options.category,
        estimated_min: options.estimatedMin,
        estimated_max: options.estimatedMax,
        periodicity: toPeriodicity(options.periodicity),
        due_day: toRequiredInteger(options.dueDay, "--due-day"),
        due_month: toInteger(options.dueMonth, "--due-month") ?? null,
        employee_ids: options.employees !== undefined && options.employees.length > 0 ? options.employees : undefined,
        currency: options.currency,
        active: toOptionalBoolean(options.active, "--active"),
      };
      const result = await createRecurringExpense(workspaceSlug, input);
      if (textRequested(program)) {
        emitText([`Gasto recurrente creado: ${field(result, "id")}`]);
        return;
      }
      emit(result);
    });

  finance
    .command("income")
    .description("Ingresos del workspace.")
    .command("list")
    .description("Lista los ingresos (contratos y cobros).")
    .argument("<workspace_slug>", "slug del workspace")
    .action(async (workspaceSlug: string) => {
      const rows = await listIncome(workspaceSlug);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "contract_number")}\t${field(record, "client_name")}\t${field(record, "amount")}\t${field(record, "currency")}\t${field(record, "due_date")}\t${field(record, "state")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  finance
    .command("employee")
    .description("Empleados del workspace.")
    .command("list")
    .description("Lista los empleados.")
    .argument("<workspace_slug>", "slug del workspace")
    .action(async (workspaceSlug: string) => {
      const rows = await listEmployees(workspaceSlug);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "name")}\t${field(record, "employee_code")}\t${field(record, "pay_frequency")}`;
          })
        );
        return;
      }
      emit(rows);
    });

  finance
    .command("payroll")
    .description("Nómina del workspace.")
    .command("list")
    .description("Lista las corridas de nómina.")
    .argument("<workspace_slug>", "slug del workspace")
    .action(async (workspaceSlug: string) => {
      const rows = await listPayrollRuns(workspaceSlug);
      if (textRequested(program)) {
        emitText(
          rows.map((row) => {
            const record = asRecord(row);
            return `${field(record, "id")}\t${field(record, "period_start")}\t${field(record, "period_end")}\t${field(record, "cadence")}\t${field(record, "state")}\t${field(record, "totals")}`;
          })
        );
        return;
      }
      emit(rows);
    });
}
