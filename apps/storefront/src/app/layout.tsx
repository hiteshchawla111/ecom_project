import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Playfair_Display } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CartProvider } from "@/components/cart/CartProvider";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { getCurrentUser } from "@/lib/session";
import { getCart, liveCartDeps, type CartView } from "@/lib/api-cart";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getBrandHue } from "@/lib/branding";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Editorial high-contrast serif for display headings — the primary "premium
// retail" signal. Used for hero + section titles via --font-heading.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
  // Resolve the theme server-side from the cookie so <html data-theme> is set
  // before paint — no flash of the wrong theme. Read-only (never set cookies
  // during render).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // Resolve the brand hue server-side too, so the primary OKLCH scale is set
  // before paint — admin-chosen color with no flash. Falls back to coral.
  const brandHue = await getBrandHue();
  return (
    <html
      lang="en"
      data-theme={theme}
      style={{ ['--brand-hue' as string]: String(brandHue) }}
      className={`${inter.variable} ${jakarta.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <CartProvider initialCart={initialCart}>
          {/* Header stays outside the smooth-scroll content so its sticky
              positioning keeps working (ScrollSmoother transforms the content). */}
          <SiteHeader />
          <SmoothScroll>
            <div className="flex min-h-[60vh] flex-col">
              <div className="flex-1">{children}</div>
              <SiteFooter />
            </div>
          </SmoothScroll>
        </CartProvider>
      </body>
    </html>
  );
}
