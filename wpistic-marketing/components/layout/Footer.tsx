import Link from "next/link";
import { Container } from "../ui/Container";
import { footerNav, legalNav } from "@/lib/nav";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-ink-150 bg-ink-50">
      <Container className="py-16">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-lg bg-purple-500" aria-hidden="true" />
              <span className="font-display text-base font-extrabold text-ink-900">
                {site.name}
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-500">{site.description}</p>
            <div className="mt-5 flex items-center gap-3 text-ink-400">
              <a href={site.social.twitter} className="hover:text-purple-600" aria-label="Twitter / X">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.4 8.4L23 22h-6.8l-5.3-6.9L4.8 22H1.6l7.9-9L1 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z"/></svg>
              </a>
              <a href={site.social.linkedin} className="hover:text-purple-600" aria-label="LinkedIn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 11-.01 5 2.5 2.5 0 01.01-5ZM2.4 21.5h5.16V9H2.4v12.5Zm7.9 0h5.16v-6.8c0-1.8.68-3 2.28-3 1.36 0 2.02.96 2.02 2.94v6.86h5.16v-7.6c0-4.36-2.32-6.4-5.4-6.4-2.5 0-3.6 1.4-4.22 2.4V9H10.3c.07 1.5 0 12.5 0 12.5Z"/></svg>
              </a>
              <a href={site.social.github} className="hover:text-purple-600" aria-label="GitHub">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-3.16 19.5c.5.1.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.1.39-2 1.03-2.7-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 015 0c1.9-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.7 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0012 2Z"/></svg>
              </a>
            </div>
          </div>

          {footerNav.map((col) => (
            <div key={col.title}>
              <div className="text-xs font-bold tracking-wider text-ink-400 uppercase">
                {col.title}
              </div>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-600 hover:text-purple-600"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-ink-150 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-400">
            © {new Date().getFullYear()} WPistic. Built on WordPress — WooCommerce not required.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalNav.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-xs text-ink-500 hover:text-purple-600">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}
