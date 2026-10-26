"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase-auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      if (!supabaseAuth) {
        if (isMounted) {
          setErrorMessage("Supabase authentication is not configured.");
          setIsCheckingSession(false);
        }
        return;
      }

      const { data, error } = await supabaseAuth.auth.getSession();
      if (error) {
        console.error("Failed to check admin login session:", error.message);
        if (isMounted) {
          setErrorMessage("Unable to check your login session. Please try again.");
          setIsCheckingSession(false);
        }
        return;
      }

      if (data.session) {
        router.replace("/admin");
        return;
      }
      if (isMounted) setIsCheckingSession(false);
    };

    void checkSession();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabaseAuth) {
      setErrorMessage("Supabase authentication is not configured.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const { error } = await supabaseAuth.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);

    if (error) {
      console.error("Admin sign-in failed:", error.message);
      setErrorMessage("Could not sign in. Check your email and password, and make sure your email is authorized for admin access.");
      return;
    }

    router.replace("/admin");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3EDE3] px-4 py-12 text-[#35312D]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#D6C4AB] bg-[#FBF9F5] p-8 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#76533F]">
          Milktyeay
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Admin login</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Sign in with your authorized Supabase admin account to view orders.
        </p>

        <form onSubmit={handleLogin} className="mt-7 space-y-4">
          <label className="block text-sm font-semibold">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-[#76533F]"
            />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-[#76533F]"
            />
          </label>

          {errorMessage ? (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || isCheckingSession}
            className="w-full rounded-full bg-[#76533F] px-5 py-3 font-bold text-white transition hover:bg-[#624432] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCheckingSession ? "Checking session..." : isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
