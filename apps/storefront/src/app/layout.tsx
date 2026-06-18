import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CartProvider } from "@/components/cart/CartProvider";
import { getCurrentUser } from "@/lib/session";
import { getCart, liveCartDeps, type CartView } from "@/lib/api-cart";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

async function readInitialCart(): Promise<CartView | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    return await getCart(await liveCartDeps());
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: {
    default: "Coral Market",
    template: "%s · Coral Market",
  },
  description: "Everyday essentials and seasonal finds, delivered with care.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialCart = await readInitialCart();
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <CartProvider initialCart={initialCart}>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
