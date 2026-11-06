"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
type DashboardStatus = "all" | "success" | "cancel" | "pending" | "process";

const dashboardStatuses: { value: DashboardStatus; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "success", label: "Success" },
  { value: "cancel", label: "Cancel" },
  { value: "pending", label: "Pending" },
  { value: "process", label: "Proses" },
];

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
  delivery_method: string | null;
  delivery_address: string | null;
  order_date: string | null;
  total: number | string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_type: string | null;
  proofUrl: string | null;
  order_items: OrderItem[];
};

type ManualOrderProduct = {
  id: number;
  name: string;
  sizes: {
    label: string;
    volume: string;
  }[];
};

type ManualOrderItem = {
  productId: string;
  size: string;
  quantity: string;
  unitPrice: string;
};

type OrdersResponse = {
  orders?: Order[];
  products?: ManualOrderProduct[];
  total?: number;
  pageSize?: number;
  summary?: {
    totalOrders: number;
    paidRevenue: number;
    pendingOrders: number;
    statusBreakdown: Record<
      DashboardStatus,
      {
        orderCount: number;
        totalQuantity: number;
        totalAmount: number;
        menuSales: {
          productName: string;
          size: string;
          quantity: number;
          revenue: number;
        }[];
      }
    >;
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
  const [manualOrderProducts, setManualOrderProducts] = useState<ManualOrderProduct[]>([]);
  const [manualOrderItems, setManualOrderItems] = useState<ManualOrderItem[]>([]);
  const [manualCustomerName, setManualCustomerName] = useState("");
  const [manualDeliveryMethod, setManualDeliveryMethod] = useState<"delivery" | "pickup">("pickup");
  const [manualDeliveryAddress, setManualDeliveryAddress] = useState("");
  const [manualPaymentStatus, setManualPaymentStatus] = useState<"paid" | "pending">("pending");
  const [isCreatingManualOrder, setIsCreatingManualOrder] = useState(false);
  const [manualOrderError, setManualOrderError] = useState<string | null>(null);
  const [totalOrders, setTotalOrders] = useState(0);
  const [summary, setSummary] = useState<OrdersResponse["summary"]>();
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<DashboardStatus>("all");
  const [dateSortDirection, setDateSortDirection] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [isManualOrderFormOpen, setIsManualOrderFormOpen] = useState(false);
  const [statusEdits, setStatusEdits] = useState<Record<string, PaymentStatus>>({});
  const [orderStatusEdits, setOrderStatusEdits] = useState<Record<string, OrderStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [updatingStatusType, setUpdatingStatusType] = useState<"payment" | "order" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orderToDelete || deletingOrderId) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOrderToDelete(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [orderToDelete, deletingOrderId]);

  const loadOrders = useCallback(async (filters?: {
    offset: number;
    status: DashboardStatus;
    search: string;
    dateSortDirection: "asc" | "desc";
  }) => {
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
      offset: String(filters?.offset ?? offset),
      status: filters?.status ?? statusFilter,
      search: filters?.search ?? search,
      dateSortDirection: filters?.dateSortDirection ?? dateSortDirection,
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
      setManualOrderProducts(result.products ?? []);
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
  }, [dateSortDirection, offset, router, search, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOrders(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadOrders]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const addManualOrderItem = () => {
    const firstProduct = manualOrderProducts[0];
    setManualOrderItems((current) => [
      ...current,
      {
        productId: firstProduct ? String(firstProduct.id) : "",
        size: firstProduct?.sizes[0]?.label ?? "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
  };

  const updateManualOrderItem = (index: number, updates: Partial<ManualOrderItem>) => {
    setManualOrderItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  };

  const submitManualOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualOrderError(null);
    if (!supabaseAuth) {
      setManualOrderError("Supabase authentication is not configured.");
      return;
    }

    if (!manualOrderItems.length) {
      setManualOrderError("Add at least one menu item.");
      return;
    }

    const invalidPriceItem = manualOrderItems.some((item) => {
      const unitPrice = Number(item.unitPrice);
      const quantity = Number(item.quantity);
      return (
        !Number.isSafeInteger(unitPrice) ||
        unitPrice < 0 ||
        unitPrice > 2_000_000_000 ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 50
      );
    });
    if (invalidPriceItem) {
      setManualOrderError("Enter a valid whole-number price and quantity for every menu item.");
      return;
    }

    const total = manualOrderItems.reduce(
      (sum, item) => sum + Number(item.unitPrice) * Number(item.quantity),
      0,
    );
    if (!Number.isSafeInteger(total) || total < 1 || total > 2_000_000_000) {
      setManualOrderError("The custom order total must be between Rp1 and Rp2,000,000,000.");
      return;
    }
    if (manualDeliveryMethod === "delivery" && !manualDeliveryAddress.trim()) {
      setManualOrderError("Enter the delivery address for this custom order.");
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabaseAuth.auth.getSession();
    if (sessionError || !session) {
      setManualOrderError("Your login session expired. Please sign in again.");
      router.replace("/admin/login");
      return;
    }

    setIsCreatingManualOrder(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName: manualCustomerName,
          total,
          paymentStatus: manualPaymentStatus,
          deliveryMethod: manualDeliveryMethod,
          deliveryAddress: manualDeliveryAddress,
          items: manualOrderItems.map((item) => ({
            productId: Number(item.productId),
            size: item.size,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        }),
      });
      const result = (await response.json()) as { orderId?: string; error?: string };

      if (response.status === 401) {
        await supabaseAuth.auth.signOut();
        router.replace("/admin/login");
        return;
      }
      if (!response.ok || !result.orderId) {
        throw new Error(result.error ?? "Unable to create the custom order.");
      }

      setManualOrderItems([]);
      setManualCustomerName("");
      setManualDeliveryMethod("pickup");
      setManualDeliveryAddress("");
      setManualPaymentStatus("pending");
      setSuccessMessage(`Custom order ${result.orderId} was created.`);
      setOffset(0);
      setStatusFilter("all");
      setSearch("");
      setSearchInput("");
      await loadOrders({ offset: 0, status: "all", search: "", dateSortDirection });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to create admin custom order:", message);
      setManualOrderError(message);
    } finally {
      setIsCreatingManualOrder(false);
    }
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

  const deleteOrder = async (order: Order) => {
    if (!supabaseAuth) {
      setErrorMessage("Supabase authentication is not configured.");
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

    setDeletingOrderId(order.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(
        `/api/admin/orders?orderId=${encodeURIComponent(order.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const result = (await response.json()) as { error?: string; warning?: string };

      if (response.status === 401) {
        await supabaseAuth.auth.signOut();
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to delete order.");
      }

      if (orders.length === 1 && offset > 0) {
        setOffset((current) => Math.max(0, current - pageSize));
      } else {
        await loadOrders();
      }
      setSuccessMessage(
        result.warning
          ? `${result.warning} Order ID: ${order.id}`
          : `Order ${order.id} and its items were deleted.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to delete admin order:", message);
      setErrorMessage(message);
    } finally {
      setDeletingOrderId(null);
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

  const selectedStatusSummary = summary?.statusBreakdown[statusFilter];

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
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/dashboard"
              className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-5 py-2.5 text-sm font-semibold hover:bg-white"
            >
              Business dashboard
            </Link>
            <Link
              href="/admin/expenses"
              className="rounded-full border border-[#D6C4AB] bg-[#FBF9F5] px-5 py-2.5 text-sm font-semibold hover:bg-white"
            >
              Pencatatan pengeluaran
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

        <section className="mt-7 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-4 sm:p-5">
          <form onSubmit={handleSearch} className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="order-search">Search orders</label>
            <input
              id="order-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search name, phone, email, or order ID"
              className="min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#76533F]"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#76533F] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#624432]"
            >
              Search
            </button>
          </form>
          <nav aria-label="Filter orders by status" className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {dashboardStatuses.map((status) => (
              <button
                key={status.value}
                type="button"
                aria-pressed={statusFilter === status.value}
                onClick={() => {
                  setOffset(0);
                  setStatusFilter(status.value);
                }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  statusFilter === status.value
                    ? "bg-[#76533F] text-white"
                    : "border border-[#D6C4AB] bg-white text-[#624432] hover:bg-[#F3EDE3]"
                }`}
              >
                {status.label}
                {summary ? (
                  <span className="ml-2 text-xs opacity-75">
                    {summary.statusBreakdown[status.value].orderCount}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </section>

        {errorMessage ? (
          <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {successMessage}
          </p>
        ) : null}

        <section className="mt-5 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-4 sm:p-5">
          <button
            type="button"
            aria-expanded={isManualOrderFormOpen}
            aria-controls="custom-order-form"
            onClick={() => setIsManualOrderFormOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-4 text-left"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 rounded-full bg-[#E7DCCB] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#624432]">
                Admin
              </span>
              <span className="truncate text-base font-black">Create custom order</span>
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className={`h-5 w-5 shrink-0 text-[#76533F] transition-transform ${isManualOrderFormOpen ? "rotate-180" : ""}`}
            >
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {isManualOrderFormOpen ? (
          <div id="custom-order-form" className="mt-5 border-t border-[#E5D9C8] pt-5">
          <p className="mb-5 text-sm text-slate-600">
            Choose menu items, set your own price and quantity for each, and the total is calculated automatically.
          </p>
          <form onSubmit={submitManualOrder} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                <span className="mb-1.5 block">Customer name (optional)</span>
                <input
                  type="text"
                  value={manualCustomerName}
                  onChange={(event) => setManualCustomerName(event.target.value)}
                  maxLength={100}
                  placeholder="Customer name"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#76533F]"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                <span className="mb-1.5 block">Payment status</span>
                <select
                  value={manualPaymentStatus}
                  onChange={(event) =>
                    setManualPaymentStatus(event.target.value as "paid" | "pending")
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm capitalize outline-none focus:border-[#76533F]"
                >
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                <span className="mb-1.5 block">Fulfillment</span>
                <select
                  value={manualDeliveryMethod}
                  onChange={(event) =>
                    setManualDeliveryMethod(event.target.value as "delivery" | "pickup")
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm capitalize outline-none focus:border-[#76533F]"
                >
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </select>
              </label>
              {manualDeliveryMethod === "delivery" ? (
                <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                  <span className="mb-1.5 block">Delivery address</span>
                  <textarea
                    value={manualDeliveryAddress}
                    onChange={(event) => setManualDeliveryAddress(event.target.value)}
                    maxLength={500}
                    rows={2}
                    required
                    placeholder="Enter the delivery address"
                    className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#76533F]"
                  />
                </label>
              ) : null}
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-800">Menu items</h3>
                <button
                  type="button"
                  onClick={addManualOrderItem}
                  disabled={!manualOrderProducts.length || isCreatingManualOrder}
                  className="rounded-full border border-[#D6C4AB] bg-white px-4 py-2 text-sm font-semibold text-[#624432] transition hover:bg-[#F3EDE3] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Add menu
                </button>
              </div>

              {manualOrderItems.length ? (
                <div className="mt-3 space-y-3">
                  {manualOrderItems.map((item, index) => {
                    const selectedProduct = manualOrderProducts.find(
                      (product) => String(product.id) === item.productId,
                    );
                    const quantity = Number(item.quantity) || 0;
                    const unitPrice = Number(item.unitPrice) || 0;
                    const lineTotal = unitPrice * quantity;

                    return (
                      <div
                        key={`${index}-${item.productId}`}
                        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_90px_auto_auto] sm:items-end"
                      >
                        <label className="block text-sm font-medium text-slate-700">
                          <span className="mb-1.5 block">Menu</span>
                          <select
                            value={item.productId}
                            onChange={(event) => {
                              const product = manualOrderProducts.find(
                                (candidate) => String(candidate.id) === event.target.value,
                              );
                              updateManualOrderItem(index, {
                                productId: event.target.value,
                                size: product?.sizes[0]?.label ?? "",
                              });
                            }}
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#76533F]"
                          >
                            {manualOrderProducts.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-sm font-medium text-slate-700">
                          <span className="mb-1.5 block">Size</span>
                          <select
                            value={item.size}
                            onChange={(event) =>
                              updateManualOrderItem(index, { size: event.target.value })
                            }
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#76533F]"
                          >
                            {selectedProduct?.sizes.map((size) => (
                              <option key={size.label} value={size.label}>
                                {size.label}{size.volume ? ` (${size.volume})` : ""}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-sm font-medium text-slate-700">
                          <span className="mb-1.5 block">Price per menu (Rp)</span>
                          <input
                            type="number"
                            min={0}
                            max={2_000_000_000}
                            step={1}
                            required
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateManualOrderItem(index, { unitPrice: event.target.value })
                            }
                            placeholder="Enter price"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#76533F]"
                          />
                        </label>

                        <label className="block text-sm font-medium text-slate-700">
                          <span className="mb-1.5 block">Quantity</span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            step={1}
                            required
                            value={item.quantity}
                            onChange={(event) =>
                              updateManualOrderItem(index, { quantity: event.target.value })
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#76533F]"
                          />
                        </label>

                        <div className="flex items-center justify-between gap-3 sm:contents">
                          <p className="text-sm font-semibold text-slate-700 sm:hidden">
                            Line total: {formatRupiah(lineTotal)}
                          </p>
                          <p className="hidden text-right text-xs text-slate-500 sm:block">
                            {formatRupiah(lineTotal)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setManualOrderItems((current) =>
                                current.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                            disabled={isCreatingManualOrder}
                            aria-label={`Remove ${selectedProduct?.name ?? "menu"} from custom order`}
                            className="rounded-full px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  {isLoading
                    ? "Loading available menu items..."
                    : manualOrderProducts.length
                      ? "Add a menu item to start the custom order."
                      : "No active menu items are available for custom orders."}
                </p>
              )}
            </div>

            <div className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <p className="text-sm font-medium text-slate-600">Custom order total</p>
                <p className="mt-1 text-2xl font-black text-[#35312D]">
                  {formatRupiah(
                    manualOrderItems.reduce(
                      (sum, item) =>
                        sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
                      0,
                    ),
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Each menu price is entered manually; the total is calculated from price × quantity.
                </p>
              </div>
              <button
                type="submit"
                disabled={isCreatingManualOrder || !manualOrderProducts.length}
                className="rounded-full bg-[#76533F] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#624432] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingManualOrder ? "Creating order..." : "Create custom order"}
              </button>
            </div>
            {manualOrderError ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {manualOrderError}
              </p>
            ) : null}
          </form>
          </div>
          ) : null}
        </section>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-slate-700">
              {isLoading ? "Loading orders..." : `${totalOrders} order${totalOrders === 1 ? "" : "s"}`}
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="sr-only">Sort orders by date</span>
              <select
                value={dateSortDirection}
                onChange={(event) => {
                  setOffset(0);
                  setDateSortDirection(event.target.value as "asc" | "desc");
                }}
                disabled={isLoading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#76533F] disabled:opacity-50"
              >
                <option value="desc">Date: newest first</option>
                <option value="asc">Date: oldest first</option>
              </select>
            </label>
          </div>
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
              <p className="text-sm font-medium text-slate-600">Pending payments</p>
              <p className="mt-2 text-2xl font-black">{summary.pendingOrders}</p>
            </article>
          </section>
        ) : null}

        {selectedStatusSummary ? (
          <section aria-label="Selected status totals" className="mt-4 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
              <p className="text-sm font-medium text-slate-600">Orders in this status</p>
              <p className="mt-2 text-2xl font-black">{selectedStatusSummary.orderCount}</p>
            </article>
            <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
              <p className="text-sm font-medium text-slate-600">Menu quantity</p>
              <p className="mt-2 text-2xl font-black">{selectedStatusSummary.totalQuantity}</p>
            </article>
            <article className="rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5">
              <p className="text-sm font-medium text-slate-600">Order total</p>
              <p className="mt-2 text-2xl font-black">{formatRupiah(selectedStatusSummary.totalAmount)}</p>
            </article>
          </section>
        ) : null}

        {selectedStatusSummary ? (
          <section className="mt-6 rounded-2xl border border-[#D6C4AB] bg-[#FBF9F5] p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-black">Menu totals · {dashboardStatuses.find((status) => status.value === statusFilter)?.label}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Menu quantities and sales for the selected order status.
                </p>
              </div>
            </div>
            {selectedStatusSummary.menuSales.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="pb-3 pr-4 font-semibold">Menu item</th>
                      <th scope="col" className="pb-3 pr-4 text-right font-semibold">Quantity</th>
                      <th scope="col" className="pb-3 text-right font-semibold">Menu total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedStatusSummary.menuSales.map((item) => (
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
              <p className="mt-4 text-sm text-slate-600">No menu items in this status.</p>
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
                  <p className="mt-1 text-sm text-slate-600">
                    {order.delivery_method === "delivery" ? "Delivery" : "Pickup"}
                    {order.delivery_method === "delivery" && order.delivery_address
                      ? ` · ${order.delivery_address}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(order.created_at).toLocaleString("id-ID")}
                  </p>
                  {order.order_date ? (
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      Order date: {new Date(`${order.order_date}T00:00:00`).toLocaleDateString("id-ID")}
                    </p>
                  ) : null}
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
                      deletingOrderId === order.id ||
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
                      deletingOrderId === order.id ||
                      orderStatusEdits[order.id] === order.status
                    }
                    className="rounded-lg bg-[#76533F] px-4 py-2 text-sm font-bold text-white hover:bg-[#624432] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingOrderId === order.id && updatingStatusType === "order"
                      ? "Saving..."
                      : "Save order"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderToDelete(order)}
                    disabled={deletingOrderId === order.id || updatingOrderId === order.id}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingOrderId === order.id ? "Deleting..." : "Delete order"}
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

        {orderToDelete ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
            <button
              type="button"
              aria-label="Close delete order confirmation"
              onClick={() => setOrderToDelete(null)}
              disabled={deletingOrderId === orderToDelete.id}
              className="absolute inset-0 h-full w-full cursor-default bg-[#24211f]/60 backdrop-blur-sm disabled:cursor-wait"
            />
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-order-title"
              aria-describedby="delete-order-description"
              className="relative z-10 my-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-red-100 bg-[#FBF9F5] p-6 shadow-2xl sm:p-8"
            >
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                disabled={deletingOrderId === orderToDelete.id}
                aria-label="Close"
                className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-[#D6C4AB] text-xl leading-none text-[#624432] transition hover:bg-[#F3EDE3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                ×
              </button>

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-7 w-7">
                  <path
                    d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                Delete order
              </p>
              <h2 id="delete-order-title" className="mt-2 pr-8 text-2xl font-black tracking-tight">
                Are you sure?
              </h2>
              <p id="delete-order-description" className="mt-2 text-sm leading-6 text-slate-600">
                Order for <span className="font-semibold text-[#35312D]">{orderToDelete.customer_name || "this customer"}</span> will be permanently deleted, including its items. This action can&apos;t be undone.
              </p>
              <p className="mt-4 break-all rounded-xl border border-red-100 bg-red-50 px-3 py-2 font-mono text-xs text-red-800">
                {orderToDelete.id}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setOrderToDelete(null)}
                  disabled={deletingOrderId === orderToDelete.id}
                  className="rounded-full border border-[#D6C4AB] px-4 py-3 text-sm font-semibold text-[#624432] transition hover:bg-[#F3EDE3] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const order = orderToDelete;
                    setOrderToDelete(null);
                    void deleteOrder(order);
                  }}
                  disabled={deletingOrderId === orderToDelete.id}
                  className="rounded-full bg-red-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete permanently
                </button>
              </div>
            </section>
          </div>
        ) : null}

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
