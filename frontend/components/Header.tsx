import Link from "next/link";
export default function Header({ merchant = false }: { merchant?: boolean }) {
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="VYUMI home">
          VYUMI<span>STYLE IT YOUR WAY</span>
        </Link>
        <Link className="workspace-link" href={merchant ? "/" : "/merchant"}>
          {merchant ? "View storefront" : "Merchant studio"}
        </Link>
      </header>
    </>
  );
}
