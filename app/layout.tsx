import type { Metadata } from "next";
import { Fraunces, Nunito_Sans, JetBrains_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

// Display: soft characterful serif. Body: warm humanist sans. Data: mono.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Meal Move",
  description: "Food-rescue for a campus volunteer org.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-neutral-50 pb-[calc(4.5rem+env(safe-area-inset-bottom))] font-sans text-neutral-900 antialiased md:pb-0">
        <Header />
        {children}
      </body>
    </html>
  );
}
