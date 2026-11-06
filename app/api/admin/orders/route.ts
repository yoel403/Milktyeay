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
const orderFilters = new Set(["all", "success", "cancel", "pending", "process"]);

type SummaryOrder = {
  total: number | string;
  status: string;
  payment_status: string;
  order_items: {
    product_name: string;
    size: string;
    quantity: number;
    unit_price: number | string;
    toppings: unknown;
  }[];
};

type ProductSize = {
  label: string;
  volume: string;
};

type ActiveProduct = {
  id: number;
  name: string;
  sizes: ProductSize[];
};

function parseProductSizes(value: unknown): ProductSize[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((size): ProductSize[] => {
    if (typeof size !== "object" || size === null || Array.isArray(size)) return [];
    const option = size as Record<string, unknown>;
    const label = typeof option.label === "string" ? option.label.trim() : "";
    const volume = typeof option.volume === "string" ? option.volume.trim() : "";
    if (!label) return [];
    return [{ label, volume }];
  });
}

type OrderFilter = "success" | "cancel" | "pending" | "process";

function getOrderFilter(order: Pick<SummaryOrder, "status" | "payment_status">): OrderFilter | null {
  if (["cancelled", "failed", "expired"].includes(order.payment_status)) return "cancel";
  if (order.status === "done") return "success";
  if (order.payment_status === "pending") return "pending";
  if (order.payment_status === "paid") return "process";
  return null;
}

