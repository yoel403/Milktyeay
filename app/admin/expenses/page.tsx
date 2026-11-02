"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase-auth";

type Expense = {
  id: string;
  item_name: string;
  expense_date: string;
  price: number | string;
  quantity: number;
  created_at: string;
};

type ExpensesResponse = {
  expenses?: Expense[];
  error?: string;
};

const formatRupiah = (value: number | string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));

export default function AdminExpensesPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [itemName, setItemName] = useState("");
  const [date, setDate] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    if (!supabaseAuth) {
      setErrorMessage("Supabase authentication is not configured.");
      setIsLoading(false);
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabaseAuth.auth.getSession();
    if (sessionError) {
      console.error("Failed to read admin expense session:", sessionError.message);
      setErrorMessage("Unable to verify your session. Please sign in again.");
      setIsLoading(false);
      router.replace("/admin/login");
      return;
    }
    if (!session) {
      router.replace("/admin/login");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/expenses", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as ExpensesResponse;
      if (response.status === 401) {
        await supabaseAuth.auth.signOut();
        router.replace("/admin/login");
        return;
      }
      if (!response.ok || !Array.isArray(result.expenses)) {
        throw new Error(result.error ?? "Unable to load expenses.");
      }
      setExpenses(result.expenses);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to load admin expenses:", message);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadExpenses(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadExpenses]);

  const totalExpenses = useMemo(
    () => expenses.reduce((total, expense) => total + Number(expense.price) * expense.quantity, 0),
    [expenses],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabaseAuth) {
      setErrorMessage("Supabase authentication is not configured.");
      return;
    }

    const parsedPrice = Number(price);
    const parsedQuantity = Number(quantity);
    if (!Number.isSafeInteger(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage("Harga harus berupa angka bulat lebih dari 0.");
      return;
    }
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity <= 0) {
      setErrorMessage("Jumlah harus berupa angka bulat lebih dari 0.");
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabaseAuth.auth.getSession();
    if (sessionError || !session) {
      setErrorMessage("Your login session expired. Please sign in again.");
      router.replace("/admin/login");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemName: itemName.trim(),
          date,
          price: parsedPrice,
          quantity: parsedQuantity,
        }),
      });
      const result = (await response.json()) as { expense?: Expense; error?: string };
      if (response.status === 401) {
        await supabaseAuth.auth.signOut();
        router.replace("/admin/login");
        return;
      }
      if (!response.ok || !result.expense) {
        throw new Error(result.error ?? "Unable to save expense.");
      }

      setExpenses((current) =>
        [result.expense!, ...current]
          .sort((first, second) =>
            second.expense_date.localeCompare(first.expense_date)
            || second.created_at.localeCompare(first.created_at),
          )
          .slice(0, 100),
      );
      setItemName("");
      setPrice("");
      setQuantity("1");
      setSuccessMessage("Pengeluaran berhasil dicatat.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to save admin expense:", message);
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabaseAuth) return;
    setIsSigningOut(true);
    const { error } = await supabaseAuth.auth.signOut();
    if (error) {
      console.error("Admin sign-out failed:", error.message);
      setErrorMessage("Unable to sign out. Please try again.");
      setIsSigningOut(false);
      return;
    }
    router.replace("/admin/login");
  };

  return (
    <main className="min-h-screen bg-[#F3EDE3] px-4 py-8 text-[#35312D] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#76533F]">Milktyeay · Admin</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Pencatatan pengeluaran</h1>
            <p className="mt-1 text-sm text-slate-600">Catat pembelian barang dan bahan operasional.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/dashboard"
              className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-5 py-2.5 text-sm font-semibold hover:bg-white"
            >
              Business dashboard
            </Link>
            <Link
              href="/admin"
              className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-5 py-2.5 text-sm font-semibold hover:bg-white"
            >
              Order dashboard
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-5 py-2.5 text-sm font-semibold hover:bg-white disabled:opacity-60"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </header>

        <section className="mt-7 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5 sm:p-7">
          <h2 className="text-xl font-black">Tambah pengeluaran</h2>
          <p className="mt-1 text-sm text-slate-600">Isi detail barang atau bahan yang dibeli.</p>
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">
              Nama barang/bahan
              <input
                type="text"
                required
                maxLength={120}
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Contoh: Susu segar"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-[#76533F]"
              />
            </label>
            <label className="text-sm font-semibold">
              Tanggal
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-[#76533F]"
              />
            </label>
            <label className="text-sm font-semibold">
              Harga satuan (Rp)
              <input
                type="number"
                required
                min="1"
                step="1"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="Contoh: 25000"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-[#76533F]"
              />
            </label>
            <label className="text-sm font-semibold">
              Jumlah
              <input
                type="number"
                required
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none focus:border-[#76533F]"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-[#76533F] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#624432] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Menyimpan..." : "Simpan pengeluaran"}
              </button>
            </div>
          </form>

          {errorMessage ? (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              {successMessage}
            </p>
          ) : null}
        </section>

        <section className="mt-7 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Riwayat pengeluaran</h2>
              <p className="mt-1 text-sm text-slate-600">Menampilkan maksimal 100 catatan terbaru.</p>
            </div>
            <p className="text-sm font-semibold text-slate-600">
              Total ditampilkan <span className="ml-1 text-lg font-black text-[#35312D]">{formatRupiah(totalExpenses)}</span>
            </p>
          </div>

          {isLoading ? (
            <p role="status" className="mt-5 text-sm text-slate-600">Memuat catatan pengeluaran...</p>
          ) : expenses.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="pb-3 pr-4 font-semibold">Barang/bahan</th>
                    <th scope="col" className="pb-3 pr-4 font-semibold">Tanggal</th>
                    <th scope="col" className="pb-3 pr-4 text-right font-semibold">Harga satuan</th>
                    <th scope="col" className="pb-3 pr-4 text-right font-semibold">Jumlah</th>
                    <th scope="col" className="pb-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <th scope="row" className="py-3 pr-4 font-semibold">{expense.item_name}</th>
                      <td className="py-3 pr-4">{new Date(`${expense.expense_date}T00:00:00`).toLocaleDateString("id-ID")}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatRupiah(expense.price)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{expense.quantity}</td>
                      <td className="py-3 text-right font-semibold tabular-nums">
                        {formatRupiah(Number(expense.price) * expense.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              Belum ada catatan pengeluaran.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
