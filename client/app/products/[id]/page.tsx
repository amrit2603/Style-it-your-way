"use client";
import { use } from "react";
import ProductDetail from "../../../components/ProductDetail";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProductDetail key={id} id={id} />;
}
