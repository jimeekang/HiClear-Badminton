"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/courts", label: "코트" },
  { href: "/queue", label: "대기열" },
  { href: "/players", label: "선수" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="bg-blue-600 text-white px-6 flex gap-2 items-center" style={{ height: 72 }}>
      <span className="text-3xl font-bold mr-6">HiClear 🏸</span>
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`text-2xl font-semibold px-5 py-2 rounded-xl transition-colors ${
              active
                ? "bg-white text-blue-600"
                : "text-blue-100 hover:bg-white/20 hover:text-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
