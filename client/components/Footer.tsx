import Link from "next/link";
export default function Footer() {
  return (
    <footer className="customer-footer">
      <div>
        <Link href="/" className="brand">
          VYUMI<span>STYLE IT YOUR WAY</span>
        </Link>
        <p>Explore your style, in your own way.</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/shop">Shop the collection</Link>
        <Link href="/account">Your account & orders</Link>
        <a href={process.env.NEXT_PUBLIC_ADMIN_URL || "http://127.0.0.1:3002"}>
          Merchant Studio
        </a>
      </nav>
      <p>
        AI previews can change details. They do not measure fit or room
        dimensions.
      </p>
    </footer>
  );
}
