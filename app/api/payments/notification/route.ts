import { createHash, timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    console.error("Midtrans notification received without a configured server key.");
    return Response.json({ error: "Payment notifications are not configured." }, { status: 503 });
  }

  let notification: unknown;
  try {
    notification = await request.json();
  } catch {
    return Response.json({ error: "Invalid notification body." }, { status: 400 });
  }

  if (!isRecord(notification)) {
    return Response.json({ error: "Invalid notification body." }, { status: 400 });
  }

  const orderId = notification.order_id;
  const statusCode = notification.status_code;
  const grossAmount = notification.gross_amount;
  const signatureKey = notification.signature_key;

  if (
    typeof orderId !== "string" ||
    typeof statusCode !== "string" ||
    typeof grossAmount !== "string" ||
    typeof signatureKey !== "string"
  ) {
    return Response.json({ error: "Notification is missing required fields." }, { status: 400 });
  }

  const expectedSignature = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest();
  const receivedSignature = Buffer.from(signatureKey, "hex");
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return Response.json({ error: "Invalid notification signature." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Payment notification configuration error:", error);
    return Response.json({ error: "Payment notifications are not configured." }, { status: 503 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, total, payment_status")
    .eq("midtrans_order_id", orderId)
    .maybeSingle();

  if (orderError) {
    console.error("Failed to find order for Midtrans notification:", orderError.message);
    return Response.json({ error: "Unable to process payment notification." }, { status: 500 });
  }
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  if (!Number.isFinite(Number(grossAmount)) || Number(grossAmount) !== Number(order.total)) {
    console.error("Midtrans notification amount did not match order:", orderId);
    return Response.json({ error: "Notification amount does not match the order." }, { status: 400 });
  }

  const transactionStatus =
    typeof notification.transaction_status === "string"
      ? notification.transaction_status
      : "";
  const fraudStatus =
    typeof notification.fraud_status === "string" ? notification.fraud_status : "";

  let paymentStatus: string;
  switch (transactionStatus) {
    case "settlement":
      paymentStatus =
        statusCode === "200" && fraudStatus === "accept" ? "paid" : "pending";
      break;
    case "capture":
      paymentStatus =
        statusCode === "200" && fraudStatus === "accept" ? "paid" : "pending";
      break;
    case "pending":
      paymentStatus = "pending";
      break;
    case "deny":
    case "failure":
      paymentStatus = "failed";
      break;
    case "cancel":
      paymentStatus = "cancelled";
      break;
    case "expire":
      paymentStatus = "expired";
      break;
    case "refund":
      paymentStatus = "refunded";
      break;
    case "partial_refund":
      paymentStatus = "partially_refunded";
      break;
    case "chargeback":
      paymentStatus = "chargeback";
      break;
    default:
      return Response.json({ received: true, ignored: true });
  }

  const terminalStatuses = new Set([
    "paid",
    "failed",
    "cancelled",
    "expired",
    "refunded",
    "partially_refunded",
    "chargeback",
  ]);
  if (
    terminalStatuses.has(order.payment_status) &&
    (paymentStatus === "pending" ||
      (order.payment_status === "paid" &&
        ["failed", "cancelled", "expired"].includes(paymentStatus)))
  ) {
    return Response.json({ received: true, ignored: true });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      payment_status: paymentStatus,
      midtrans_transaction_id:
        typeof notification.transaction_id === "string"
          ? notification.transaction_id
          : null,
      payment_type:
        typeof notification.payment_type === "string"
          ? notification.payment_type
          : null,
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("Failed to update order payment status:", updateError.message);
    return Response.json({ error: "Unable to update payment status." }, { status: 500 });
  }

  return Response.json({ received: true });
}
