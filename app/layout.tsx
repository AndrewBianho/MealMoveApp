import type { Metadata } from "next";
import { Fraunces, Nunito_Sans, JetBrains_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { WebVitals } from "@/components/WebVitals";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { auth } from "@/auth";
import { hashUserId } from "@/lib/analytics/identify";
import type { Role } from "@/lib/analytics/events";
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
  metadataBase: new URL("https://app.mealmove.org"),
  title: "Meal Move",
  description: "Food-rescue for a campus volunteer org.",
  manifest: "/manifest.json",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const userHash = session?.user?.id ? hashUserId(session.user.id) : undefined;
  const role = session?.user?.role as Role | undefined;

  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-neutral-50 pb-[calc(4.5rem+env(safe-area-inset-bottom))] font-sans text-neutral-900 antialiased md:pb-0">
        <Header />
        {children}
        <AnalyticsProvider userHash={userHash} role={role} />
        <WebVitals />
      </body>
    </html>
  );
}
