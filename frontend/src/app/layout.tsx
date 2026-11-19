import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F-Commerce | Discover your next favorite",
  description: "Shop thoughtfully chosen products from trusted sellers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

