"use client";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useCommerce } from "../lib/Commerce";
export default function Header() {
  const { cart, user, health } = useCommerce();
  return (
    <>
      <a className="customer-skip" href="#customer-content">
        Skip to content
      </a>
      <header className="customer-header">
        <Link href="/" className="brand" aria-label="VYUMI home">
          VYUMI<span>STYLE IT YOUR WAY</span>
        </Link>
        <nav aria-label="Shopping navigation">
          <Link href="/shop">Shop</Link>
          <Link href="/account">{user ? "My account" : "Sign in"}</Link>
          <Link
            className="cart-link"
            href="/cart"
            aria-label={`Cart, ${cart.reduce((n, item) => n + item.quantity, 0)} items`}
          >
            <Icon name="bag" size={19} />
            <span>Cart ({cart.reduce((n, item) => n + item.quantity, 0)})</span>
          </Link>
        </nav>
      </header>
      <nav className="customer-collections" aria-label="Collections">
        <Link href="/shop?audience=women">Women</Link>
        <Link href="/shop?audience=men">Men</Link>
        <Link href="/shop?category=saree">Sarees</Link>
        <Link href="/shop?category=suit">Suits & sets</Link>
        <Link href="/shop?category=watch">Watches</Link>
        <Link href="/shop?category=shoes">Shoes</Link>
        <Link href="/shop?category=furniture">Furniture</Link>
        <Link href="/shop?category=decor">Home decor</Link>
      </nav>
      {health?.generation_mode === "fixture" && (
        <div className="fixture-banner">
          Demonstration workspace · AI results are fixed samples, not
          personalized previews.
        </div>
      )}
    </>
  );
}
