"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  unit: string;
  badge: string;
  description: string;
  accent: string;
  emoji: string;
  imageUrl: string | null;
};

type ProductRow = {
  id: number;
  name: string;
  category: string | null;
  price: number | string;
  badge: string | null;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  sizes: unknown;
};

type Review = {
  id: string;
  review_text: string;
  display_name: string | null;
  is_anonymous: boolean;
};

const productAccents = [
  "from-[#D6C4AB] via-[#E8DCCB] to-[#F3EDE3]",
  "from-[#C8A987] via-[#E8DCCB] to-[#F3EDE3]",
  "from-[#BFAE9C] via-[#E7DCCB] to-[#F3EDE3]",
  "from-[#C7A68D] via-[#E7DCCB] to-[#F3EDE3]",
];

const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const highlights = [
  { label: "4.9/5 average rating", value: "12k+" },
  { label: "Orders shipped this week", value: "3.4k" },
  { label: "Ingredients sourced", value: "100%" },
];

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [reviewLoadError, setReviewLoadError] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSubmitMessage, setReviewSubmitMessage] = useState<string | null>(null);
  const [reviewSubmitError, setReviewSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      if (!supabase) {
        setProductLoadError(
          "Supabase is not configured. Add your project URL and anon key to .env.local.",
        );
        setIsLoadingProducts(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, category, price, badge, description, emoji, image_url, sizes")
          .eq("is_active", true)
          .order("id", { ascending: true });

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        const mappedProducts = (data ?? []).slice(0, 3).map((item: ProductRow, index) => {
          const firstSize = Array.isArray(item.sizes) ? item.sizes[0] : null;
          const unit =
            firstSize &&
            typeof firstSize === "object" &&
            "volume" in firstSize &&
            typeof firstSize.volume === "string"
              ? firstSize.volume
              : "Freshly prepared";

          return {
            id: Number(item.id),
            name: String(item.name),
            category: String(item.category ?? "Beverage"),
            price: Number(item.price),
            unit,
            badge: String(item.badge ?? "Featured"),
            description: String(item.description ?? "Freshly prepared drink."),
            accent: productAccents[index % productAccents.length],
            emoji: String(item.emoji ?? "☕"),
            imageUrl:
              typeof item.image_url === "string" && item.image_url.trim()
                ? item.image_url.trim()
                : null,
          };
        });

        setProducts(mappedProducts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to fetch homepage products from Supabase:", message);
        if (isMounted) {
          setProductLoadError(`Could not load products: ${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoadingProducts(false);
        }
      }
    }

    async function loadReviews() {
      if (!supabase) {
        setReviewLoadError(
          "Supabase is not configured. Add your project URL and anon key to .env.local.",
        );
        setIsLoadingReviews(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("reviews")
          .select("id, review_text, display_name, is_anonymous")
          .eq("is_approved", true)
          .order("created_at", { ascending: false })
          .limit(6);

        if (error) {
          throw error;
        }

        if (isMounted) {
          setReviews((data ?? []) as Review[]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to fetch customer reviews from Supabase:", message);
        if (isMounted) {
          setReviewLoadError(`Could not load reviews: ${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoadingReviews(false);
        }
      }
    }

    void loadProducts();
    void loadReviews();

    return () => {
      isMounted = false;
    };
  }, []);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewSubmitMessage(null);
    setReviewSubmitError(null);
    setIsSubmittingReview(true);

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review: reviewText,
          isAnonymous,
          displayName: isAnonymous ? "" : displayName,
        }),
      });
      const result = (await response.json()) as { error?: unknown; message?: unknown };

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string" ? result.error : "Could not submit your review.",
        );
      }

      setReviewText("");
      setDisplayName("");
      setReviewSubmitMessage("Thank you! Your review has been submitted");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReviewSubmitError(message);
    } finally {
      setIsSubmittingReview(false);
    }
  }

  return (
    <main id="top" className="min-h-screen bg-[#F3EDE3] text-[#35312D]">
      <div className="w-full">
        <header className="sticky top-0 z-50 flex min-h-20 items-center justify-between gap-4 border-b border-[#D6C4AB]/70 bg-[#F3EDE3]/95 px-5 py-4 shadow-sm backdrop-blur-xl sm:px-8 lg:px-[5vw]">
          <div className="flex w-full items-center justify-between gap-4">
            <a href="#top" className="flex shrink-0 items-center" aria-label="Milktyeay home">
              <Image
                src="/milktyeay-logo.png"
                alt="Milktyeay"
                width={602}
                height={382}
                priority
                className="h-12 w-auto object-contain sm:h-14"
              />
            </a>

            <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
              <a href="#shop">Shop</a>
              <a href="#reviews">Reviews</a>
            </nav>

            <a
              href="/order"
              className="rounded-full bg-[#76533F] px-4 py-2 text-sm font-semibold text-[#F3EDE3] shadow-lg shadow-[#35312D]/15 transition hover:bg-[#624432]"
            >
              Order Here
            </a>
          </div>
        </header>

        <section className="relative isolate flex min-h-[calc(100svh-5rem)] items-center overflow-hidden bg-[#35312D] px-5 py-12 text-[#F3EDE3] sm:px-8 md:py-16 lg:px-[8vw] lg:py-14">
          <Image
            src="/landscape green bg.jpeg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_55%]"
          />
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-[#231b16]/90 via-[#231b16]/58 to-[#231b16]/5" />
          <div className="relative z-20 flex w-full max-w-3xl flex-col justify-center">
            <h1 className="max-w-3xl text-5xl font-black leading-[0.94] tracking-[-0.06em] text-white sm:text-6xl md:text-7xl lg:text-[clamp(4.5rem,6vw,6.5rem)]">
              Milktyeay,
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-[#F3EDE3]/80 sm:text-lg sm:leading-8">
            Authentic Roasted Jasmine & Oolong Milk Tea. Ready to sip, anytime and anywhere you need a sweet escape.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a
                href="#shop"
                className="inline-flex items-center justify-center rounded-full bg-[#D6C4AB] px-6 py-3 text-base font-semibold text-[#35312D] shadow-lg shadow-black/10 transition hover:bg-[#E6D9C7]"
              >
                Shop best Products
              </a>
              <a
                href="#support"
                className="inline-flex items-center justify-center rounded-full border border-[#D6C4AB]/50 bg-[#F3EDE3]/5 px-6 py-3 text-base font-semibold text-[#F3EDE3] transition hover:bg-[#F3EDE3]/10"
              >
                Contact us
              </a>
            </div>

            {/* <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.label} className="border-l border-[#D6C4AB]/35 py-1 pl-4 first:border-0 first:pl-0">
                  <div className="text-xl font-black text-white">{item.value}</div>
                  <div className="mt-1 text-xs text-[#F3EDE3]/70">{item.label}</div>
                </div>
              ))}
            </div> */}
          </div>
        </section>

        <section id="shop" className="mx-5 mt-12 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:mx-8 sm:p-8 lg:mx-[5vw]">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Featured picks</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Favorites</h2>
            </div>
          </div>

          <div className="flex snap-x snap-mandatory flex-nowrap justify-start gap-4 overflow-x-auto scroll-smooth -mx-5 px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0">
            {isLoadingProducts ? (
              <p role="status" className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                Loading featured products...
              </p>
            ) : productLoadError ? (
              <p role="alert" className="w-full rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                {productLoadError}
              </p>
            ) : products.length === 0 ? (
              <p className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                There are no products available right now.
              </p>
            ) : (
              products.map((product) => (
                <article
                  key={product.id}
                  className="w-[72%] max-w-[280px] shrink-0 snap-center overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#fafaf9] p-3 shadow-sm sm:w-[calc(50%_-_0.5rem)] sm:max-w-none sm:shrink sm:snap-none sm:p-4 lg:w-[calc(33.333%_-_0.75rem)]"
                >
                  <div className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-[1.5rem] bg-gradient-to-br ${product.accent} sm:aspect-[4/3]`}>
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-6xl" aria-hidden="true">{product.emoji}</span>
                    )}
                    <span className="absolute left-4 top-4 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                      {product.badge}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{product.category}</p>
                        <h3 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">{product.name}</h3>
                      </div>
                      <span className="shrink-0 text-base font-black text-slate-900 sm:text-lg">{formatRupiah(product.price)}</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-500">{product.unit}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{product.description}</p>
                  </div>

                  <a
                    href="/order"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Explore product
                  </a>
                </article>
              ))
            )}
          </div>
        </section>

        <section id="reviews" className="mx-5 mt-16 sm:mx-8 lg:mx-[5vw]">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Customer love</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Share your experience</h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <form
              onSubmit={submitReview}
              className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
            >
              <label htmlFor="review-text" className="block text-sm font-semibold text-slate-900">
                Your review
              </label>
              <textarea
                id="review-text"
                name="review"
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                required
                minLength={10}
                maxLength={1000}
                rows={5}
                placeholder="Tell us what you think about your Milktyeay experience..."
                className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#76533F] focus:ring-2 focus:ring-[#76533F]/20"
              />
              <p className="mt-1 text-right text-xs text-slate-500">{reviewText.length}/1000</p>

              <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-slate-900">How should we show your identity?</legend>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="review-identity"
                      checked={isAnonymous}
                      onChange={() => setIsAnonymous(true)}
                      className="accent-[#76533F]"
                    />
                    Submit anonymously
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="review-identity"
                      checked={!isAnonymous}
                      onChange={() => setIsAnonymous(false)}
                      className="accent-[#76533F]"
                    />
                    Show my name
                  </label>
                </div>
              </fieldset>

              {!isAnonymous ? (
                <div className="mt-4">
                  <label htmlFor="review-name" className="block text-sm font-semibold text-slate-900">
                    Name to display
                  </label>
                  <input
                    id="review-name"
                    name="displayName"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                    maxLength={80}
                    autoComplete="name"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-[#76533F] focus:ring-2 focus:ring-[#76533F]/20"
                  />
                </div>
              ) : null}

              {reviewSubmitError ? (
                <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                  {reviewSubmitError}
                </p>
              ) : null}
              {reviewSubmitMessage ? (
                <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                  {reviewSubmitMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmittingReview}
                className="mt-5 inline-flex items-center justify-center rounded-full bg-[#76533F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#624432] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingReview ? "Submitting..." : "Submit review"}
              </button>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Reviews are checked before appearing publicly. Anonymous reviews will not display your name.
              </p>
            </form>

            <div>
              <h3 className="text-xl font-bold text-slate-900">Customer reviews</h3>
              {isLoadingReviews ? (
                <p role="status" className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                  Loading customer reviews...
                </p>
              ) : reviewLoadError ? (
                <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                  {reviewLoadError}
                </p>
              ) : reviews.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                  Be the first to share your experience.
                </p>
              ) : (
                <div className="mt-4 grid gap-4">
                  {reviews.map((review) => (
                    <article key={review.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">“{review.review_text}”</p>
                      <p className="mt-4 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                        {review.is_anonymous ? "Anonymous" : review.display_name}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <footer
          id="support"
          className="relative isolate mt-16 flex min-h-[48svh] flex-col justify-between overflow-hidden border-t-4 border-[#C8D9BC] bg-[radial-gradient(ellipse_at_12%_100%,rgba(196,222,196,0.22),transparent_40%),radial-gradient(ellipse_at_88%_0%,rgba(214,196,171,0.2),transparent_36%),linear-gradient(120deg,#34483B_0%,#405848_55%,#34483B_100%)] px-4 py-5 text-[#F3EDE3] sm:px-8 sm:py-6 lg:min-h-[30svh] lg:px-[7vw]"
        >
          <div className="pointer-events-none absolute -right-24 top-0 -z-10 h-96 w-96 rounded-full border border-white/[0.07] sm:h-[32rem] sm:w-[32rem]" />

          <div className="grid flex-1 content-center gap-4 py-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-10 lg:py-3">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6C4AB]">Contact · Business inquiries</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                Interested in working with us?
              </h2>
              <p className="mt-2 max-w-xl text-xs leading-5 text-[#F3EDE3]/70 sm:text-sm sm:leading-6">
                For partnerships and other business matters, reach out through any of our channels.
              </p>
            </div>

            <div className="grid grid-cols-3 divide-x divide-white/15 border-y border-white/15">
              <a href="https://wa.link/a4vjsc" target="_blank" rel="noreferrer" className="group flex min-w-0 flex-col items-start justify-center gap-2 py-3 pr-2 transition sm:flex-row sm:items-center sm:gap-3 sm:py-4 sm:pr-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D6C4AB] text-[#35312D] transition group-hover:scale-105 sm:h-9 sm:w-9">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path d="M12.04 2a9.8 9.8 0 0 0-8.36 14.92L2.4 22l5.2-1.36A9.9 9.9 0 1 0 12.04 2Zm0 17.95a8 8 0 0 1-4.08-1.12l-.3-.18-3.08.8.82-3-.2-.31a8.1 8.1 0 1 1 6.84 3.81Zm4.45-6.07c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.23-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.42-1.34-1.66-.14-.24-.02-.37.1-.49.11-.1.24-.27.36-.4.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.4h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.31.98 2.47c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.5.58.18 1.1.15 1.52.1.47-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-medium uppercase tracking-[0.12em] text-emerald-50/55 sm:text-[10px]">WhatsApp</span>
                  <span className="mt-0.5 block whitespace-nowrap text-[9px] font-semibold leading-tight sm:text-sm">+6285159543662</span>
                </span>
              </a>
              <a href="https://www.instagram.com/milktyeay?utm_source=ig_web_button_share_sheet&psln=ZDNlZDc0MzIxNw==" target="_blank" rel="noreferrer" className="group flex min-w-0 flex-col items-start justify-center gap-2 px-2 py-3 transition sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D6C4AB] text-[#35312D] transition group-hover:scale-105 sm:h-9 sm:w-9">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-medium uppercase tracking-[0.12em] text-emerald-50/55 sm:text-[10px]">Instagram</span>
                  <span className="mt-0.5 block truncate text-[10px] font-semibold leading-tight sm:text-sm">@Milktyeay</span>
                </span>
              </a>
              <a href="https://www.tiktok.com/@milktyeay?_r=1&_t=ZS-9AhyZbhOREd" target="_blank" rel="noreferrer" className="group flex min-w-0 flex-col items-start justify-center gap-2 py-3 pl-2 transition sm:flex-row sm:items-center sm:gap-3 sm:py-4 sm:pl-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D6C4AB] text-[#35312D] transition group-hover:scale-105 sm:h-9 sm:w-9">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.9 2.9 0 0 1-2.9 2.9 2.9 2.9 0 1 1 2.9-2.9v-3.45a6.34 6.34 0 1 0 6.34 6.35V9.12a8.18 8.18 0 0 0 4.79 1.54V7.21a4.83 4.83 0 0 1-3.91-.52Z" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-medium uppercase tracking-[0.12em] text-emerald-50/55 sm:text-[10px]">TikTok</span>
                  <span className="mt-0.5 block truncate text-[10px] font-semibold leading-tight sm:text-sm">@milktyeay</span>
                </span>
              </a>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-white/15 pt-3 text-[10px] text-emerald-50/50 sm:text-xs">
            <span>© Milktyeay · Made for you.</span>
            <a href="#top" className="w-fit transition hover:text-white">Back to top ↑</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
