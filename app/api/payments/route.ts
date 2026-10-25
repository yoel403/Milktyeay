import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

type SizeOption = {
  label: string;
  volume: string;
  price: number;
};

type ToppingOption = {
  name: string;
  price: number;
};

type ProductRow = {
  id: number | string;
  name: string;
  price: number | string;
  sizes: unknown;
  toppings: unknown;
};

type CheckoutItemInput = {
  productId: number;
  size: string;
  toppings: string[];
  quantity: number;
};

type PricedItem = {
  productId: number;
  productName: string;
  size: string;
  toppings: string[];
  quantity: number;
  unitPrice: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptions<T extends { price: number }>(
  value: unknown,
  parse: (option: Record<string, unknown>) => T | null,
): T[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((option) => {
    if (!isRecord(option)) return [];
    const parsed = parse(option);
    return parsed ? [parsed] : [];
  });
}

function parseCustomer(value: unknown) {
  if (!isRecord(value)) return null;

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const phone = typeof value.phone === "string" ? value.phone.trim() : "";
  const email = typeof value.email === "string" ? value.email.trim() : "";

  if (!name || name.length > 100 || !phone || phone.length > 30) return null;
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return null;
  }

  return { name, phone, email: email || null };
}

function parseItems(value: unknown): CheckoutItemInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) return null;

  const items: CheckoutItemInput[] = [];

  for (const item of value) {
    if (!isRecord(item)) return null;

    const productId = Number(item.productId);
    const size = typeof item.size === "string" ? item.size.trim() : "";
    const toppings = item.toppings;
    const quantity = Number(item.quantity);

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !size ||
      size.length > 40 ||
      !Array.isArray(toppings) ||
      toppings.length > 20 ||
      !toppings.every((topping) => typeof topping === "string" && topping.length <= 80) ||
      new Set(toppings).size !== toppings.length ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 50
    ) {
      return null;
    }

    items.push({ productId, size, toppings, quantity });
  }

  return items;
}

function parseSizes(value: unknown): SizeOption[] {
  return parseOptions(value, (option) => {
    const label = typeof option.label === "string" ? option.label : "";
    const volume = typeof option.volume === "string" ? option.volume : "";
    const price = Number(option.price ?? 0);

    return label && volume && Number.isSafeInteger(price) && price >= 0
      ? { label, volume, price }
      : null;
  });
}

