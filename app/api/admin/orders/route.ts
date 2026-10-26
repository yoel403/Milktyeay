import { authorizeAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const pageSize = 50;
const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paymentStatuses = new Set([
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
  "chargeback",
  "error",
]);
const orderStatuses = new Set(["pending", "progressing", "done"]);

type SummaryOrder = {
  total: number | string;
  payment_status: string;
  order_items: {
    product_name: string;
    size: string;
    quantity: number;
    unit_price: number | string;
    toppings: unknown;
  }[];
};

async function loadOrderSummary(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const summaryPageSize = 500;
  let offset = 0;
  let totalOrders = 0;
  let paidRevenue = 0;
  let pendingOrders = 0;
  const menuSales = new Map<
    string,
    { productName: string; size: string; quantity: number; revenue: number }
  >();
  const toppingSales = new Map<
    string,
    { name: string; quantity: number }
  >();

  while (true) {
    const { data, error, count } = await supabase
      .from("orders")
      .select("total, payment_status, order_items (product_name, size, quantity, unit_price, toppings)", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + summaryPageSize - 1);

    if (error) {
      console.error("Failed to load order summary:", error.message);
      throw new Error("Unable to load order summary.");
    }

    const page = (data ?? []) as unknown as SummaryOrder[];
    totalOrders = count ?? totalOrders;

    for (const order of page) {
      if (order.payment_status === "pending") pendingOrders += 1;
      if (order.payment_status === "paid") paidRevenue += Number(order.total) || 0;

      for (const item of order.order_items ?? []) {
        const productName = item.product_name;
        const size = item.size;
        const quantity = Number(item.quantity) || 0;
        const toppings = Array.isArray(item.toppings)
          ? item.toppings.filter((topping): topping is string => typeof topping === "string")
          : [];
        const itemRevenue =
          order.payment_status === "paid"
            ? (Number(item.unit_price) || 0) * quantity
            : 0;
        const key = `${productName}\u0000${size}`;
        const current = menuSales.get(key) ?? {
          productName,
          size,
          quantity: 0,
          revenue: 0,
        };
        if (order.payment_status === "paid") current.quantity += quantity;
        current.revenue += itemRevenue;
        menuSales.set(key, current);

        for (const toppingName of toppings) {
          const topping = toppingSales.get(toppingName) ?? {
            name: toppingName,
            quantity: 0,
          };
          if (order.payment_status === "paid") topping.quantity += quantity;
          toppingSales.set(toppingName, topping);
        }
      }
    }

    if (page.length < summaryPageSize) break;
    offset += summaryPageSize;
  }

  return {
    totalOrders,
    paidRevenue,
    pendingOrders,
    menuSales: [...menuSales.values()].sort(
      (first, second) => second.quantity - first.quantity,
    ),
    toppingSales: [...toppingSales.values()].sort(
      (first, second) => second.quantity - first.quantity,
    ),
  };
}

export async function GET(request: Request) {
  const authorization = await authorizeAdmin(request);
  if (!authorization.authorized) return authorization.response;

  const url = new URL(request.url);
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    return Response.json({ error: "Invalid page offset." }, { status: 400 });
  }

  const status = url.searchParams.get("status") ?? "all";
  if (status !== "all" && !paymentStatuses.has(status)) {
    return Response.json({ error: "Invalid payment status filter." }, { status: 400 });
  }
  const search = (url.searchParams.get("search") ?? "")
    .replace(/[^\p{L}\p{N}@.+ -]/gu, "")
    .trim()
    .slice(0, 80);

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Admin orders configuration error:", error);
    return Response.json(
      { error: "Admin order access is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 503 },
    );
  }

  let query = supabase
    .from("orders")
    .select(
      "id, created_at, customer_name, customer_phone, customer_email, total, status, payment_status, payment_method, payment_type, qris_proof_path, order_items (id, product_name, size, quantity, toppings, unit_price)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(requestedOffset, requestedOffset + pageSize - 1);

  if (status !== "all") query = query.eq("payment_status", status);
  if (search) {
    const searchPattern = `*${search}*`;
    const conditions = [
      `customer_name.ilike.${searchPattern}`,
      `customer_phone.ilike.${searchPattern}`,
      `customer_email.ilike.${searchPattern}`,
    ];
    if (orderIdPattern.test(search)) conditions.push(`id.eq.${search}`);
    query = query.or(conditions.join(","));
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("Failed to load admin orders:", error.message);
    return Response.json({ error: "Unable to load orders." }, { status: 500 });
  }

  let summary;
  try {
    summary = await loadOrderSummary(supabase);
  } catch {
    return Response.json({ error: "Unable to load order summary." }, { status: 500 });
  }

  const ordersWithProofs = [];
  for (const order of data ?? []) {
    if (!order.qris_proof_path) {
      ordersWithProofs.push({ ...order, proofUrl: null });
      continue;
    }

    const { data: signedUrl, error: proofError } = await supabase.storage
      .from("qris-payment-proofs")
      .createSignedUrl(order.qris_proof_path, 300);
    if (proofError) {
      console.error("Failed to create admin proof link:", proofError.message);
      return Response.json({ error: "Unable to load payment proofs." }, { status: 500 });
    }
    ordersWithProofs.push({ ...order, proofUrl: signedUrl.signedUrl });
  }

  return Response.json({
    orders: ordersWithProofs,
    total: count ?? 0,
    pageSize,
    summary,
  });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAdmin(request);
  if (!authorization.authorized) return authorization.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("orderId" in payload) ||
    typeof payload.orderId !== "string" ||
    !orderIdPattern.test(payload.orderId)
  ) {
    return Response.json({ error: "A valid order ID is required." }, { status: 400 });
  }

  const updates: { payment_status?: string; status?: string } = {};
  if ("paymentStatus" in payload) {
    if (typeof payload.paymentStatus !== "string" || !paymentStatuses.has(payload.paymentStatus)) {
      return Response.json({ error: "Invalid payment status." }, { status: 400 });
    }
    updates.payment_status = payload.paymentStatus;
  }
  if ("orderStatus" in payload) {
    if (typeof payload.orderStatus !== "string" || !orderStatuses.has(payload.orderStatus)) {
      return Response.json({ error: "Invalid order status." }, { status: 400 });
    }
    updates.status = payload.orderStatus;
  }
  if (!Object.keys(updates).length) {
    return Response.json({ error: "A payment status or order status is required." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Admin order update configuration error:", error);
    return Response.json(
      { error: "Admin order access is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", payload.orderId)
    .select("id, payment_status, status")
    .maybeSingle();

  if (error) {
    console.error("Failed to update admin order payment status:", error.message);
    return Response.json({ error: "Unable to update order status." }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  return Response.json({ order: data });
}
