import type { Metadata } from "next";
import "../../frontend/app/globals.css";
import "./studio.css";
import AdminShell from "../components/AdminShell";
export const metadata: Metadata = {
  title: "VYUMI — Merchant Studio",
  description: "Prepare, review and publish your store collection.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
