import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const bucketName = "qris-payment-proofs";
const maxFileSize = 5 * 1024 * 1024;
const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasMatchingFileSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    );
  }
  return false;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxFileSize + 16_384) {
    return Response.json({ error: "Proof image must be 5 MB or smaller." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid proof upload." }, { status: 400 });
  }

  const orderId = formData.get("orderId");
  const file = formData.get("proof");
  if (
    typeof orderId !== "string" ||
    !orderIdPattern.test(orderId) ||
    !(file instanceof File)
  ) {
    return Response.json({ error: "A valid order and proof image are required." }, { status: 400 });
  }
  if (file.size < 1 || file.size > maxFileSize) {
    return Response.json({ error: "Proof image must be between 1 byte and 5 MB." }, { status: 400 });
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  if (!hasMatchingFileSignature(fileBytes, file.type)) {
    return Response.json(
      { error: "Upload a valid JPG, PNG, or WebP image." },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("QRIS proof upload configuration error:", error);
    return Response.json({ error: "Proof uploads are not configured." }, { status: 503 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, payment_status, payment_method, qris_proof_path")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    console.error("Failed to find order for QRIS proof:", orderError.message);
    return Response.json({ error: "Unable to process proof upload." }, { status: 500 });
  }
  if (!order || order.payment_method !== "qris") {
    return Response.json({ error: "QRIS order not found." }, { status: 404 });
  }
  if (order.payment_status !== "pending") {
    return Response.json({ error: "This order can no longer accept payment proof." }, { status: 409 });
  }

  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const fileExtension = extensionByType[file.type];
  if (!fileExtension) {
    return Response.json(
      { error: "Upload a valid JPG, PNG, or WebP image." },
      { status: 400 },
    );
  }

  const storagePath = `${orderId}/${randomUUID()}.${fileExtension}`;
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, fileBytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("Failed to store QRIS payment proof:", uploadError.message);
    return Response.json({ error: "Unable to store payment proof." }, { status: 500 });
  }

  const { data: updatedOrder, error: updateError } = await supabase
    .from("orders")
    .update({ qris_proof_path: storagePath })
    .eq("id", orderId)
    .eq("payment_method", "qris")
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();

  if (updateError || !updatedOrder) {
    const { error: cleanupError } = await supabase.storage
      .from(bucketName)
      .remove([storagePath]);
    if (cleanupError) {
      console.error("Failed to remove unlinked QRIS proof:", cleanupError.message);
    }
    if (updateError) {
      console.error("Failed to link QRIS proof to order:", updateError.message);
      return Response.json({ error: "Unable to submit payment proof." }, { status: 500 });
    }
    return Response.json({ error: "This order can no longer accept payment proof." }, { status: 409 });
  }

  if (order.qris_proof_path) {
    const { error: removeError } = await supabase.storage
      .from(bucketName)
      .remove([order.qris_proof_path]);
    if (removeError) {
      console.error("Failed to remove replaced QRIS proof:", removeError.message);
    }
  }

  return Response.json({ submitted: true });
}
