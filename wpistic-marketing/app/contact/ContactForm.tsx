"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { site } from "@/lib/site";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = `Website contact form — ${name || "New inquiry"}`;
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      message,
    ].join("\n");
    const mailto = `mailto:${site.supportEmail}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const inputClasses =
    "w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[14.5px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-purple-400";

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div>
        <label htmlFor="contact-name" className="mb-1.5 block text-sm font-semibold text-ink-700">
          Name
        </label>
        <input
          id="contact-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="mb-1.5 block text-sm font-semibold text-ink-700">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-semibold text-ink-700">
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you're looking for…"
          className={`${inputClasses} resize-none`}
        />
      </div>
      <button
        type="submit"
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-green-500 px-7 py-3.5 text-base font-semibold text-white shadow-[0_2px_10px_rgba(0,192,75,0.25)] transition-all duration-200 hover:bg-green-600 hover:shadow-[0_8px_28px_rgba(0,192,75,0.35)]"
      >
        Open in your email app <Icon name="arrow" size={18} />
      </button>
      <p className="text-[13px] text-ink-500">
        This opens a pre-filled email in your default mail app addressed to{" "}
        {site.supportEmail} — nothing is sent from this page directly.
      </p>
    </form>
  );
}
