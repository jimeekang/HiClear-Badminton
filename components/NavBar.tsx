"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import InstallAppButton from "@/components/InstallAppButton";

const links = [
  { href: "/courts", label: "코트" },
  { href: "/queue", label: "대기열" },
  { href: "/players", label: "선수" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="bg-black text-white px-6 flex gap-2 items-center" style={{ height: 72 }}>
      <div className="mr-6">
        <Image
          src="/logo.png.jpg"
          alt="HiClear"
          width={100}
          height={71}
          style={{ filter: "invert(1)", objectFit: "contain" }}
          priority
        />
      </div>
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`text-2xl font-semibold px-5 py-2 rounded-xl transition-colors ${
              active
                ? "bg-white text-black"
                : "text-gray-400 hover:bg-white/20 hover:text-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
      <InstallAppButton />
    </nav>
  );
}
