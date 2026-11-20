import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "VYUMI — Style it your way",
  description:
    "Explore sarees and suits. See a private AI visualization of your chosen garment.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