function parseToppings(value: unknown): ToppingOption[] {
  return parseOptions(value, (option) => {
    const name = typeof option.name === "string" ? option.name : "";
    const price = Number(option.price ?? 0);

    return name && Number.isSafeInteger(price) && price >= 0 ? { name, price } : null;
  });
}

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const isProduction = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";

  if (!serverKey) {
    return Response.json({ error: "Midtrans is not configured on the server." }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isRecord(payload)) {
    return Response.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  const customer = parseCustomer(payload.customer);
  const inputItems = parseItems(payload.items);

  if (!customer || !inputItems) {
    return Response.json({ error: "Please provide valid customer and order details." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Payment checkout configuration error:", error);
    return Response.json({ error: "Payment checkout is not configured on the server." }, { status: 503 });
  }

  const productIds = [...new Set(inputItems.map((item) => item.productId))];
  const { data, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, sizes, toppings")
    .eq("is_active", true)
    .in("id", productIds);

  if (productsError) {
    console.error("Failed to load products for payment:", productsError.message);
    return Response.json({ error: "Unable to verify the menu. Please try again." }, { status: 500 });
  }

  const products = new Map(
    ((data ?? []) as unknown as ProductRow[]).map((product) => [Number(product.id), product]),
  );

  const pricedItems: PricedItem[] = [];
  for (const item of inputItems) {
    const product = products.get(item.productId);
    if (!product) {
      return Response.json({ error: "A selected drink is no longer available." }, { status: 400 });
    }

    const basePrice = Number(product.price);
    if (!Number.isSafeInteger(basePrice) || basePrice < 0) {
      return Response.json({ error: "A product has an invalid price configuration." }, { status: 500 });
    }

    const sizes = parseSizes(product.sizes);
    const selectedSize = sizes.length
      ? sizes.find((size) => size.label === item.size)
      : item.size === "Classic"
        ? { label: "Classic", volume: "", price: 0 }
        : undefined;

    if (!selectedSize) {
      return Response.json({ error: "A selected drink size is no longer available." }, { status: 400 });
    }

    const toppings = parseToppings(product.toppings);
    const selectedToppings = item.toppings.map((name) =>
      toppings.find((topping) => topping.name === name),
    );
    if (selectedToppings.some((topping) => !topping)) {
      return Response.json({ error: "A selected topping is no longer available." }, { status: 400 });
    }

    const unitPrice =
      basePrice +
      selectedSize.price +
      selectedToppings.reduce((sum, topping) => sum + (topping?.price ?? 0), 0);

    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) {
      return Response.json({ error: "A product has an invalid price configuration." }, { status: 500 });
    }

    pricedItems.push({
      productId: item.productId,
      productName: product.name,
      size: item.size,
      toppings: item.toppings,
      quantity: item.quantity,
      unitPrice,
    });
  }

  const total = pricedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (!Number.isSafeInteger(total) || total < 1 || total > 2_000_000_000) {
    return Response.json({ error: "Order total is outside the supported payment range." }, { status: 400 });
  }

  const orderId = randomUUID();
  const midtransOrderId = `MT-${orderId}`;
  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    midtrans_order_id: midtransOrderId,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_email: customer.email,
    total,
    status: "pending",
    payment_status: "pending",
  });

  if (orderError) {
    console.error("Failed to create payment order:", orderError.message);
    return Response.json({ error: "Unable to create your order. Please try again." }, { status: 500 });
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    pricedItems.map((item) => ({
      order_id: orderId,
      product_id: item.productId,
      product_name: item.productName,
      size: item.size,
      quantity: item.quantity,
      toppings: item.toppings,
      unit_price: item.unitPrice,
    })),
  );

  if (itemsError) {
    console.error("Failed to save payment order items:", itemsError.message);
    const { error: cleanupError } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);
    if (cleanupError) {
      console.error("Failed to remove incomplete payment order:", cleanupError.message);
    }
    return Response.json({ error: "Unable to save your order. Please try again." }, { status: 500 });
  }

  const snapUrl = isProduction
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";

  try {
    const snapResponse = await fetch(snapUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: midtransOrderId,
          gross_amount: total,
        },
        item_details: pricedItems.map((item, index) => ({
          id: `${item.productId}-${index + 1}`,
          price: item.unitPrice,
          quantity: item.quantity,
          name: `${item.productName} (${item.size})`.slice(0, 50),
        })),
        customer_details: {
          first_name: customer.name,
          email: customer.email ?? undefined,
          phone: customer.phone,
        },
      }),
      cache: "no-store",
    });
    const snapResult: unknown = await snapResponse.json();

    if (
      !snapResponse.ok ||
      !isRecord(snapResult) ||
      typeof snapResult.token !== "string"
    ) {
      console.error("Midtrans Snap transaction creation failed:", snapResult);
      const { error: updateError } = await supabase
        .from("orders")
        .update({ payment_status: "error", status: "payment_error" })
        .eq("id", orderId);
      if (updateError) {
        console.error("Failed to mark payment order as errored:", updateError.message);
      }
      return Response.json({ error: "Midtrans could not start the payment. Please try again." }, { status: 502 });
    }

    return Response.json({
      token: snapResult.token,
      orderId,
    });
  } catch (error) {
    console.error("Midtrans Snap request failed:", error);
    const { error: updateError } = await supabase
      .from("orders")
      .update({ payment_status: "error", status: "payment_error" })
      .eq("id", orderId);
    if (updateError) {
      console.error("Failed to mark payment order as errored:", updateError.message);
    }
    return Response.json({ error: "Unable to connect to Midtrans. Please try again." }, { status: 502 });
  }
}
