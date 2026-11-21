import type { Metadata } from "next";
import "../../frontend/app/globals.css";
import "./shop.css";
import { CommerceProvider } from "../lib/Commerce";
export const metadata: Metadata = {
  title: "VYUMI — Style It Your Way",
  description:
    "Clothing, accessories and pieces for your space. Explore the collection and try a private preview.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <CommerceProvider>{children}</CommerceProvider>
      </body>
    </html>
  );
}
