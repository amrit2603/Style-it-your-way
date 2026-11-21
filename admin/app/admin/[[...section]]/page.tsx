"use client";
import { use } from "react";
import ProductEditor from "@/components/ProductEditor";
import {
  Dashboard,
  Products,
  Orders,
  Library,
  Generator,
} from "../../../components/Workbench";
export default function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = ["dashboard"] } = use(params);
  if (section[0] === "products" && section[1])
    return (
      <ProductEditor
        key={section[1]}
        id={section[1]}
        baseHref="/admin"
        embedded
        storefrontUrl={
          process.env.NEXT_PUBLIC_CLIENT_URL || "http://127.0.0.1:3003"
        }
      />
    );
  if (section[0] === "products") return <Products />;
  if (section[0] === "orders") return <Orders />;
  if (section[0] === "models") return <Library />;
  if (section[0] === "ai-generate") return <Generator />;
  return <Dashboard />;
}
