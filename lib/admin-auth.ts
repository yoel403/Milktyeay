import "server-only";

import { createClient } from "@supabase/supabase-js";

type AdminAuthorization =
  | { authorized: true; email: string }
  | { authorized: false; response: Response };

export async function authorizeAdmin(request: Request): Promise<AdminAuthorization> {
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!allowedEmails.length) {
    console.error("Admin dashboard authentication is missing ADMIN_EMAILS.");
    return {
      authorized: false,
      response: Response.json(
        { error: "Admin dashboard is not configured. Set ADMIN_EMAILS to the authorized admin email address." },
        { status: 503 },
      ),
    };
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Admin dashboard authentication is missing Supabase URL or anon key.");
    return {
      authorized: false,
      response: Response.json(
        { error: "Admin authentication is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY." },
        { status: 503 },
      ),
    };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return {
      authorized: false,
      response: Response.json({ error: "Authentication is required." }, { status: 401 }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.email) {
    return {
      authorized: false,
      response: Response.json({ error: "Your session is invalid or expired." }, { status: 401 }),
    };
  }

  const email = data.user.email.toLowerCase();
  if (!allowedEmails.includes(email)) {
    return {
      authorized: false,
      response: Response.json({ error: "You are not authorized to access the admin dashboard." }, { status: 403 }),
    };
  }

  return { authorized: true, email };
}
