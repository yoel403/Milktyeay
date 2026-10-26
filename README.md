This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Supabase setup

1. Create a new project in Supabase.
2. Copy the project URL and anon key from the Supabase dashboard.
3. Create a `.env.local` file in the project root using the values from `.env.example`.
4. Run the SQL from `supabase/schema.sql` in the Supabase SQL editor.

Example:

```bash
cp .env.example .env.local
```

Then fill in the values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MIDTRANS_SERVER_KEY=your-midtrans-server-key
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=your-midtrans-client-key
NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false
```

Keep `SUPABASE_SERVICE_ROLE_KEY` and `MIDTRANS_SERVER_KEY` private; never prefix them with `NEXT_PUBLIC_` or expose them in browser code. The Midtrans client key is intended to be public.

The homepage and order page load active products directly from the Supabase `products` table. Run the updated `supabase/schema.sql` in the Supabase SQL editor to add the `is_active` column and payment fields to an existing database. Existing products default to active; set `is_active` to `false` to hide a product from the storefront and order menu. The Supabase environment variables and product table must be configured for drinks to appear; the pages do not use built-in demo products.

The homepage review section accepts customer reviews with an anonymous or named display option. Run the updated `supabase/schema.sql` to create the `reviews` table and its policies on a fresh setup. Reviews are stored as pending and only appear publicly after setting `is_approved` to `true` in Supabase. Submissions are written by the server using `SUPABASE_SERVICE_ROLE_KEY`; approved reviews are readable through the public anon client. If the table already exists, apply the review `GRANT SELECT` and read-policy statements from `supabase/schema.sql` in the Supabase SQL editor.

## Admin order dashboard

The private order dashboard is available at `/admin`, with its sign-in page at `/admin/login`. It uses Supabase email/password authentication and only allows addresses listed in the server-side `ADMIN_EMAILS` environment variable (comma-separated). Add the authorized admin account under **Supabase → Authentication → Users** and set its email in your deployment environment, for example:

```env
ADMIN_EMAILS=owner@example.com
```

Keep this variable server-only (do not add the `NEXT_PUBLIC_` prefix). The dashboard can review orders, open privately stored QRIS proof links, update payment status and order preparation status (`pending`, `progressing`, or `done`), and see overall order totals plus per-menu and per-topping paid quantities. Paid sales are shown for menu items. Run the updated `supabase/schema.sql` in the SQL editor: it removes public access to `orders` and `order_items`, and normalizes existing order statuses; the admin API reads and updates them using the server-only service-role key after verifying each Supabase access token and admin email.

## Midtrans payments

Midtrans checkout is currently hidden from the order page while the account is awaiting approval. The existing Snap integration and notification endpoint remain in the project for when it is ready to be enabled again.

1. Copy the Supabase service-role key from **Project Settings → API Keys** and the Midtrans **Server Key** from the dashboard into `.env.local`.
2. Copy your Midtrans **Client Key** to `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` and **Server Key** to `MIDTRANS_SERVER_KEY`.
3. Keep `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false` while testing with sandbox credentials. Set it to `true` only when using live credentials.
4. In the Midtrans dashboard, configure the HTTP notification URL to `https://your-domain/api/payments/notification`. The notification endpoint must be publicly reachable over HTTPS; localhost testing requires a secure tunnel.
5. Restart the Next.js server after editing `.env.local`.

The checkout API recalculates prices from active Supabase products on the server, creates a Midtrans Snap transaction, and returns a Snap token. Snap.js uses that token to open the payment popup over the order page. After the server confirms payment via a signature-verified notification, the customer is sent to `/thank-you`, which verifies the order status before showing a successful confirmation. The frontend never receives the Midtrans server key or Supabase service-role key.

## Static QRIS payments

QRIS is currently the checkout option shown to customers. The static QR image is `public/qris-static.jpg`; replace it with the store’s correct QRIS image if it changes. Customers must enter the exact order total in their payment app, then upload a JPG, PNG, or WebP payment proof (up to 5 MB). Proof uploads are stored in the private `qris-payment-proofs` Supabase Storage bucket.

Run the updated `supabase/schema.sql` in the Supabase SQL editor to add the order payment fields and create/configure the private proof bucket. The upload endpoint also requires the server-side `SUPABASE_SERVICE_ROLE_KEY`. QRIS static payments cannot be confirmed by webhook: check the transfer in the payment provider’s dashboard, inspect the uploaded proof in Supabase Storage, then manually update both `orders.payment_status` and `orders.status` to `paid` in Supabase. Until then, the order remains pending. Do not mark an order paid based only on the uploaded image.

## Running the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Product table example

The included schema creates a `products` table with columns for name, price, toppings, and description so your storefront can fetch live beverage items from Supabase.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
