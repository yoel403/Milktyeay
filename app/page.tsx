"use client";

import Image from "next/image";
import { useState } from "react";

const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const products = [
  {
    id: 1,
    name: "Daily Greens",
    category: "Wellness",
    price: 34,
    unit: "30 servings",
    badge: "Best seller",
    description: "A daily blend of spinach, matcha, and digestive botanicals.",
    accent: "from-[#D6C4AB] via-[#E8DCCB] to-[#F3EDE3]",
    emoji: "🥬",
  },
  {
    id: 2,
    name: "Focus Fuel",
    category: "Performance",
    price: 28,
    unit: "20 packets",
    badge: "New",
    description: "Smooth caffeine + nootropic support for long-form focus.",
    accent: "from-[#C8A987] via-[#E8DCCB] to-[#F3EDE3]",
    emoji: "⚡",
  },
  {
    id: 3,
    name: "Night Reset",
    category: "Recovery",
    price: 32,
    unit: "30 gummies",
    badge: "Sleep + calm",
    description: "Magnesium-rich evening ritual for deeper, lower-stress sleep.",
    accent: "from-[#BFAE9C] via-[#E7DCCB] to-[#F3EDE3]",
    emoji: "🌙",
  },
  {
    id: 4,
    name: "Protein Core",
    category: "Recovery",
    price: 38,
    unit: "12 scoops",
    badge: "High protein",
    description: "Grass-fed whey isolate with vanilla bean and gut-friendly enzymes.",
    accent: "from-[#C7A68D] via-[#E7DCCB] to-[#F3EDE3]",
    emoji: "🥤",
  },
];

const highlights = [
  { label: "4.9/5 average rating", value: "12k+" },
  { label: "Orders shipped this week", value: "3.4k" },
  { label: "Ingredients sourced", value: "100%" },
];

const reviews = [
  {
    name: "Sofia R.",
    quote:
      "The experience feels premium from the first click. My bundle arrived in under 48 hours and tastes amazing.",
  },
  {
    name: "Marcus T.",
    quote:
      "I finally found a wellness stack that feels easy to keep up with. The focus blend is a daily staple.",
  },
  {
    name: "Leah C.",
    quote:
      "The checkout process is seamless, and the formulas actually deliver. It feels like a brand built for real routines.",
  },
];

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const visibleProducts = Array.from({ length: 3 }, (_, index) => {
    const productIndex = (currentSlide + index) % products.length;
    return products[productIndex];
  });

  const goToPreviousSlide = () => {
    setCurrentSlide((previous) => (previous === 0 ? products.length - 1 : previous - 1));
  };

  const goToNextSlide = () => {
    setCurrentSlide((previous) => (previous + 1) % products.length);
  };

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
              <a href="#support">Support</a>
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
              Premium wellness essentials for energy, sleep, focus, and recovery—delivered direct to your door with a simple subscription that fits your routine.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a
                href="#shop"
                className="inline-flex items-center justify-center rounded-full bg-[#D6C4AB] px-6 py-3 text-base font-semibold text-[#35312D] shadow-lg shadow-black/10 transition hover:bg-[#E6D9C7]"
              >
                Shop best sellers
              </a>
              <a
                href="#support"
                className="inline-flex items-center justify-center rounded-full border border-[#D6C4AB]/50 bg-[#F3EDE3]/5 px-6 py-3 text-base font-semibold text-[#F3EDE3] transition hover:bg-[#F3EDE3]/10"
              >
                Contact us
              </a>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.label} className="border-l border-[#D6C4AB]/35 py-1 pl-4 first:border-0 first:pl-0">
                  <div className="text-xl font-black text-white">{item.value}</div>
                  <div className="mt-1 text-xs text-[#F3EDE3]/70">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="shop" className="mx-5 mt-12 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:mx-8 sm:p-8 lg:mx-[5vw]">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Featured picks</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">A ritual worth repeating</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousSlide}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                aria-label="Previous featured product"
              >
                ←
              </button>
              <button
                type="button"
                onClick={goToNextSlide}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                aria-label="Next featured product"
              >
                →
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {visibleProducts.map((product) => (
              <article
                key={`${product.id}-${product.name}`}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#fafaf9] p-4 shadow-sm"
              >
                <div className={`rounded-[1.5rem] bg-gradient-to-br ${product.accent} p-4`}>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                      {product.badge}
                    </span>
                    <span className="text-4xl">{product.emoji}</span>
                  </div>

                  <div className="mt-12">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{product.category}</p>
                    <h3 className="mt-2 text-2xl font-black text-slate-900">{product.name}</h3>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span>{product.unit}</span>
                  <span className="text-lg font-black text-slate-900">{formatRupiah(product.price)}</span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600">{product.description}</p>

                <a
                  href="/order"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Explore product
                </a>
              </article>
            ))}
          </div>

          <div className="mt-5 flex justify-center gap-2">
            {products.map((product, index) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setCurrentSlide(index)}
                className={[
                  "h-2.5 rounded-full transition-all",
                  index === currentSlide ? "w-8 bg-slate-900" : "w-2.5 bg-slate-300 hover:bg-slate-400",
                ].join(" ")}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </section>

        <section id="reviews" className="mx-5 mt-16 sm:mx-8 lg:mx-[5vw]">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Customer love</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Real routines, real results</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {reviews.map((review) => (
              <article key={review.name} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-1 text-amber-400">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span key={`${review.name}-${index}`}>★</span>
                  ))}
                </div>
                <p className="text-base leading-7 text-slate-600">“{review.quote}”</p>
                <div className="mt-5 border-t border-slate-200 pt-4 text-sm font-semibold text-slate-900">{review.name}</div>
              </article>
            ))}
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
            <span>© Milktyeay · Made for your everyday ritual.</span>
            <a href="#top" className="w-fit transition hover:text-white">Back to top ↑</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
