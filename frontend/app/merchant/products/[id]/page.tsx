"use client";
import { use } from "react";
import MerchantGate from "@/components/MerchantGate";
import ProductEditor from "@/components/ProductEditor";
export default function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <MerchantGate>
      <ProductEditor id={id} />
    </MerchantGate>
  );
}
