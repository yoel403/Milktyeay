"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type SizeOption = {
  label: string;
  volume: string;
  price: number;
};

type Topping = {
  name: string;
  price: number;
  type?: string;
};

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  badge: string;
  description: string;
  accent: string;
  emoji: string;
  imageUrl: string | null;
  sizes: SizeOption[];
  toppings: Topping[];
};

type CartEntry = {
  productId: number;
  size: string;
  toppings: string[];
  quantity: number;
};

const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const buildVariantKey = (productId: number, size: string, toppings: string[]) =>
  `${productId}:${size}:${[...toppings].sort().join("|")}`;

const earthToneProductAccents = [
  "from-[#D6C4AB] via-[#E7DCCB] to-[#F3EDE3]",
  "from-[#C6B49C] via-[#E7DCCB] to-[#F3EDE3]",
  "from-[#C8A987] via-[#E7DCCB] to-[#F3EDE3]",
  "from-[#C7A68D] via-[#E7DCCB] to-[#F3EDE3]",
];

export default function OrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [priceCopyMessage, setPriceCopyMessage] = useState<string | null>(null);
  const [qrisOrderId, setQrisOrderId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      if (!supabase) {
        if (isMounted) {
          setProductLoadError("Supabase is not configured. Add your project URL and anon key to .env.local.");
          setIsLoadingProducts(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("is_active", true)
          .order("id", { ascending: true });

        if (error) {
          console.error("Failed to fetch products from Supabase:", error.message);
          if (isMounted) {
            setProductLoadError(`Could not load products: ${error.message}`);
            setIsLoadingProducts(false);
          }
          return;
        }

        if (!isMounted) {
          return;
        }

        const mappedProducts: Product[] = (data ?? []).map((item: any, index: number) => ({
          id: Number(item.id),
          name: String(item.name),
          category: String(item.category ?? "Beverage"),
          price: Number(item.price ?? 0),
          badge: String(item.badge ?? "Featured"),
          description: String(item.description ?? "Freshly prepared beverage."),
          accent: earthToneProductAccents[index % earthToneProductAccents.length],
          emoji: String(item.emoji ?? "☕"),
          imageUrl:
            typeof item.image_url === "string" && item.image_url.trim()
              ? item.image_url.trim()
              : null,
          sizes: Array.isArray(item.sizes)
            ? item.sizes.map((size: any) => ({
                label: String(size.label ?? "Classic"),
                volume: String(size.volume ?? "500ML"),
                price: Number(size.price ?? 0),
              }))
            : [],
          toppings: Array.isArray(item.toppings)
            ? item.toppings.map((topping: any) => ({
                name: String(topping.name ?? "Custom"),
                price: Number(topping.price ?? 0),
                type: String(topping.type ?? "topping"),
              }))
            : [],
        }));

        setProducts(mappedProducts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to fetch products from Supabase:", message);
        if (isMounted) {
          setProductLoadError(`Could not load products: ${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoadingProducts(false);
        }
      }
    }

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeProduct) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveProduct(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeProduct]);

  const [cart, setCart] = useState<Record<string, CartEntry>>({});

  const openProductOptions = (product: Product) => {
    setActiveProduct(product);
    setSelectedSize(product.sizes[0]?.label ?? "Classic");
    setSelectedToppings([]);
  };

  const toggleTopping = (toppingName: string) => {
    setSelectedToppings((current) =>
      current.includes(toppingName)
        ? current.filter((item) => item !== toppingName)
        : [...current, toppingName],
    );
  };

  const addVariantToCart = () => {
    if (!activeProduct) return;

    const productId = activeProduct.id;
    const size = selectedSize || activeProduct.sizes[0]?.label || "Classic";
    const toppings = selectedToppings;
    const key = buildVariantKey(productId, size, toppings);

    setCart((current) => {
      const existing = current[key];

      return {
        ...current,
        [key]: {
          productId,
          size,
          toppings: [...toppings].sort(),
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });
    setActiveProduct(null);
  };

  const updateVariantQuantity = (variantKey: string, delta: number) => {
    setCart((current) => {
      const existing = current[variantKey];
      if (!existing) return current;

      const nextQuantity = existing.quantity + delta;
      if (nextQuantity <= 0) {
        const { [variantKey]: _, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [variantKey]: { ...existing, quantity: nextQuantity },
      };
    });
  };

  const cartItems = useMemo(
    () => Object.values(cart).map((entry) => ({
      ...entry,
      product: products.find((product) => product.id === entry.productId)!,
    })),
    [cart, products],
  );

  const subtotal = useMemo(
    () =>
      cartItems.reduce((sum, item) => {
        const sizePrice =
          item.product.sizes.find((size) => size.label === item.size)?.price ?? 0;
        const toppingsTotal = item.product.toppings
          .filter((topping) => item.toppings.includes(topping.name))
          .reduce((total, topping) => total + topping.price, 0);

        return sum + (item.product.price + sizePrice + toppingsTotal) * item.quantity;
      }, 0),
    [cartItems],
  );

  const shipping = 0;
  const total = subtotal + shipping;
  const customizationTotal = activeProduct
    ? activeProduct.price +
      (activeProduct.sizes.find((size) => size.label === selectedSize)?.price ?? 0) +
      activeProduct.toppings
        .filter((topping) => selectedToppings.includes(topping.name))
        .reduce((sum, topping) => sum + topping.price, 0)
    : 0;

  const handleCheckout = async () => {
    const trimmedName = customerInfo.name.trim();
    const trimmedPhone = customerInfo.phone.trim();
    const trimmedEmail = customerInfo.email.trim();

    if (cartItems.length === 0) {
      return;
    }

    if (!trimmedName || !trimmedPhone) {
      setCheckoutMessage("Please fill in your name and phone number before checkout.");
      return;
    }

    setIsSubmitting(true);
    setCheckoutMessage(null);

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "qris",
          customer: {
            name: trimmedName,
            phone: trimmedPhone,
            email: trimmedEmail,
          },
          items: cartItems.map((item) => ({
            productId: item.productId,
            size: item.size,
            toppings: item.toppings,
            quantity: item.quantity,
          })),
        }),
      });
      const result = (await response.json()) as {
        orderId?: unknown;
        error?: unknown;
      };

      if (!response.ok || typeof result.orderId !== "string") {
        throw new Error(
          typeof result.error === "string" ? result.error : "Could not start payment.",
        );
      }

      setQrisOrderId(result.orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown payment error";
      console.error("Failed to start payment:", message);
      setCheckoutMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProofUpload = async () => {
    if (!qrisOrderId || !proofFile) {
      setCheckoutMessage("Choose a payment proof image before submitting.");
      return;
    }

    setIsUploadingProof(true);
    setCheckoutMessage(null);
    try {
      const formData = new FormData();
      formData.set("orderId", qrisOrderId);
      formData.set("proof", proofFile);
      const response = await fetch("/api/payments/qris-proof", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { submitted?: unknown; error?: unknown };
      if (!response.ok || result.submitted !== true) {
        throw new Error(
          typeof result.error === "string" ? result.error : "Could not submit payment proof.",
        );
      }

      setProofSubmitted(true);
      router.push(`/thank-you?order_id=${encodeURIComponent(qrisOrderId)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upload error";
      console.error("Failed to submit QRIS payment proof:", message);
      setCheckoutMessage(message);
    } finally {
      setIsUploadingProof(false);
    }
  };

  const copyPaymentAmount = async () => {
    try {
      await navigator.clipboard.writeText(String(Math.round(total)));
      setPriceCopyMessage("Copied!");
    } catch (error) {
      console.error("Failed to copy QRIS payment amount:", error);
      setPriceCopyMessage("Could not copy");
    }
  };

  return (
    <main className="min-h-screen bg-[#F3EDE3] px-4 py-8 text-[#35312D] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between rounded-full border border-[#D6C4AB]/70 bg-[#F3EDE3]/95 px-5 py-3 shadow-sm backdrop-blur-sm">
          <a href="/" className="flex items-center">
            <Image
              src="/milktyeay-logo.png"
              alt="Milktyeay"
              width={602}
              height={382}
              priority
              className="h-12 w-auto object-contain"
            />
          </a>

          <a
            href="/"
            className="rounded-full border border-[#D6C4AB] bg-[#F3EDE3] px-4 py-2 text-sm font-semibold text-[#35312D] transition hover:border-[#76533F] hover:bg-[#FBF9F5]"
          >
            landing page
          </a>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#876443]">Milktyeay menu</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Choose your drink</h1>
              </div>
              <div className="rounded-full bg-[#F3EDE3] px-3 py-1.5 text-sm font-semibold text-[#76533F]">
                Tap a drink to customize
              </div>
            </div>

            {isLoadingProducts ? (
              <p role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                Loading drinks from the menu...
              </p>
            ) : productLoadError ? (
              <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                {productLoadError}
              </p>
            ) : products.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                There are no drinks available right now.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => openProductOptions(product)}
                    className="group flex w-full flex-col rounded-[1.5rem] border border-slate-200 bg-[#faf7f2] p-4 text-left hover:border-[#bca17f] hover:bg-[#f4ede2]"
                  >
                    <div className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br ${product.accent} text-6xl`}>
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          sizes="(max-width: 640px) 100vw, 50vw"
                          className="object-cover"
                        />
                      ) : (
                        product.emoji
                      )}
                    </div>

                    <div className="mt-4 w-full">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{product.category}</p>
                          <h2 className="mt-1 text-lg font-black text-slate-900">{product.name}</h2>
                        </div>
                        <div className="shrink-0 text-base font-black text-slate-900">{formatRupiah(product.price)}</div>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-slate-600">{product.description}</p>
                      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#76533F]">
                        Customize drink <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-8 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#876443]">Customer information</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {!customerInfo.name.trim() || !customerInfo.phone.trim() ? (
                  <div className="mb-1 text-xs font-medium text-amber-700 md:col-span-2">
                    Mandatory fields: Name and Phone Number
                  </div>
                ) : null}

                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Name</span>
                  <input
                    type="text"
                    value={customerInfo.name}
                    onChange={(event) =>
                      setCustomerInfo((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Your full name"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#987451]"
                    required
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Phone number</span>
                  <input
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(event) =>
                      setCustomerInfo((current) => ({ ...current, phone: event.target.value }))
                    }
                    placeholder="08xx-xxxx-xxxx"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#987451]"
                    required
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  <span className="mb-1.5 block">Email (optional)</span>
                  <input
                    type="email"
                    value={customerInfo.email}
                    onChange={(event) =>
                      setCustomerInfo((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="you@example.com"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#987451]"
                  />
                </label>
              </div>
            </div>
          </section>

          <aside className="rounded-[2rem] bg-[#35312D] p-6 text-white shadow-[0_24px_70px_rgba(53,49,45,0.22)]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Order summary</h2>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs uppercase tracking-[0.18em] text-slate-200">
                {cartItems.reduce((sum, entry) => sum + entry.quantity, 0)} items
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {cartItems.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  No drinks in your order yet.
                </div>
              ) : (
                cartItems.map((item) => {
                  const toppingLine = item.toppings.length
                    ? ` + ${item.toppings.join(", ")}`
                    : "";
                  const sizePrice =
                    item.product.sizes.find((size) => size.label === item.size)?.price ?? 0;
                  const itemTotal =
                    (item.product.price +
                      sizePrice +
                      item.product.toppings
                        .filter((topping) => item.toppings.includes(topping.name))
                        .reduce((sum, topping) => sum + topping.price, 0)) *
                    item.quantity;

                  return (
                    <div key={buildVariantKey(item.productId, item.size, item.toppings)} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white">{item.product.name}</div>
                          <div className="text-xs text-slate-300">
                            {item.quantity} × {item.size} / {formatRupiah(item.product.price)}
                            {toppingLine}
                          </div>
                        </div>
                        <div className="font-semibold text-white">{formatRupiah(itemTotal)}</div>
                      </div>

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => updateVariantQuantity(buildVariantKey(item.productId, item.size, item.toppings), -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/15"
                          aria-label={`Remove one ${item.product.name}`}
                        >
                          −
                        </button>
                        <span className="min-w-6 text-center text-sm font-semibold text-white">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateVariantQuantity(buildVariantKey(item.productId, item.size, item.toppings), 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/15"
                          aria-label={`Add one ${item.product.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-bold text-white">
                <span>Total</span>
                <span>{formatRupiah(total)}</span>
              </div>
            </div>

            {qrisOrderId ? (
              <section className="mt-6 rounded-2xl bg-white p-4 text-[#35312D]">
                <h3 className="text-lg font-bold">Pay with static QRIS</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Scan this QRIS with your preferred payment app. Enter the exact amount below;
                  your order is not confirmed until the store verifies your transfer.
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <p className="text-lg font-bold">{formatRupiah(total)}</p>
                  <button
                    type="button"
                    onClick={() => void copyPaymentAmount()}
                    className="rounded-full border border-[#D6C4AB] px-3 py-1.5 text-xs font-semibold text-[#76533F] transition hover:bg-[#F3EDE3]"
                  >
                    Copy
                  </button>
                </div>
                {priceCopyMessage ? (
                  <p role="status" className="mt-1 text-center text-xs text-slate-600">
                    {priceCopyMessage}
                  </p>
                ) : null}
                <Image
                  src="/qris-static.jpg"
                  alt="Static QRIS payment code"
                  width={768}
                  height={913}
                  className="mx-auto mt-3 max-h-[360px] w-auto rounded-xl object-contain"
                />
                <label className="mt-4 block text-sm font-semibold">
                  Upload payment proof (JPG, PNG, or WebP; max 5 MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                    disabled={isUploadingProof}
                    className="mt-2 block w-full text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-[#E7DCCB] file:px-4 file:py-2 file:font-semibold file:text-[#35312D]"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleProofUpload}
                  disabled={!proofFile || isUploadingProof || proofSubmitted}
                  className="mt-4 w-full rounded-full bg-[#76533F] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#624432] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUploadingProof ? "Submitting proof..." : "Submit payment proof"}
                </button>
                {proofSubmitted ? (
                  <p role="status" className="mt-3 text-sm text-emerald-800">
                    Proof received. Your payment is waiting for manual verification.
                  </p>
                ) : null}
              </section>
            ) : null}

            <button
              type="button"
              onClick={handleCheckout}
              disabled={
                isSubmitting ||
                Boolean(qrisOrderId) ||
                cartItems.length === 0 ||
                !customerInfo.name.trim() ||
                !customerInfo.phone.trim()
              }
              className="mt-6 w-full rounded-full bg-[#D6C4AB] px-4 py-3 text-sm font-bold text-[#35312D] transition hover:bg-[#E7D8C3] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Preparing your QRIS order..."
                : qrisOrderId
                  ? "QRIS order created"
                  : "Continue with QRIS"}
            </button>

            {checkoutMessage ? (
              <div
                className={[
                  "mt-4 rounded-2xl border p-3 text-sm",
                  checkoutMessage.includes("success")
                    ? "border-[#c4ad8f]/25 bg-[#c4ad8f]/10 text-[#eadbc8]"
                    : "border-red-400/20 bg-red-500/10 text-red-100",
                ].join(" ")}
              >
                {checkoutMessage}
              </div>
            ) : null}

            {/* <div className="mt-4 rounded-2xl border border-[#c4ad8f]/25 bg-[#c4ad8f]/10 p-3 text-sm text-[#eadbc8]">
              30-day satisfaction guarantee · secure payment
            </div> */}
          </aside>
        </div>
      </div>

      {activeProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <button
            type="button"
            aria-label="Close drink options"
            onClick={() => setActiveProduct(null)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="drink-options-title"
            className="relative z-10 my-auto max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8"
          >
            <button
              type="button"
              onClick={() => setActiveProduct(null)}
              aria-label="Close"
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-slate-200"
            >
              ×
            </button>

            <div className={`relative flex h-32 items-center justify-center overflow-hidden rounded-[1.5rem] bg-gradient-to-br ${activeProduct.accent} text-6xl`}>
              {activeProduct.imageUrl ? (
                <Image
                  src={activeProduct.imageUrl}
                  alt={activeProduct.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 512px"
                  className="object-cover"
                />
              ) : (
                activeProduct.emoji
              )}
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#876443]">
              {activeProduct.category}
            </p>
            <h2 id="drink-options-title" className="mt-1 pr-10 text-2xl font-black text-slate-900">
              {activeProduct.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{activeProduct.description}</p>

            {activeProduct.sizes.length > 0 ? (
              <fieldset className="mt-6">
                <legend className="text-sm font-bold text-slate-900">Choose a size</legend>
                <div className="mt-3 grid gap-2">
                  {activeProduct.sizes.map((size) => {
                    const isSelected = selectedSize === size.label;

                    return (
                      <button
                        key={size.label}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedSize(size.label)}
                        className={[
                          "flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition",
                          isSelected
                            ? "border-[#76533F] bg-[#F3EDE3] text-[#35312D]"
                            : "border-slate-200 text-slate-700 hover:border-slate-300",
                        ].join(" ")}
                      >
                        <span className="font-semibold">{size.label} <span className="font-normal text-slate-500">({size.volume})</span></span>
                        <span>{size.price > 0 ? `+${formatRupiah(size.price)}` : "Included"}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {activeProduct.toppings.length > 0 ? (
              <fieldset className="mt-6">
                <legend className="text-sm font-bold text-slate-900">Add toppings</legend>
                <div className="mt-3 space-y-2">
                  {activeProduct.toppings.map((topping) => {
                    const isSelected = selectedToppings.includes(topping.name);

                    return (
                      <button
                        key={topping.name}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleTopping(topping.name)}
                        className={[
                          "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm transition",
                          isSelected
                            ? "border-[#76533F] bg-[#F3EDE3] text-[#35312D]"
                            : "border-slate-200 text-slate-700 hover:border-slate-300",
                        ].join(" ")}
                      >
                        <span className="flex items-center gap-3">
                          <span className={[
                            "flex h-5 w-5 items-center justify-center rounded-md border text-xs",
                            isSelected ? "border-[#76533F] bg-[#76533F] text-white" : "border-slate-300",
                          ].join(" ")}>
                            {isSelected ? "✓" : ""}
                          </span>
                          {topping.name}
                        </span>
                        <span>{topping.price > 0 ? `+${formatRupiah(topping.price)}` : "Free"}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <button
              type="button"
              onClick={addVariantToCart}
              className="mt-7 flex w-full items-center justify-between rounded-full bg-[#76533F] px-5 py-3.5 text-sm font-bold text-white hover:bg-[#624432]"
            >
              <span>Add to order</span>
              <span>{formatRupiah(customizationTotal)}</span>
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
