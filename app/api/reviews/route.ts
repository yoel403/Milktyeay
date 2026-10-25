import { createSupabaseAdmin } from "@/lib/supabase-admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isRecord(payload)) {
    return Response.json({ error: "Invalid review submission." }, { status: 400 });
  }

  const review = typeof payload.review === "string" ? payload.review.trim() : "";
  const isAnonymous = payload.isAnonymous;
  const displayName =
    typeof payload.displayName === "string" ? payload.displayName.trim() : "";

  if (
    review.length < 10 ||
    review.length > 1000 ||
    typeof isAnonymous !== "boolean" ||
    (!isAnonymous && (!displayName || displayName.length > 80))
  ) {
    return Response.json(
      { error: "Provide a review of 10 to 1000 characters and a valid display name if not anonymous." },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error("Review submission configuration error:", error);
    return Response.json(
      { error: "Review submissions are not configured on the server." },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("reviews").insert({
    review_text: review,
    display_name: isAnonymous ? null : displayName,
    is_anonymous: isAnonymous,
  });

  if (error) {
    console.error("Failed to save customer review:", error.message);
    return Response.json(
      { error: "Could not save your review. Please try again later." },
      { status: 500 },
    );
  }

  return Response.json(
    { message: "Thank you! Your review has been submitted" },
    { status: 201 },
  );
}
