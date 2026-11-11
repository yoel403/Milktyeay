import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Milktyeay",
  description:
    "Freshly brewed milk tea made to brighten your day. Explore the Milktyeay menu and find your new favorite drink.",
  openGraph: {
    title: "Milktyeay | Milk Tea",
    description:
      "Freshly brewed milk tea made to brighten your day. Explore the Milktyeay menu and find your new favorite drink.",
  },
  icons: {
    icon: "/milktyeay-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
