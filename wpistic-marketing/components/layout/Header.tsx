"use client";

import { useState } from "react";
import Link from "next/link";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { primaryNav } from "@/lib/nav";
import { site } from "@/lib/site";

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-150 bg-white/85 backdrop-blur-md">
      <Container className="flex h-18 items-center justify-between py-3.5">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="h-8 w-8 rounded-lg bg-purple-500" aria-hidden="true" />
          <span className="font-display text-lg font-extrabold tracking-tight text-ink-900">
            {site.name}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {primaryNav.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-[14.5px] font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={site.loginUrl}
            className="rounded-full px-4 py-2 text-[14.5px] font-semibold text-ink-700 hover:text-ink-900"
          >
            Log in
          </a>
          <Button href="/pricing" size="sm" variant="green">
            Start free
          </Button>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg text-ink-700 lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "x" : "menu"} size={22} />
        </button>
      </Container>

      {open && (
        <div className="border-t border-ink-150 bg-white lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {primaryNav.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-ink-700 hover:bg-ink-100"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-ink-150 pt-4">
              <a
                href={site.loginUrl}
                className="rounded-full px-4 py-2.5 text-center text-[15px] font-semibold text-ink-700"
              >
                Log in
              </a>
              <Button href="/pricing" variant="green" className="w-full">
                Start free
              </Button>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
