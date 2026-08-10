"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import {
  createExpense, updateExpense, submitExpense, approveExpense, rejectExpense, markExpensePaid, type ExpenseInput,
} from "@/lib/domain/expenses";

function inputFromForm(fd: FormData): ExpenseInput {
  return {
    category_id: String(fd.get("category_id") ?? ""),
    expense_date: String(fd.get("expense_date") ?? ""),
    amount: String(fd.get("amount") ?? ""),
    description: String(fd.get("description") ?? ""),
    technician_id: String(fd.get("technician_id") ?? ""),
    vehicle_id: String(fd.get("vehicle_id") ?? ""),
    payment_method: String(fd.get("payment_method") ?? ""),
  };
}

export async function createExpenseAction(fd: FormData): Promise<void> {
  await requirePermission("expense.record");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createExpense(tenantId, sl, inputFromForm(fd));
  revalidatePath("/expenses");
}

export async function updateExpenseAction(fd: FormData): Promise<void> {
  await requirePermission("expense.record");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await updateExpense(await getTenantId(), id, inputFromForm(fd));
  revalidatePath("/expenses");
}

export async function submitExpenseAction(fd: FormData): Promise<void> {
  await requirePermission("expense.record");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await submitExpense(await getTenantId(), id);
  revalidatePath("/expenses");
}

export async function approveExpenseAction(fd: FormData): Promise<void> {
  await requirePermission("expense.approve");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await approveExpense(await getTenantId(), id);
  revalidatePath("/expenses");
}

export async function rejectExpenseAction(fd: FormData): Promise<void> {
  await requirePermission("expense.approve");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await rejectExpense(await getTenantId(), id, String(fd.get("reason") ?? ""));
  revalidatePath("/expenses");
}

export async function payExpenseAction(fd: FormData): Promise<void> {
  await requirePermission("expense.approve");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await markExpensePaid(await getTenantId(), id);
  revalidatePath("/expenses");
}
