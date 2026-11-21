"use client";
import { use } from "react";
import Styling from "../../../components/Styling";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Styling key={id} id={id} />;
}
