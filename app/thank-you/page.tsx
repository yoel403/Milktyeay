"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ConfirmationState =
  | "checking"
  | "paid"
  | "pending"
  | "awaiting_review"
  | "failed"
  | "cancelled"
  | "expired"
  | "unavailable";

const confirmationCopy: Record<
  ConfirmationState,
  { title: string; description: string; icon: string }
> = {
  checking: {
    title: "Confirming your payment",
    description: "Please wait while we check your payment status.",
    icon: "😊",
  },
  paid: {
    title: "Thank you for your order!",
    description: "Your payment is confirmed. We’re preparing your drinks now.",
    icon: "✓",
  },
  pending: {
    title: "Payment is still pending",
    description: "We haven’t received final confirmation yet. Please check again later.",
    icon: "😊",
  },
  awaiting_review: {
    title: "Payment proof received",
    description:
      "Your QRIS payment proof is waiting for manual verification. We’ll confirm your order after checking the transfer.",
    icon: "😊",
  },
  failed: {
    title: "Payment wasn’t completed",
    description: "Your payment failed. Please return to the menu and try again.",
    icon: "!",
  },
  cancelled: {
    title: "Payment was cancelled",
    description: "No payment was completed for this order.",
    icon: "×",
  },
  expired: {
    title: "Payment session expired",
    description: "The payment session expired. Please return to the menu to place a new order.",
    icon: "!",
  },
  unavailable: {
    title: "We couldn’t verify your payment",
    description:
      "Please check back in a moment or contact the store with your order reference.",
    icon: "!",
  },
};

function isConfirmationState(value: string): value is ConfirmationState {
  return Object.hasOwn(confirmationCopy, value);
}

export default function ThankYouPage() {
  const [state, setState] = useState<ConfirmationState>("checking");
  const [orderReference, setOrderReference] = useState("");

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order_id");
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      queueMicrotask(() => {
        if (isMounted) setState("unavailable");
      });
      return () => {
        isMounted = false;
      };
    }

    const validOrderId = orderId;

    const verifyPayment = async (attempt: number) => {
      try {
        const response = await fetch(
          `/api/payments/status?order_id=${encodeURIComponent(validOrderId)}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as {
          paymentStatus?: unknown;
          paymentMethod?: unknown;
          proofSubmitted?: unknown;
          error?: unknown;
        };

        if (!response.ok || typeof result.paymentStatus !== "string") {
          throw new Error(
            typeof result.error === "string" ? result.error : "Could not check payment status.",
          );
        }

        if (!isMounted) return;

        if (
          result.paymentStatus === "pending" &&
          result.paymentMethod === "qris" &&
          result.proofSubmitted === true
        ) {
          setState("awaiting_review");
          return;
        }

        if (result.paymentStatus === "pending" && attempt < 10) {
          retryTimer = setTimeout(() => void verifyPayment(attempt + 1), 2000);
          return;
        }

        const nextState = isConfirmationState(result.paymentStatus)
          ? result.paymentStatus
          : "unavailable";
        setState(nextState);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to verify thank-you page payment:", message);
        if (isMounted) setState("unavailable");
      }
    };

    queueMicrotask(() => {
      if (isMounted) setOrderReference(validOrderId);
    });
    void verifyPayment(0);

    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const confirmation = confirmationCopy[state];
  const isPaid = state === "paid";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3EDE3] px-4 py-12 text-[#35312D]">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-[#FBF9F5] p-8 text-center shadow-sm sm:p-12">
        <div
          aria-hidden="true"
          className={[
            "mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl font-bold",
            isPaid ? "bg-[#E7DCCB] text-[#76533F]" : "bg-[#D6C4AB] text-[#35312D]",
          ].join(" ")}
        >
          {confirmation.icon}
        </div>

        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Milktyeay
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
          {confirmation.title}
        </h1>
        <p role="status" className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
          {confirmation.description}
        </p>

        {orderReference ? (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Order reference: <span className="font-semibold text-slate-700">{orderReference}</span>
          </p>
        ) : null}

        {state === "pending" || state === "unavailable" ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-7 rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Check payment again
          </button>
        ) : null}

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex rounded-full bg-[#76533F] px-6 py-3 text-sm font-bold text-white hover:bg-[#624432]"
          >
            {isPaid ? "Back to homepage" : "Return to homepage"}
          </Link>
        </div>
      </section>
    </main>
  );
}
