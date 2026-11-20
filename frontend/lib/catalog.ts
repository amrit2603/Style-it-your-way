import type { Product } from "./api";
export const categories = [
  ["saree", "Sarees"],
  ["suit", "Suits & sets"],
  ["shirt", "Shirts"],
  ["top", "Tops & T-shirts"],
  ["trousers", "Trousers & jeans"],
  ["skirt", "Skirts"],
  ["dress", "Dresses"],
  ["kurta", "Kurtas"],
  ["jacket", "Jackets & blazers"],
  ["lehenga", "Lehengas"],
] as const;
export const audiences = [
  ["all", "Everyone"],
  ["women", "Women"],
  ["men", "Men"],
  ["unisex", "Unisex"],
] as const;
export function categoryName(category: string) {
  return categories.find(([key]) => key === category)?.[1] || category;
}
export function audienceOf(p: Product): "women" | "men" | "unisex" {
  return (
    p.audience || (["saree", "suit"].includes(p.category) ? "women" : "unisex")
  );
}
function slot(p: Product) {
  return ["trousers", "skirt"].includes(p.category)
    ? "bottom"
    : p.category === "jacket"
      ? "outer"
      : ["saree", "suit", "dress", "lehenga"].includes(p.category)
        ? "full"
        : "top";
}
export function canCombine(items: Product[], next: Product) {
  const slots = [...items, next].map(slot);
  return (
    items.length < 3 &&
    !items.some((p) => p.id === next.id) &&
    new Set(slots).size === slots.length &&
    !(
      slots.includes("full") &&
      (slots.includes("top") || slots.includes("bottom"))
    )
  );
}
