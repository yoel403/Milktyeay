import { authorizeAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const pageSize = 1000;
const monthPattern = /^(\d{4})-(\d{2})$/;

type DailySummary = {
  date: string;
  orders: number;
  revenue: number;
  expenses: number;
};

function getDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const authorization = await authorizeAdmin(request);
  if (!authorization.authorized) return authorization.response;

  const requestedMonth = new URL(request.url).searchParams.get("month");
  const month = requestedMonth ?? getDateString(new Date()).slice(0, 7);
  const monthMatch = monthPattern.exec(month);
  if (!monthMatch) {
    return Response.json({ error: "A valid month in YYYY-MM format is required." }, { status: 400 });
  }

  const year = Number(monthMatch[1]);
  const monthNumber = Number(monthMatch[2]);
  if (year < 1000 || monthNumber < 1 || monthNumber > 12) {
    return Response.json({ error: "A valid month in YYYY-MM format is required." }, { status: 400 });
  }

  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const endExclusive = new Date(Date.UTC(year, monthNumber, 1));
  const startDate = getDateString(start);
  const endDate = getDateString(new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000));
  const daysToShow = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Admin dashboard configuration error:", error);
    return Response.json({ error: "Admin dashboard access is not configured." }, { status: 503 });
  }

  const daily = new Map<string, DailySummary>();
  for (let index = 0; index < daysToShow; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateString = getDateString(date);
    daily.set(dateString, { date: dateString, orders: 0, revenue: 0, expenses: 0 });
  }

  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select("created_at, total, payment_status")
      .gte("created_at", `${startDate}T00:00:00.000Z`)
      .lt("created_at", endExclusive.toISOString())
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Failed to load admin dashboard orders:", error.message);
      return Response.json({ error: "Unable to load dashboard order data." }, { status: 500 });
    }

    for (const order of data ?? []) {
      const day = daily.get(order.created_at.slice(0, 10));
      if (!day) continue;
      day.orders += 1;
      if (order.payment_status === "paid") day.revenue += Number(order.total) || 0;
    }

    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("expenses")
      .select("expense_date, price, quantity")
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .order("expense_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Failed to load admin dashboard expenses:", error.message);
      return Response.json({ error: "Unable to load dashboard expense data." }, { status: 500 });
    }

    for (const expense of data ?? []) {
      const day = daily.get(expense.expense_date);
      if (!day) continue;
      day.expenses += (Number(expense.price) || 0) * (Number(expense.quantity) || 0);
    }

    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  const days = [...daily.values()].map((day) => ({
    ...day,
    profit: day.revenue - day.expenses,
  }));
  const totals = days.reduce(
    (result, day) => ({
      orders: result.orders + day.orders,
      revenue: result.revenue + day.revenue,
      expenses: result.expenses + day.expenses,
      profit: result.profit + day.profit,
    }),
    { orders: 0, revenue: 0, expenses: 0, profit: 0 },
  );

  return Response.json({ days, totals, startDate, endDate, month });
}
