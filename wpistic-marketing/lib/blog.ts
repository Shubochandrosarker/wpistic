// Static blog content for the WPistic marketing site. No MDX/markdown parsing —
// each post's body is just an array of paragraph strings. This is a placeholder
// content source; if a real CMS or file-based blog is wired in later, this file
// is the thing to replace.

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  content: string[];
}

export const posts: BlogPost[] = [
  {
    slug: "one-dashboard-for-eleven-products",
    title: "Why we built one dashboard for 11 WordPress products instead of 11 separate ones",
    excerpt:
      "Every WPistic product could have shipped as its own SaaS with its own login and its own bill. Here's why we deliberately didn't do that, and what it cost us to avoid it.",
    date: "2026-05-12",
    author: "WPistic Team",
    category: "Product",
    content: [
      "When we started building Chatbotistic, the obvious path was the one every WordPress plugin business takes: stand up a separate site, a separate Stripe account, a separate login, and treat it as its own product. That's how most of the WordPress SaaS landscape works today — a chat widget from one vendor, a CRM from another, a booking plugin from a third, each with its own settings screen and its own outage.",
      "We didn't want to ship our eleventh product that way. The whole reason WPistic exists is that we were the agency stitching these tools together for clients, and the stitching was the expensive part — not the individual plugins. So before Memberistic or CRMistic had a single feature spec written, we had to decide how entitlements, billing, and identity would work across products that didn't exist yet.",
      "The answer was a shared core: one account model, one billing ledger, one entitlements table that every product — Chatbotistic, CRMistic, Bookingistic, all the way down to Licenseistic — reads from at plugin activation. A customer on the Professional plan doesn't have 'a Chatbotistic subscription and a separate CRMistic subscription that happen to renew on the same day.' They have one subscription that grants access to a set of products, full stop.",
      "The cost of this was real. Every new product takes longer to ship because it has to onboard to the shared entitlements and billing system instead of just bolting on its own Stripe webhook. Early on, that felt like the wrong tradeoff — competitors with single-purpose plugins were shipping faster. But it's the same investment that now lets a Chatbotistic conversation become a CRMistic contact automatically, or a Memberistic plan change instantly grant a Licenseistic activation, with no Zapier account and no polling job in between.",
      "The test we keep coming back to: would a customer running three WPistic products describe their stack as 'three tools' or 'one system'? If it's the former, we haven't finished the job. That's still true today — not every integration between every pair of products is as deep as we want, and we say so on the marketplace page rather than pretending otherwise. But the direction is set, and it's the reason the dashboard says 'WPistic' once instead of showing eleven separate app icons.",
    ],
  },
  {
    slug: "chatbotistic-whatsapp-integration",
    title: "Chatbotistic's WhatsApp integration: how it actually works",
    excerpt:
      "A native WhatsApp Business API connection, not a third-party bridge — a look at why we built it that way and what it means for handoff and multilingual replies.",
    date: "2026-04-03",
    author: "Engineering",
    category: "Engineering",
    content: [
      "The most common question we get about Chatbotistic is whether the WhatsApp piece is 'real' WhatsApp or a wrapper around some other inbox tool. It's a native connection to the WhatsApp Business API — the same API tier that large support teams use — configured directly from the WordPress plugin settings screen, with no separate app to sign into and no third-party bridge service sitting in the middle relaying messages.",
      "That distinction matters more than it sounds. A lot of 'WhatsApp chatbot' products on the market are actually a website widget with a WhatsApp deep link bolted on, or a bridge that polls a third-party inbox and forwards messages with a delay. Native API access means Chatbotistic can reply in real time, read delivery and read receipts, and — critically — keep every conversation in the same data model whether it started on your website widget or on your business WhatsApp number.",
      "The training side works the same way regardless of channel. Chatbotistic indexes your site's pages, your uploaded docs, and your product catalogue, and both the widget and the WhatsApp number draw from the same trained knowledge base. There isn't a 'website bot' and a separate 'WhatsApp bot' with different answers — it's one AI agent answering through two channels.",
      "Multilingual handling is detected per-conversation rather than configured per-installation. If a visitor messages in Spanish, the agent replies in Spanish, without an admin having to pre-select which languages the bot supports. This turned out to matter a lot for businesses with WhatsApp-heavy customer bases outside English-speaking markets, where a static language dropdown in a chatbot plugin just doesn't reflect how customers actually message.",
      "Handoff to a human is the part we spent the most engineering time on, because it's the part that determines whether customers trust the bot at all. The moment a conversation needs a person — the visitor asks for something the agent can't resolve, or explicitly asks for a human — Chatbotistic hands off with the full conversation history attached, on both the website widget and WhatsApp. If CRMistic is installed, that handoff also creates or updates the CRM contact automatically, so the person picking up the conversation isn't starting from zero.",
      "None of this required a WhatsApp-specific CRMistic integration to be built separately — it's the same event Chatbotistic already emits for any conversation, and CRMistic already listens for it. That's the pattern across the WPistic suite: build the event once, let every other product that cares about it subscribe, rather than hand-wiring a point-to-point integration for every channel.",
    ],
  },
  {
    slug: "licenseistic-public-rest-api",
    title: "Announcing Licenseistic's public REST API",
    excerpt:
      "The same license-issuance engine that runs entitlements across the WPistic suite is now available to plug into your own plugin or theme business.",
    date: "2026-03-18",
    author: "WPistic Team",
    category: "Announcements",
    content: [
      "Licenseistic has always done double duty: it's a standalone WordPress plugin for managing license keys on your own commercial plugins and themes, and it's also the entitlements engine that WPistic runs on internally — the same system that decides whether your Chatbotistic subscription is active grants a valid Licenseistic activation. Today we're opening up the REST API that powers that second use case to every Licenseistic customer.",
      "Concretely, that means you can now issue, validate, and revoke license keys for your own software from your own systems — a checkout flow, an internal admin tool, a migration script — without going through the Licenseistic wp-admin screen by hand. The API covers the same operations the plugin's own update-checker and activation flow use, so there's no second-class 'API version' of the licensing logic that behaves differently from the UI.",
      "The most requested use case, by a wide margin, was bulk issuance during a migration off a homegrown or third-party license server. If you're moving from a custom-built system, you can script the import: create the license records via the API, backfill activation history, and cut your update-checker endpoint over to Licenseistic without asking every customer to re-activate manually.",
      "Per-domain activation limits and self-service deactivation — the two features customers ask for most — are both exposed through the API, not just the admin UI. A customer moving a plugin from a staging domain to production can deactivate their old activation themselves, through your own account portal if you build one on top of the API, rather than emailing your support inbox.",
      "The API also reacts to the same Memberistic plan-change events that drive entitlements internally, if you're running Memberistic alongside Licenseistic. A membership upgrade or downgrade can grant, suspend, or revoke a license automatically — the exact mechanism that keeps a WPistic customer's own product access in sync when they change plans, now available for your product's licenses too.",
      "Documentation and API keys are available from the Licenseistic settings screen for anyone on a paid plan. If you're issuing licenses for your own plugin or theme business today through a custom server, we'd genuinely like to hear about your migration — reach out to support and we'll help you plan the cutover.",
    ],
  },
  {
    slug: "northloop-digital-onboarding-afternoon",
    title: "How Northloop Digital cut client onboarding from 2 weeks to an afternoon",
    excerpt:
      "A closer look at how one web design agency standardized every client build on Chatbotistic, CRMistic, and Bookingistic — and what changed operationally once they did.",
    date: "2026-02-09",
    author: "Customer Stories",
    category: "Customer Stories",
    content: [
      "Northloop Digital is a web design agency that, like most agencies building on WordPress, used to make a fresh tooling decision on every client project: which chat widget, which CRM, which booking plugin. Founder Priya Nair describes the old process as 're-deciding our stack on every project' — evaluating options, configuring each tool separately, and documenting a slightly different setup for every client site.",
      "The onboarding timeline reflected that. A new client build meant provisioning a chat tool and writing training content for it, standing up a CRM and importing contacts, configuring a booking plugin and its calendar rules, and then manually connecting the three — usually with a Zapier account bridging the gaps a plugin's own integrations didn't cover. Northloop's team put that process at roughly two weeks per client, most of it spent on configuration and integration rather than actual design or build work.",
      "Switching to WPistic's suite didn't just replace three tools with three other tools — it replaced three separate configuration processes with one. Chatbotistic, CRMistic, and Bookingistic share a single WPistic account per client, so provisioning access is one step instead of three, and the products already pass data to each other: a Chatbotistic conversation becomes a CRMistic contact automatically, and a Bookingistic appointment shows up in the same contact's timeline without an export/import step.",
      "The result, in Northloop's own numbers, is onboarding that now takes an afternoon instead of two weeks. Support tickets per client dropped by roughly 38% after Chatbotistic started triaging routine questions before they reached a human, and the agency now runs an average of three WPistic products per client site as a standard part of every build, rather than a custom tooling decision made from scratch each time.",
      "What changed operationally is less about any single feature and more about Northloop no longer needing a 'tooling decision' step in their project process at all. New team members can be trained once on a standard stack instead of relearning a different combination of plugins for every client. Priya put it simply: clients get the same reliable set of products, and the agency gets one dashboard instead of twelve logins across their client roster.",
      "Northloop's full story — including the specific products they run and the results they've tracked since switching — is covered in more detail on our customer stories page, alongside similar accounts from Fieldstack Plugins and Rowhouse Agency.",
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
