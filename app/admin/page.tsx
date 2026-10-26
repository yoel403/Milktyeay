"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase-auth";

const paymentStatuses = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
  "chargeback",
  "error",
] as const;
const orderStatuses = ["pending", "progressing", "done"] as const;

type PaymentStatus = (typeof paymentStatuses)[number];
type OrderStatus = (typeof orderStatuses)[number];

type OrderItem = {
  id: string;
  product_name: string;
  size: string;
  quantity: number;
  toppings: unknown;
  unit_price: number | string;
};

type Order = {
  id: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  total: number | string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_type: string | null;
  proofUrl: string | null;
  order_items: OrderItem[];
};

type OrdersResponse = {
  orders?: Order[];
  total?: number;
  pageSize?: number;
  summary?: {
    totalOrders: number;
    paidRevenue: number;
    pendingOrders: number;
    menuSales: {
      productName: string;
      size: string;
      quantity: number;
      revenue: number;
    }[];
    toppingSales: {
      name: string;
      quantity: number;
    }[];
  };
  error?: string;
};

const formatRupiah = (value: number | string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));

const formatStatus = (value: string) => value.replaceAll("_", " ");

export default function AdminDashboardPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [summary, setSummary] = useState<OrdersResponse["summary"]>();
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusEdits, setStatusEdits] = useState<Record<string, PaymentStatus>>({});
  const [orderStatusEdits, setOrderStatusEdits] = useState<Record<string, OrderStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [updatingStatusType, setUpdatingStatusType] = useState<"payment" | "order" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!supabaseAuth) {
      setErrorMessage("Supabase authentication is not configured.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    const {
      data: { session },
      error: sessionError,
    } = await supabaseAuth.auth.getSession();

    if (sessionError) {
      console.error("Failed to read admin session:", sessionError.message);
      setErrorMessage("Unable to verify your session. Please sign in again.");
      setIsLoading(false);
      router.replace("/admin/login");
      return;
    }
    if (!session) {
      router.replace("/admin/login");
      return;
    }

    const parameters = new URLSearchParams({
      offset: String(offset),
      status: statusFilter,
      search,
    });
    try {
      const response = await fetch(`/api/admin/orders?${parameters}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as OrdersResponse;

      if (response.status === 401) {
        await supabaseAuth.auth.signOut();
        router.replace("/admin/login");
        return;
      }
      if (!response.ok || !Array.isArray(result.orders)) {
        throw new Error(result.error ?? "Unable to load orders.");
      }

      setOrders(result.orders);
      setTotalOrders(result.total ?? 0);
      setSummary(result.summary);
      setPageSize(result.pageSize ?? 50);
      setStatusEdits(
        Object.fromEntries(
          result.orders
            .filter((order): order is Order & { payment_status: PaymentStatus } =>
              paymentStatuses.includes(order.payment_status as PaymentStatus),
            )
            .map((order) => [order.id, order.payment_status]),
        ),
      );
      setOrderStatusEdits(
        Object.fromEntries(
          result.orders
            .filter((order): order is Order & { status: OrderStatus } =>
              orderStatuses.includes(order.status as OrderStatus),
            )
            .map((order) => [order.id, order.status]),
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to load admin dashboard orders:", message);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [offset, router, search, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOrders(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadOrders]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const updateOrderStatus = async (order: Order, statusType: "payment" | "order") => {
    const paymentStatus = statusEdits[order.id];
    const orderStatus = orderStatusEdits[order.id];
    if (
      !supabaseAuth ||
      (statusType === "payment" && !paymentStatus) ||
      (statusType === "order" && !orderStatus)
    ) return;

    const {
      data: { session },
      error: sessionError,
    } = await supabaseAuth.auth.getSession();
    if (sessionError || !session) {
      setErrorMessage("Your login session expired. Please sign in again.");
      router.replace("/admin/login");
      return;
    }

    setUpdatingOrderId(order.id);
    setUpdatingStatusType(statusType);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          statusType === "payment"
            ? { orderId: order.id, paymentStatus }
            : { orderId: order.id, orderStatus },
        ),
      });
      const result = (await response.json()) as { error?: string };
      if (response.status === 401) {
        await supabaseAuth.auth.signOut();
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(
          result.error ??
            (statusType === "payment"
              ? "Unable to update payment status."
              : "Unable to update order preparation status."),
        );
      }

      await loadOrders();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to update ${statusType} status:`, message);
      setErrorMessage(message);
    } finally {
      setUpdatingOrderId(null);
      setUpdatingStatusType(null);
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#76533F]">
              Milktyeay
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Order dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">Track order progress and payment status.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
            className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-5 py-2.5 text-sm font-semibold hover:bg-white disabled:opacity-60"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </header>

        <section className="mt-7 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-4 sm:p-5">
          <form onSubmit={handleSearch} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <label className="sr-only" htmlFor="order-search">Search orders</label>
            <input
              id="order-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search name, phone, email, or order ID"
              className="min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#76533F]"
            />
            <select
              aria-label="Filter by payment status"
              value={statusFilter}
              onChange={(event) => {
                setOffset(0);
                setStatusFilter(event.target.value);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm capitalize outline-none focus:border-[#76533F]"
            >
              <option value="all">All payment statuses</option>
              {paymentStatuses.map((status) => (
                <option key={status} value={status} className="capitalize">
                  {formatStatus(status)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-[#76533F] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#624432]"
            >
              Search
            </button>
          </form>
        </section>

        {errorMessage ? (
          <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-slate-700">
            {isLoading ? "Loading orders..." : `${totalOrders} order${totalOrders === 1 ? "" : "s"}`}
          </p>
          <button
            type="button"
            onClick={() => void loadOrders()}
            disabled={isLoading}
            className="rounded-full px-4 py-2 text-sm font-semibold text-[#76533F] hover:bg-[#FBF9F5] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {summary ? (
          <section aria-label="Order totals" className="mt-4 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
              <p className="text-sm font-medium text-slate-600">Total orders</p>
              <p className="mt-2 text-2xl font-black">{summary.totalOrders}</p>
            </article>
            <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
              <p className="text-sm font-medium text-slate-600">Confirmed sales</p>
              <p className="mt-2 text-2xl font-black">{formatRupiah(summary.paidRevenue)}</p>
              <p className="mt-1 text-xs text-slate-500">Paid orders only</p>
            </article>
            <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
              <p className="text-sm font-medium text-slate-600">Pending orders</p>
              <p className="mt-2 text-2xl font-black">{summary.pendingOrders}</p>
            </article>
          </section>
        ) : null}

        {summary ? (
          <section className="mt-6 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-black">Menu order totals</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Quantities and sales include paid orders only.
                </p>
              </div>
            </div>
            {summary.menuSales.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="pb-3 pr-4 font-semibold">Menu item</th>
                      <th scope="col" className="pb-3 pr-4 text-right font-semibold">Paid units</th>
                      <th scope="col" className="pb-3 text-right font-semibold">Paid sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.menuSales.map((item) => (
                      <tr key={`${item.productName}-${item.size}`}>
                        <th scope="row" className="py-3 pr-4 font-semibold">
                          {item.productName} <span className="font-normal text-slate-500">({item.size})</span>
                        </th>
                        <td className="py-3 pr-4 text-right tabular-nums">{item.quantity}</td>
                        <td className="py-3 text-right tabular-nums">{formatRupiah(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">No menu items have been ordered yet.</p>
            )}
          </section>
        ) : null}

        {summary ? (
          <section className="mt-6 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5 sm:p-6">
            <h2 className="text-xl font-black">Topping add-on totals</h2>
            <p className="mt-1 text-sm text-slate-600">
              Topping quantities from paid orders only.
            </p>
            {summary.toppingSales.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="pb-3 pr-4 font-semibold">Topping</th>
                      <th scope="col" className="pb-3 text-right font-semibold">Paid quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.toppingSales.map((topping) => (
                      <tr key={topping.name}>
                        <th scope="row" className="py-3 pr-4 font-semibold">{topping.name}</th>
                        <td className="py-3 text-right tabular-nums">{topping.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">No topping add-ons have been ordered yet.</p>
            )}
          </section>
        ) : null}

        <section className="mt-3 space-y-4">
          {!isLoading && orders.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-[#FBF9F5] p-6 text-sm text-slate-600">
              No orders found.
            </p>
          ) : null}

          {orders.map((order) => (
            <article
              key={order.id}
              className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-4 shadow-sm sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs text-slate-500">{order.id}</p>
                  <h2 className="mt-2 text-lg font-bold">{order.customer_name || "Customer"}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {[order.customer_phone, order.customer_email].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(order.created_at).toLocaleString("id-ID")}
                  </p>
                  <p className="mt-2 inline-flex rounded-full bg-[#E7DCCB] px-3 py-1 text-xs font-bold capitalize text-[#624432]">
                    Order: {formatStatus(order.status)}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-lg font-black">{formatRupiah(order.total)}</p>
                  <p className="mt-1 text-sm capitalize text-slate-600">
                    {formatStatus(order.payment_method || "unknown")}
                    {order.payment_type ? ` · ${formatStatus(order.payment_type)}` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Items</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                  {order.order_items.map((item) => (
                    <li key={item.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <span>
                        {item.quantity} × {item.product_name} ({item.size})
                        {Array.isArray(item.toppings) && item.toppings.length
                          ? ` · ${item.toppings.join(", ")}`
                          : ""}
                      </span>
                      <span className="whitespace-nowrap">{formatRupiah(Number(item.unit_price) * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block text-xs font-semibold text-slate-600">
                    Payment status
                    <select
                      value={statusEdits[order.id] ?? "pending"}
                      onChange={(event) =>
                        setStatusEdits((current) => ({
                          ...current,
                          [order.id]: event.target.value as PaymentStatus,
                        }))
                      }
                      className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm capitalize text-slate-900"
                    >
                      {paymentStatuses.map((status) => (
                        <option key={status} value={status} className="capitalize">
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void updateOrderStatus(order, "payment")}
                    disabled={
                      updatingOrderId === order.id ||
                      statusEdits[order.id] === order.payment_status
                    }
                    className="rounded-lg border border-[#D6C4AB] px-3 py-2 text-sm font-semibold text-[#76533F] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingOrderId === order.id && updatingStatusType === "payment"
                      ? "Saving..."
                      : "Save payment"}
                  </button>
                  <label className="block text-xs font-semibold text-slate-600">
                    Order status
                    <select
                      value={orderStatusEdits[order.id] ?? "pending"}
                      onChange={(event) =>
                        setOrderStatusEdits((current) => ({
                          ...current,
                          [order.id]: event.target.value as OrderStatus,
                        }))
                      }
                      className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm capitalize text-slate-900"
                    >
                      {orderStatuses.map((status) => (
                        <option key={status} value={status} className="capitalize">
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void updateOrderStatus(order, "order")}
                    disabled={
                      updatingOrderId === order.id ||
                      orderStatusEdits[order.id] === order.status
                    }
                    className="rounded-lg bg-[#76533F] px-4 py-2 text-sm font-bold text-white hover:bg-[#624432] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingOrderId === order.id && updatingStatusType === "order"
                      ? "Saving..."
                      : "Save order"}
                  </button>
                </div>

                {order.proofUrl ? (
                  <a
                    href={order.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[#D6C4AB] px-4 py-2 text-sm font-semibold text-[#76533F] hover:bg-white"
                  >
                    View payment proof
                  </a>
                ) : order.payment_method === "qris" ? (
                  <span className="text-sm text-slate-500">No payment proof uploaded</span>
                ) : null}
              </div>
            </article>
          ))}
        </section>

        <nav aria-label="Order pages" className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
            disabled={offset === 0 || isLoading}
            className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Previous
          </button>
          <p className="text-xs text-slate-500">
            {totalOrders === 0 ? 0 : offset + 1}–{Math.min(offset + orders.length, totalOrders)} of {totalOrders}
          </p>
          <button
            type="button"
            onClick={() => setOffset((current) => current + pageSize)}
            disabled={offset + pageSize >= totalOrders || isLoading}
            className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      </div>
    </main>
  );
}