async function loadOrderSummary(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const summaryPageSize = 500;
  let offset = 0;
  let totalOrders = 0;
  let paidRevenue = 0;
  let pendingOrders = 0;
  const createStatusSummary = () => ({
    orderCount: 0,
    totalQuantity: 0,
    totalAmount: 0,
    menuSales: new Map<
      string,
      { productName: string; size: string; quantity: number; revenue: number }
    >(),
  });
  const statusBreakdown = {
    all: createStatusSummary(),
    success: createStatusSummary(),
    cancel: createStatusSummary(),
    pending: createStatusSummary(),
    process: createStatusSummary(),
  };
  const toppingSales = new Map<
    string,
    { name: string; quantity: number }
  >();

  while (true) {
    const { data, error, count } = await supabase
      .from("orders")
      .select("total, status, payment_status, order_items (product_name, size, quantity, unit_price, toppings)", {
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

      const filter = getOrderFilter(order);
      const summaries = filter
        ? [statusBreakdown.all, statusBreakdown[filter]]
        : [statusBreakdown.all];
      for (const summary of summaries) {
        summary.orderCount += 1;
        summary.totalAmount += Number(order.total) || 0;
      }

      for (const item of order.order_items ?? []) {
        const productName = item.product_name;
        const size = item.size;
        const quantity = Number(item.quantity) || 0;
        const toppings = Array.isArray(item.toppings)
          ? item.toppings.filter((topping): topping is string => typeof topping === "string")
          : [];
        for (const summary of summaries) {
          summary.totalQuantity += quantity;
          const itemRevenue = (Number(item.unit_price) || 0) * quantity;
          const key = `${productName}\u0000${size}`;
          const current = summary.menuSales.get(key) ?? {
            productName,
            size,
            quantity: 0,
            revenue: 0,
          };
          current.quantity += quantity;
          current.revenue += itemRevenue;
          summary.menuSales.set(key, current);
        }

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

  const formattedStatusBreakdown = Object.fromEntries(
    Object.entries(statusBreakdown).map(([status, summary]) => [
      status,
      {
        orderCount: summary.orderCount,
        totalQuantity: summary.totalQuantity,
        totalAmount: summary.totalAmount,
        menuSales: [...summary.menuSales.values()].sort(
          (first, second) => second.quantity - first.quantity,
        ),
      },
    ]),
  );

  return {
    totalOrders,
    paidRevenue,
    pendingOrders,
    statusBreakdown: formattedStatusBreakdown,
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
  if (!orderFilters.has(status)) {
    return Response.json({ error: "Invalid order status filter." }, { status: 400 });
  }
  const search = (url.searchParams.get("search") ?? "")
    .replace(/[^\p{L}\p{N}@.+ -]/gu, "")
    .trim()
    .slice(0, 80);
  const dateSortDirection = url.searchParams.get("dateSortDirection") ?? "desc";
  if (dateSortDirection !== "asc" && dateSortDirection !== "desc") {
    return Response.json({ error: "Invalid order date sort direction." }, { status: 400 });
  }

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

  const loadOrders = (includeDeliveryFields: boolean) => {
    let query = supabase
      .from("orders")
      .select(
        includeDeliveryFields
          ? "id, created_at, customer_name, customer_phone, customer_email, delivery_method, delivery_address, order_date, total, status, payment_status, payment_method, payment_type, qris_proof_path, order_items (id, product_name, size, quantity, toppings, unit_price)"
          : "id, created_at, customer_name, customer_phone, customer_email, total, status, payment_status, payment_method, payment_type, qris_proof_path, order_items (id, product_name, size, quantity, toppings, unit_price)",
        { count: "exact" },
      )
      .order("created_at", { ascending: dateSortDirection === "asc" })
      .order("id", { ascending: dateSortDirection === "asc" })
      .range(requestedOffset, requestedOffset + pageSize - 1);

    if (status === "success") {
      query = query
        .eq("status", "done")
        .neq("payment_status", "cancelled")
        .neq("payment_status", "failed")
        .neq("payment_status", "expired");
    } else if (status === "cancel") {
      query = query.in("payment_status", ["cancelled", "failed", "expired"]);
    } else if (status === "pending") {
      query = query.eq("payment_status", "pending").neq("status", "done");
    } else if (status === "process") {
      query = query.eq("payment_status", "paid").neq("status", "done");
    }
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

    return query;
  };

  let { data, error, count } = await loadOrders(true);
  const hasMissingDeliveryColumns =
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      error.code === "PGRST200") &&
    /(delivery_(method|address)|order_date)/i.test(error.message);

  if (hasMissingDeliveryColumns) {
    console.warn(
      "Admin order delivery columns are missing; loading legacy orders without delivery details. Apply the latest supabase/schema.sql to enable delivery fields.",
    );
    ({ data, error, count } = await loadOrders(false));
  }

  if (error) {
    console.error("Failed to load admin orders:", error.message);
    return Response.json({ error: "Unable to load orders." }, { status: 500 });
  }

  const legacyOrders = (data ?? []) as unknown as Array<Record<string, unknown> & {
    qris_proof_path: string | null;
  }>;
  const orders = legacyOrders.map((order) => ({
    ...order,
    delivery_method: "delivery_method" in order ? order.delivery_method : "pickup",
    delivery_address: "delivery_address" in order ? order.delivery_address : null,
    order_date: "order_date" in order ? order.order_date : null,
  }));

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, name, sizes")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (productsError) {
    console.error("Failed to load active products for admin orders:", productsError.message);
    return Response.json({ error: "Unable to load products for custom orders." }, { status: 500 });
  }

  const products: ActiveProduct[] = ((productRows ?? []) as unknown as {
    id: number | string;
    name: string;
    sizes: unknown;
  }[]).flatMap((product) => {
    const id = Number(product.id);
    if (!Number.isSafeInteger(id) || id <= 0) return [];

    const sizes = parseProductSizes(product.sizes);

    return [{
      id,
      name: product.name,
      sizes: sizes.length ? sizes : [{ label: "Classic", volume: "" }],
    }];
  });

  let summary;
  try {
    summary = await loadOrderSummary(supabase);
  } catch {
    return Response.json({ error: "Unable to load order summary." }, { status: 500 });
  }

  const ordersWithProofs = [];
  for (const order of orders) {
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
    products,
    total: count ?? 0,
    pageSize,
    summary,
  });
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

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return Response.json({ error: "Custom order details are required." }, { status: 400 });
  }

  const input = payload as Record<string, unknown>;
  if (input.customerName !== undefined && typeof input.customerName !== "string") {
    return Response.json({ error: "Customer name must be text." }, { status: 400 });
  }
  const customerName =
    typeof input.customerName === "string" ? input.customerName.trim() : "";
  const paymentStatus = input.paymentStatus;
  const deliveryMethod = input.deliveryMethod ?? "pickup";
  const deliveryAddress =
    typeof input.deliveryAddress === "string" ? input.deliveryAddress.trim() : "";
  const rawItems = input.items;

  if (customerName.length > 100) {
    return Response.json({ error: "Customer name must be 100 characters or fewer." }, { status: 400 });
  }
  if (
    (deliveryMethod !== "pickup" && deliveryMethod !== "delivery") ||
    (deliveryMethod === "delivery" && (!deliveryAddress || deliveryAddress.length > 500))
  ) {
    return Response.json({ error: "A valid delivery method and delivery address are required." }, { status: 400 });
  }
  if (paymentStatus !== "paid" && paymentStatus !== "pending") {
    return Response.json({ error: "Payment status must be paid or pending." }, { status: 400 });
  }
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 30) {
    return Response.json({ error: "Add between 1 and 30 menu items to the custom order." }, { status: 400 });
  }

  const inputItems: { productId: number; size: string; quantity: number; unitPrice: number }[] = [];
  for (const rawItem of rawItems) {
    if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) {
      return Response.json({ error: "Each custom order item must be valid." }, { status: 400 });
    }
    const item = rawItem as Record<string, unknown>;
    const productId = Number(item.productId);
    const size = typeof item.size === "string" ? item.size.trim() : "";
    const quantity = item.quantity;
    const unitPrice = item.unitPrice;
    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !size ||
      size.length > 40 ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 50 ||
      typeof unitPrice !== "number" ||
      !Number.isSafeInteger(unitPrice) ||
      unitPrice < 0 ||
      unitPrice > 2_000_000_000
    ) {
      return Response.json({ error: "Each menu item needs a valid menu, size, quantity, and manual price." }, { status: 400 });
    }
    inputItems.push({ productId, size, quantity, unitPrice });
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Admin custom order configuration error:", error);
    return Response.json({ error: "Admin order access is not configured." }, { status: 503 });
  }

  const productIds = [...new Set(inputItems.map((item) => item.productId))];
  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, name, sizes")
    .eq("is_active", true)
    .in("id", productIds);

  if (productsError) {
    console.error("Failed to verify custom order products:", productsError.message);
    return Response.json({ error: "Unable to verify selected menu items." }, { status: 500 });
  }

  const products = new Map(
    ((productRows ?? []) as unknown as {
      id: number | string;
      name: string;
      sizes: unknown;
    }[]).map((product) => [Number(product.id), product]),
  );
  const pricedItems: {
    productId: number;
    productName: string;
    size: string;
    quantity: number;
    unitPrice: number;
  }[] = [];

  for (const item of inputItems) {
    const product = products.get(item.productId);
    if (!product) {
      return Response.json({ error: "A selected menu item is no longer available." }, { status: 400 });
    }

    const sizes = parseProductSizes(product.sizes);
    const sizeOption = sizes.length
      ? sizes.find((size) => size.label === item.size)
      : item.size === "Classic"
        ? { label: "Classic", volume: "" }
        : undefined;
    if (!sizeOption) {
      return Response.json({ error: "A selected menu size is no longer available." }, { status: 400 });
    }

    pricedItems.push({
      productId: item.productId,
      productName: product.name,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    });
  }

  const total = pricedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (!Number.isSafeInteger(total) || total < 1 || total > 2_000_000_000) {
    return Response.json({ error: "Custom order total must be between Rp1 and Rp2,000,000,000." }, { status: 400 });
  }

  const createOrder = (includeDeliveryFields: boolean) => {
    const orderDetails = {
      customer_name: customerName || null,
      customer_phone: null,
      customer_email: null,
      total,
      status: "pending",
      payment_status: paymentStatus,
      payment_method: "manual",
    };
    const insertPayload = includeDeliveryFields
      ? {
          ...orderDetails,
          delivery_method: deliveryMethod,
          delivery_address: deliveryMethod === "delivery" ? deliveryAddress : null,
        }
      : orderDetails;

    return supabase
      .from("orders")
      .insert(insertPayload)
      .select("id")
      .single();
  };

  let { data: order, error: orderError } = await createOrder(true);
  const missingDeliveryColumns =
    orderError &&
    (orderError.code === "42703" || orderError.code === "PGRST204") &&
    /(delivery_(method|address)|order_date)/i.test(orderError.message);

  if (missingDeliveryColumns && deliveryMethod === "pickup") {
    console.warn(
      "Admin custom order delivery columns are missing; creating pickup order without delivery details. Apply the latest supabase/schema.sql to enable delivery fields.",
    );
    ({ data: order, error: orderError } = await createOrder(false));
  } else if (missingDeliveryColumns) {
    return Response.json(
      { error: "Apply the latest supabase/schema.sql before creating a custom delivery order." },
      { status: 503 },
    );
  }

  if (orderError || !order) {
    console.error("Failed to create admin custom order:", orderError?.message ?? "No order was returned.");
    return Response.json(
      { error: "Unable to create the custom order. Check that the latest Supabase schema is applied." },
      { status: 500 },
    );
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    pricedItems.map((item) => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.productName,
      size: item.size,
      quantity: item.quantity,
      toppings: [],
      unit_price: item.unitPrice,
    })),
  );

  if (itemsError) {
    console.error("Failed to save admin custom order items:", itemsError.message);
    const { error: cleanupError } = await supabase.from("orders").delete().eq("id", order.id);
    if (cleanupError) {
      console.error("Failed to remove incomplete admin custom order:", cleanupError.message);
    }
    return Response.json({ error: "Unable to save custom order items." }, { status: 500 });
  }

  return Response.json({ orderId: order.id }, { status: 201 });
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

