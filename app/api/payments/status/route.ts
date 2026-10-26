import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("order_id");
  if (
    !orderId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
  ) {
    return Response.json({ error: "A valid order ID is required." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Payment status configuration error:", error);
    return Response.json({ error: "Payment status is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("payment_status, payment_method, qris_proof_path")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("Failed to get order payment status:", error.message);
    return Response.json({ error: "Unable to check payment status." }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  return Response.json({
    paymentStatus: data.payment_status,
    paymentMethod: data.payment_method,
    proofSubmitted: Boolean(data.qris_proof_path),
  });
}
