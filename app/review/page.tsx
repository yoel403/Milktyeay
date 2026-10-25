"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

export default function ReviewPage() {
  const [reviewText, setReviewText] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage(null);
    setSubmitError(null);
    setIsSubmitting(true);

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
      setSubmitMessage(
        typeof result.message === "string"
          ? result.message
          : "Thank you! Your review has been submitted",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F3EDE3] px-4 py-8 text-[#35312D] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* <header className="mb-10 flex items-center justify-between rounded-full border border-[#D6C4AB]/70 bg-[#F3EDE3]/95 px-5 py-3 shadow-sm">
          <Image
            src="/milktyeay-logo.png"
            alt="Milktyeay"
            width={602}
            height={382}
            priority
            className="h-12 w-auto object-contain"
          />
        </header> */}

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Customer love
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Share your experience
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Tell us what you think about your Milktyeay experience. You can choose whether to show your name.
          </p>

          <form
            onSubmit={submitReview}
            className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
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
              rows={7}
              placeholder="Write your review here..."
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#76533F] focus:ring-2 focus:ring-[#76533F]/20"
            />
            <p className="mt-1 text-right text-xs text-slate-500">{reviewText.length}/1000</p>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-slate-900">
                How should we show your identity?
              </legend>
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

            {submitError ? (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {submitError}
              </p>
            ) : null}
            {submitMessage ? (
              <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                {submitMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-5 inline-flex items-center justify-center rounded-full bg-[#76533F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#624432] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Submit review"}
            </button>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Reviews are checked before appearing on the homepage. Anonymous reviews will not display your name.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