export async function DELETE(request: Request) {
  const authorization = await authorizeAdmin(request);
  if (!authorization.authorized) return authorization.response;

  const orderId = new URL(request.url).searchParams.get("orderId");
  if (!orderId || !orderIdPattern.test(orderId)) {
    return Response.json({ error: "A valid order ID is required." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Admin order deletion configuration error:", error);
    return Response.json(
      { error: "Admin order access is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 503 },
    );
  }

  const { data: order, error: lookupError } = await supabase
    .from("orders")
    .select("qris_proof_path")
    .eq("id", orderId)
    .maybeSingle();

  if (lookupError) {
    console.error("Failed to find admin order for deletion:", lookupError.message);
    return Response.json({ error: "Unable to find the order to delete." }, { status: 500 });
  }
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: deletedOrder, error: deleteError } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("Failed to delete admin order:", deleteError.message);
    return Response.json({ error: "Unable to delete the order." }, { status: 500 });
  }
  if (!deletedOrder) {
    return Response.json({ error: "Order was already deleted." }, { status: 404 });
  }

  let warning: string | undefined;
  if (order.qris_proof_path) {
    const { error: proofDeleteError } = await supabase.storage
      .from("qris-payment-proofs")
      .remove([order.qris_proof_path]);
    if (proofDeleteError) {
      console.error("Order deleted but payment proof cleanup failed:", proofDeleteError.message);
      warning = "The order was deleted, but its payment proof could not be removed from storage.";
    }
  }

  return Response.json({ deleted: true, warning });
}
