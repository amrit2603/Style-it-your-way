"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { Account, api, Health, Product } from "@/lib/api";
export type CartItem = {
  key: string;
  product_id: string;
  name: string;
  image: string;
  price_minor: number;
  currency: string;
  quantity: number;
  size: string;
  color: string;
};
type Commerce = {
  cart: CartItem[];
  ready: boolean;
  user?: Account;
  health?: Health;
  accountReady: boolean;
  refreshAccount: () => Promise<void>;
  add: (
    product: Product,
    quantity: number,
    size: string,
    color: string,
  ) => void;
  quantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};
const Context = createContext<Commerce | null>(null);
const storage = "vyumi-shopping-cart";
export function CommerceProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]),
    [ready, setReady] = useState(false),
    [user, setUser] = useState<Account>(),
    [accountReady, setAccountReady] = useState(false),
    [health, setHealth] = useState<Health>();
  const refreshAccount = async () => {
    try {
      setUser(await api<Account>("/auth/me"));
    } catch {
      setUser(undefined);
    } finally {
      setAccountReady(true);
    }
  };
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storage) || "[]");
      if (Array.isArray(saved))
        setCart(
          saved
            .filter(
              (item) =>
                item &&
                typeof item.product_id === "string" &&
                typeof item.key === "string" &&
                typeof item.name === "string" &&
                typeof item.size === "string" &&
                typeof item.color === "string" &&
                ["INR", "USD", "EUR", "GBP", "AED"].includes(item.currency) &&
                Number.isInteger(item.quantity) &&
                item.quantity > 0 &&
                item.quantity <= 20 &&
                Number.isSafeInteger(item.price_minor) &&
                item.price_minor >= 0,
            )
            .slice(0, 30)
            .map((item) => ({
              ...item,
              image:
                typeof item.image === "string" &&
                item.image.startsWith("/api/assets/")
                  ? item.image
                  : "",
            })),
        );
    } catch {}
    setReady(true);
    void refreshAccount();
    void api<Health>("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(storage, JSON.stringify(cart));
      } catch {}
    }
  }, [cart, ready]);
  const add = (
    product: Product,
    count: number,
    size: string,
    color: string,
  ) => {
    if (product.fixture || product.price_minor === null)
      throw new Error("This sample or catalog-only product cannot be ordered.");
    if (!Number.isInteger(count) || count < 1 || count > 20)
      throw new Error("Choose a quantity from 1 to 20.");
    if (cart.some((item) => item.currency !== product.currency))
      throw new Error("Place separate orders for different currencies.");
    const key = JSON.stringify([product.id, size, color]);
    const current = cart.find((item) => item.key === key);
    if ((current?.quantity || 0) + count > 20)
      throw new Error("You can order up to 20 of this option.");
    if (!current && cart.length >= 30)
      throw new Error("Your cart can hold up to 30 product options.");
    const next: CartItem = {
      key,
      product_id: product.id,
      name: product.name,
      image: product.images[0]?.url || "",
      price_minor: product.price_minor,
      currency: product.currency,
      quantity: count,
      size,
      color,
    };
    setCart((items) =>
      current
        ? items.map((item) =>
            item.key === key
              ? { ...next, quantity: item.quantity + count }
              : item,
          )
        : [...items, next],
    );
  };
  return (
    <Context.Provider
      value={{
        cart,
        ready,
        user,
        health,
        accountReady,
        refreshAccount,
        add,
        quantity: (key, count) => {
          if (Number.isInteger(count) && count > 0 && count <= 20)
            setCart((items) =>
              items.map((item) =>
                item.key === key ? { ...item, quantity: count } : item,
              ),
            );
        },
        remove: (key) =>
          setCart((items) => items.filter((item) => item.key !== key)),
        clear: () => setCart([]),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCommerce() {
  const value = useContext(Context);
  if (!value) throw new Error("Commerce provider is required");
  return value;
}
export const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    amount / 100,
  );
