import { authorizeAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const pageSize = 100;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string) {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const authorization = await authorizeAdmin(request);
  if (!authorization.authorized) return authorization.response;

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Admin expenses configuration error:", error);
    return Response.json({ error: "Admin expense access is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("expenses")
    .select("id, item_name, expense_date, price, quantity, created_at")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (error) {
    console.error("Failed to load admin expenses:", error.message);
    return Response.json({ error: "Unable to load expenses." }, { status: 500 });
  }

  return Response.json({ expenses: data ?? [], pageSize });
}

export async function POST(request: Request) {
  const authorization = await authorizeAdmin(request);
  if (!authorization.authorized) return authorization.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return Response.json({ error: "Expense details are required." }, { status: 400 });
  }

  const { itemName, date, price, quantity } = payload as Record<string, unknown>;
  if (typeof itemName !== "string" || !itemName.trim() || itemName.trim().length > 120) {
    return Response.json({ error: "Item name must be between 1 and 120 characters." }, { status: 400 });
  }
  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "A valid expense date is required." }, { status: 400 });
  }
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0) {
    return Response.json({ error: "Price must be a positive whole number." }, { status: 400 });
  }
  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > 2_147_483_647
  ) {
    return Response.json({ error: "Quantity must be a positive whole number." }, { status: 400 });
  }
  if (!Number.isSafeInteger(price * quantity)) {
    return Response.json({ error: "Expense total is outside the supported range." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Admin expense creation configuration error:", error);
    return Response.json({ error: "Admin expense access is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      item_name: itemName.trim(),
      expense_date: date,
      price,
      quantity,
    })
    .select("id, item_name, expense_date, price, quantity, created_at")
    .single();

  if (error) {
    console.error("Failed to create admin expense:", error.message);
    return Response.json({ error: "Unable to save expense." }, { status: 500 });
  }

  return Response.json({ expense: data }, { status: 201 });
}
