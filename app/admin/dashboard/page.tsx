"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase-auth";

type DailyData = {
  date: string;
  orders: number;
  revenue: number;
  expenses: number;
  profit: number;
};

type DashboardData = {
  days?: DailyData[];
  totals?: {
    orders: number;
    revenue: number;
    expenses: number;
    profit: number;
  };
  startDate?: string;
  endDate?: string;
  month?: string;
  error?: string;
};

function getLocalMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value: string) =>
  new Date(`${value}T12:00:00.000Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function OrdersChart({ days }: { days: DailyData[] }) {
  const maximum = Math.max(1, ...days.map((day) => day.orders));
  const plot = { left: 44, right: 884, top: 18, bottom: 220 };
  const slot = (plot.right - plot.left) / days.length;
  const barWidth = Math.max(4, slot * 0.62);
  const labels = days.filter((_, index) => index % 5 === 0 || index === days.length - 1);

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Grafik jumlah order harian untuk bulan yang dipilih"
        viewBox="0 0 900 270"
        className="min-w-[700px] w-full"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const y = plot.bottom - ((plot.bottom - plot.top) * step) / 4;
          return (
            <g key={step}>
              <line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="#E7DCCB" />
              <text x={plot.left - 10} y={y + 4} textAnchor="end" fill="#705B49" fontSize="11">
                {Math.round((maximum * step) / 4)}
              </text>
            </g>
          );
        })}
        {days.map((day, index) => {
          const height = (day.orders / maximum) * (plot.bottom - plot.top);
          const x = plot.left + index * slot + (slot - barWidth) / 2;
          return (
            <rect
              key={day.date}
              x={x}
              y={plot.bottom - height}
              width={barWidth}
              height={Math.max(day.orders ? 2 : 0, height)}
              rx="3"
              fill="#76533F"
            >
              <title>{`${formatDate(day.date)}: ${day.orders} order`}</title>
            </rect>
          );
        })}
        {labels.map((day) => {
          const index = days.indexOf(day);
          return (
            <text
              key={day.date}
              x={plot.left + index * slot + slot / 2}
              y="246"
              textAnchor="middle"
              fill="#705B49"
              fontSize="11"
            >
              {formatDate(day.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function FinanceChart({ days }: { days: DailyData[] }) {
  const values = days.flatMap((day) => [day.revenue, day.expenses, day.profit]);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const range = maximum - minimum || 1;
  const plot = { left: 48, right: 884, top: 18, bottom: 220 };
  const step = (plot.right - plot.left) / Math.max(1, days.length - 1);
  const labels = days.filter((_, index) => index % 5 === 0 || index === days.length - 1);
  const yFor = (value: number) => plot.bottom - ((value - minimum) / range) * (plot.bottom - plot.top);
  const xFor = (index: number) => plot.left + index * step;
  const series = [
    { key: "revenue", label: "Omzet dibayar", color: "#76533F" },
    { key: "expenses", label: "Pengeluaran", color: "#B45309" },
    { key: "profit", label: "Profit", color: "#3F6B4F" },
  ] as const;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label="Grafik omzet dibayar, pengeluaran, dan profit harian untuk bulan yang dipilih"
          viewBox="0 0 900 270"
          className="min-w-[700px] w-full"
        >
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = minimum + (range * tick) / 4;
            const y = yFor(value);
            return (
              <g key={tick}>
                <line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="#E7DCCB" />
                <text x={plot.left - 8} y={y + 4} textAnchor="end" fill="#705B49" fontSize="10">
                  {new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value)}
                </text>
              </g>
            );
          })}
          {series.map((item) => {
            const points = days
              .map((day, index) => `${xFor(index)},${yFor(day[item.key])}`)
              .join(" ");
            return (
              <polyline
                key={item.key}
                points={points}
                fill="none"
                stroke={item.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {labels.map((day) => {
            const index = days.indexOf(day);
            return (
              <text
                key={day.date}
                x={xFor(index)}
                y="246"
                textAnchor="middle"
                fill="#705B49"
                fontSize="11"
              >
                {formatDate(day.date)}
              </text>
            );
          })}
        </svg>
      </div>
    </>
  );
}

export default function AdminDashboardAnalyticsPage() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [currentMonth, setCurrentMonth] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!selectedMonth) return;

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
      console.error("Failed to read admin dashboard session:", sessionError.message);
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
      const response = await fetch(
        `/api/admin/dashboard?month=${encodeURIComponent(selectedMonth)}`,
        {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        },
      );
      const result = (await response.json()) as DashboardData;
      if (response.status === 401) {
        await supabaseAuth.auth.signOut();
        router.replace("/admin/login");
        return;
      }
      if (!response.ok || !Array.isArray(result.days) || !result.totals) {
        throw new Error(result.error ?? "Unable to load dashboard data.");
      }
      setData(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to load admin analytics dashboard:", message);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [router, selectedMonth]);

  useEffect(() => {
    const initializeMonth = window.setTimeout(() => {
      const month = getLocalMonthValue();
      setCurrentMonth(month);
      setSelectedMonth(month);
    }, 0);
    return () => window.clearTimeout(initializeMonth);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadDashboard]);

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

  const totals = data?.totals;
  const monthLabel = data?.month
    ? new Date(`${data.month}-01T12:00:00.000Z`).toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "bulan yang dipilih";

  return (
    <main className="min-h-screen bg-[#F3EDE3] px-4 py-8 text-[#35312D] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#76533F]">Milktyeay · Admin</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Business dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">
              Ringkasan data {monthLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin"
              className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-4 py-2.5 text-sm font-semibold hover:bg-white"
            >
              Order dashboard
            </Link>
            <Link
              href="/admin/expenses"
              className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-4 py-2.5 text-sm font-semibold hover:bg-white"
            >
              Pengeluaran
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-4 py-2.5 text-sm font-semibold hover:bg-white disabled:opacity-60"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </header>

        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-4">
          <label htmlFor="dashboard-month" className="text-sm font-semibold text-slate-700">
            Filter per bulan
          </label>
          <input
            id="dashboard-month"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            max={currentMonth || undefined}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#76533F]"
          />
        </section>

        {errorMessage ? (
          <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {errorMessage}
          </p>
        ) : null}

        {isLoading ? (
          <p role="status" className="mt-7 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5 text-sm text-slate-600">
            Memuat data dashboard...
          </p>
        ) : data ? (
          <>
            <section aria-label={`Ringkasan ${monthLabel}`} className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
                <p className="text-sm font-medium text-slate-600">Jumlah order</p>
                <p className="mt-2 text-2xl font-black">{totals?.orders.toLocaleString("id-ID")}</p>
                <p className="mt-1 text-xs text-slate-500">Semua status order</p>
              </article>
              <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
                <p className="text-sm font-medium text-slate-600">Omzet dibayar</p>
                <p className="mt-2 text-2xl font-black">{formatRupiah(totals?.revenue ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">Pembayaran berstatus paid</p>
              </article>
              <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
                <p className="text-sm font-medium text-slate-600">Pengeluaran</p>
                <p className="mt-2 text-2xl font-black">{formatRupiah(totals?.expenses ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">Dari catatan pengeluaran</p>
              </article>
              <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
                <p className="text-sm font-medium text-slate-600">Profit sederhana</p>
                <p className={`mt-2 text-2xl font-black ${(totals?.profit ?? 0) < 0 ? "text-red-700" : "text-[#3F6B4F]"}`}>
                  {formatRupiah(totals?.profit ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Omzet dibayar − pengeluaran</p>
              </article>
            </section>

            <section className="mt-6 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5 sm:p-6">
              <h2 className="text-xl font-black">Order harian</h2>
              <p className="mt-1 text-sm text-slate-600">Jumlah order dibuat per hari pada {monthLabel}, semua status.</p>
              <div className="mt-5">
                <OrdersChart days={data.days ?? []} />
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5 sm:p-6">
              <h2 className="text-xl font-black">Omzet, pengeluaran &amp; profit</h2>
              <p className="mt-1 text-sm text-slate-600">
                Data harian pada {monthLabel}. Profit sederhana tidak memperhitungkan biaya yang belum dicatat.
              </p>
              <div className="mt-5">
                <FinanceChart days={data.days ?? []} />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
