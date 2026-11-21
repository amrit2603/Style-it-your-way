"use client";
import { use } from "react";
import { Receipt } from "../../../components/Checkout";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Receipt key={id} id={id} />;
}
