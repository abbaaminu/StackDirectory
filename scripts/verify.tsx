/**
 * StackDirectory verification suite.
 *
 * Run with `npm run verify` (bundles this file with esbuild, then executes it in
 * Node). It covers the three layers where regressions have historically slipped
 * through:
 *
 *   1. pure logic   - filters, sorting, redaction, slugs, storage, submissions
 *   2. rendering    - every component App mounts (react-dom/server)
 *   3. api handlers - api/send-email.ts and api/paddle-webhook.ts end to end,
 *                     with Supabase/Resend network calls stubbed out
 *
 * No test framework is required: the assertions are plain functions and the
 * suite exits non-zero when anything fails, so it can be wired into CI.
 */
import { createHmac } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import App from "../src/App";
import { AcquisitionModal } from "../src/components/AcquisitionModal";
import { AdminQueueModal } from "../src/components/AdminQueueModal";
import { AuthModal } from "../src/components/AuthModal";
import { CodeViewerModal } from "../src/components/CodeViewerModal";
import { DealRoomModal } from "../src/components/DealRoomModal";
import { FAQModal } from "../src/components/FAQModal";
import { Footer } from "../src/components/Footer";
import { Hero } from "../src/components/Hero";
import { PaddleWebhookSimulator } from "../src/components/PaddleWebhookSimulator";
import { SubmitModal } from "../src/components/SubmitModal";
import { SupportModal } from "../src/components/SupportModal";
import { TermsModal } from "../src/components/TermsModal";
import { ToolCard, ToolCardSkeleton } from "../src/components/ToolCard";
import { ToolDetailModal } from "../src/components/ToolDetailModal";
import adminToolsHandler from "../api/admin-tools";
import paddleWebhookHandler, { verifyPaddleSignature } from "../api/paddle-webhook";
import sendEmailHandler from "../api/send-email";
import { INITIAL_TOOLS } from "../src/data/mockTools";
import { getAdminEmails, isAdminEmail, isAdminUser } from "../src/lib/admin";
import {
  ADMIN_TOOLS_ENDPOINT,
  callAdminToolAction,
  isAdminApiUnavailable,
} from "../src/lib/adminTools";
import {
  readJsonArray,
  readStringArray,
  STORAGE_KEYS,
  writeJsonArray,
  writeStringArray,
} from "../src/lib/localStore";
import {
  isPaddleCheckoutAbandoned,
  isPaddleCheckoutCompleted,
  PADDLE_CHECKOUT_COMPLETED,
  readPaddleEventName,
} from "../src/lib/paddleCheckout";
import { sanitizeDealMessage } from "../src/lib/redact";
import { buildToolInsertRow, createToolId, isDuplicateRowError } from "../src/lib/submissions";
import { getHostname, getPricingBadgeColor } from "../src/lib/toolDisplay";
import { buildCategoryOptions, matchesToolFilters, sortTools } from "../src/lib/toolFilters";
import { getToolSlug } from "../src/lib/toolSlug";
import { ALL_CATEGORIES } from "../src/types/directory";
import type { Tool } from "../src/types/directory";

/* ------------------------------------------------------------------ harness */

let passed = 0;
const failures: string[] = [];

const check = (label: string, condition: boolean, detail = ""): void => {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(detail ? `${label} (${detail})` : label);
};

const section = (title: string): void => {
  console.log(`\n=== ${title} ===`);
};

const render = (element: ReactElement): string => renderToStaticMarkup(element);

/* --------------------------------------------------- browser API stand-ins */

const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => void memoryStorage.set(key, String(value)),
    removeItem: (key: string) => void memoryStorage.delete(key),
  },
});
const resetStorage = (): void => memoryStorage.clear();

const noop = (): void => {};

/**
 * SubmitModal hands every submission to App through this prop. Recording the
 * calls lets the suite assert that a plain render (or a re-render) never writes
 * anything on its own.
 */
const submitCalls: Array<{ tool: Tool; isPaddleCheckout: boolean }> = [];
const submitSpy = async (tool: Tool, isPaddleCheckout?: boolean): Promise<void> => {
  submitCalls.push({ tool, isPaddleCheckout: Boolean(isPaddleCheckout) });
};

/* --------------------------------------------------------------- fixtures */

const freeTool = INITIAL_TOOLS[2]; // Raycast - approved, featured, not for sale
const forSaleTool = INITIAL_TOOLS[0]; // DocuVector AI - approved, featured, for sale
const pendingTool = INITIAL_TOOLS[8]; // DevPulse Monitor - pending review

/* ------------------------------------------------------------------- logic */

section("Filter / sort / category logic");

const allFilters = { viewMode: "all" as const, pricingFilter: "All" as const, categoryFilter: ALL_CATEGORIES, searchQuery: "" };

check("viewMode=all keeps every listing", matchesToolFilters(freeTool, allFilters));
check("viewMode=for_sale drops listings that are not for sale",
  !matchesToolFilters(freeTool, { ...allFilters, viewMode: "for_sale" }));
check("viewMode=for_sale keeps for-sale listings",
  matchesToolFilters(forSaleTool, { ...allFilters, viewMode: "for_sale" }));
check("pricing filter only keeps the requested tier",
  !matchesToolFilters(freeTool, { ...allFilters, pricingFilter: "Paid" }));
check("search covers name, tagline, category, description and tech stack",
  matchesToolFilters(forSaleTool, { ...allFilters, searchQuery: "PGVECTOR" }) &&
  matchesToolFilters(forSaleTool, { ...allFilters, searchQuery: "compliance teams" }) &&
  matchesToolFilters(forSaleTool, { ...allFilters, searchQuery: "AI & Machine Learning" }) &&
  !matchesToolFilters(freeTool, { ...allFilters, searchQuery: "zzzz-nope" }));
check("blank searches match everything",
  matchesToolFilters(freeTool, { ...allFilters, searchQuery: "   " }));

const popularSorted = sortTools([freeTool, forSaleTool], "Most Popular");
check("Most Popular sorts by upvotes desc", popularSorted[0].upvotes >= popularSorted[1].upvotes);

const recencySorted = sortTools(
  [
    { ...freeTool, id: "a", created_at: "not-a-date", upvotes: 1 },
    { ...freeTool, id: "b", created_at: new Date().toISOString(), upvotes: 0 },
  ],
  "Recently Added",
);
check("Recently Added sorts newest first and pushes malformed dates last",
  recencySorted[0].id === "b" && recencySorted[1].id === "a");

const source = [freeTool, forSaleTool];
sortTools(source, "Most Popular");
check("sortTools never mutates its input", source[0].id === freeTool.id);

const approvedSeed = INITIAL_TOOLS.filter((tool) => tool.is_approved);
const categoryOptions = buildCategoryOptions(approvedSeed);
check("category pills start with the All Categories reset pill",
  categoryOptions[0].label === ALL_CATEGORIES && categoryOptions[0].count === approvedSeed.length);
check("category pills are unique and alphabetically sorted",
  new Set(categoryOptions.slice(1).map((option) => option.label)).size === categoryOptions.length - 1 &&
  categoryOptions.slice(1).every((option, index, list) =>
    index === 0 || list[index - 1].label.localeCompare(option.label) <= 0));
check("category pill counts stay in scope",
  categoryOptions.slice(1).every((option) => option.count > 0));

section("Redaction, slugs and display helpers");

const redacted = sanitizeDealMessage(
  "ping me at founder@example.com or +1 415-555-0100, telegram: @founder, see https://example.com/deal",
);
check("emails are redacted", redacted.sanitizedText.includes("[Email Redacted for Security]"));
check("phone numbers are redacted", redacted.sanitizedText.includes("[Phone Redacted for Security]"));
check("external links are redacted", redacted.sanitizedText.includes("[External Link Redacted]"));
check("messaging handles are redacted", redacted.sanitizedText.includes("[Handle Redacted]"));
check("hasRedactions is reported", redacted.hasRedactions);
check("clean text is left untouched", !sanitizeDealMessage("MRR is 1.2k").hasRedactions);

check("slug comes from the name", getToolSlug({ id: "x", name: "Warp Terminal" }) === "warp-terminal");
check("slug falls back to the id", getToolSlug({ id: "tool_123", name: "!!! " }) === "tool_123");
check("hostname parses and fails safely",
  getHostname("https://www.warp.dev/pricing") === "www.warp.dev" && getHostname("nope") === null);
check("pricing badges cover every tier plus a default",
  getPricingBadgeColor("Free") !== getPricingBadgeColor("Paid") &&
  getPricingBadgeColor("Free").includes("emerald") &&
  getPricingBadgeColor("mystery").includes("bg-slate-100"));

section("Device storage helpers");

resetStorage();
check("missing keys read as empty arrays", readJsonArray(STORAGE_KEYS.tools).length === 0);
writeJsonArray(STORAGE_KEYS.tools, [pendingTool]);
check("write/read round-trips", readJsonArray<Tool>(STORAGE_KEYS.tools)[0]?.id === pendingTool.id);
memoryStorage.set(STORAGE_KEYS.tools, "{not json");
check("corrupt JSON degrades to an empty array", readJsonArray(STORAGE_KEYS.tools).length === 0);
memoryStorage.set(STORAGE_KEYS.tools, JSON.stringify({ nope: true }));
check("non-array JSON degrades to an empty array", readJsonArray(STORAGE_KEYS.tools).length === 0);
memoryStorage.set(STORAGE_KEYS.votedTools, JSON.stringify(["1", 2, null]));
check("id lists keep only strings", readStringArray(STORAGE_KEYS.votedTools).join() === "1");
writeStringArray(STORAGE_KEYS.savedTools, ["one", "two"]);
check("id lists round-trip through writeStringArray",
  readStringArray(STORAGE_KEYS.savedTools).join() === "one,two");
check("the acquisition and deal-room offer keys agree",
  STORAGE_KEYS.acquisitionOffers === "stackdirectory_acquisition_offers");

section("Submission helpers - paid Featured flow invariants");

const generatedId = createToolId();
check("generated ids are RFC 4122 v4 uuids",
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(generatedId),
  generatedId);
check("generated ids are unique", createToolId() !== createToolId());

const insertRow = buildToolInsertRow({ ...pendingTool, id: generatedId });
check("insert row keeps the client id so Paddle custom_data.tool_id resolves",
  insertRow.id === generatedId);
check("inserted listings enter the moderation queue",
  insertRow.status === "pending" && insertRow.is_approved === false);
check("marketplace columns survive the insert mapping",
  insertRow.is_for_sale === true &&
  insertRow.asking_price === pendingTool.asking_price &&
  insertRow.seller_contact === pendingTool.seller_contact &&
  insertRow.tech_stack.length === (pendingTool.tech_stack ?? []).length);
check("optional numeric columns default to 0 / empty",
  buildToolInsertRow({ ...pendingTool, monthly_revenue: undefined }).monthly_revenue === 0 &&
  buildToolInsertRow({ ...pendingTool, tech_stack: undefined }).tech_stack.length === 0);

section("Admin allow-list");

check("plural and singular vars are both parsed",
  getAdminEmails().includes("admin@example.com") &&
  getAdminEmails().includes("second@example.com"));
check("emails are normalised before comparison", isAdminEmail(" ADMIN@Example.com "));
check("unknown emails are rejected", !isAdminEmail("random@example.com"));
check("no user means no admin", !isAdminUser(null));
check("allow-listed users are admins",
  isAdminUser({ email: "admin@example.com", app_metadata: {} } as never));
check("supabase role=admin grants access without an env entry",
  isAdminUser({ email: "someone@else.com", app_metadata: { role: "admin" } } as never));
check("a signed-in non-admin is not an admin",
  !isAdminUser({ email: "random@example.com", app_metadata: {} } as never));

/* -------------------------------------------------------------- rendering */

section("Component rendering");

const footerHtml = render(
  <Footer onOpenFAQ={noop} onOpenTerms={noop} onOpenSupport={noop} />,
);
check("Footer renders every legal/support entry point",
  footerHtml.includes("FAQs") &&
  footerHtml.includes("Terms") &&
  footerHtml.includes("Contact Support") &&
  footerHtml.includes("StackBuild Co"));

check("closed modals render nothing",
  render(<FAQModal isOpen={false} onClose={noop} />) === "" &&
  render(<TermsModal isOpen={false} onClose={noop} />) === "" &&
  render(<SupportModal isOpen={false} onClose={noop} />) === "" &&
  render(<SubmitModal isOpen={false} onClose={noop} onSubmitTool={submitSpy} />) === "" &&
  render(<AuthModal isOpen={false} initialMode="login" onClose={noop} />) === "");

const faqHtml = render(<FAQModal isOpen onClose={noop} />);
check("FAQ modal lists questions and a working support address",
  faqHtml.includes("Frequently Asked Questions") &&
  faqHtml.includes("How do I submit my app?") &&
  faqHtml.includes("mailto:support@stackbuildco.com") &&
  !faqHtml.includes("support@support@"));

const supportHtml = render(<SupportModal isOpen onClose={noop} />);
check("Support modal renders the contact form and mailto fallbacks",
  supportHtml.includes("Copy Email Address") &&
  supportHtml.includes("Open in Gmail") &&
  supportHtml.includes("Open in Outlook Web") &&
  supportHtml.includes('type="email"'));

check("Terms modal renders the liability sections",
  render(<TermsModal isOpen onClose={noop} />).includes("Strict Limitation of Liability"));

const authHtml = render(<AuthModal isOpen initialMode="signup" onClose={noop} />);
check("Auth modal opens in the requested mode",
  authHtml.includes("Create Account") && authHtml.includes('type="password"'));

const cardHtml = render(
  <ToolCard
    tool={forSaleTool}
    onToggleUpvote={noop}
    onToggleFavorite={noop}
    onOpenAcquisition={noop}
    onOpenDetails={noop}
    onOpenDealRoom={noop}
  />,
);
check("ToolCard renders listing content and both acquisition CTAs",
  cardHtml.includes(forSaleTool.name) &&
  cardHtml.includes("FOR SALE") &&
  cardHtml.includes("Make Offer") &&
  cardHtml.includes("Contact Founder") &&
  cardHtml.includes(String(forSaleTool.upvotes)));

const freeCardHtml = render(<ToolCard tool={freeTool} onToggleUpvote={noop} />);
check("ToolCard hides acquisition CTAs for non-sale listings",
  !freeCardHtml.includes("Make Offer") && !freeCardHtml.includes("FOR SALE"));
check("ToolCard exposes an accessible favorite control",
  freeCardHtml.includes('aria-label="Save to favorites"'));
check("ToolCardSkeleton renders a loading placeholder",
  render(<ToolCardSkeleton />).includes("animate-pulse"));

const detailHtml = render(
  <ToolDetailModal
    isOpen
    tool={forSaleTool}
    onClose={noop}
    onToggleUpvote={noop}
    onToggleFavorite={noop}
    onOpenAcquisition={noop}
  />,
);
check("ToolDetailModal renders metrics, share options and the offer CTA",
  detailHtml.includes("Asking Price") &&
  detailHtml.includes("referral clicks") &&
  detailHtml.includes("Share Listing") &&
  detailHtml.includes("Copy Link") &&
  detailHtml.includes("Make an Offer") &&
  // share links embed the canonical ?tool=<slug> deep link
  detailHtml.includes(getToolSlug(forSaleTool)));
check("ToolDetailModal closes cleanly",
  render(<ToolDetailModal isOpen={false} tool={null} onClose={noop} onToggleUpvote={noop} />) === "");

const heroHtml = render(
  <Hero
    searchQuery=""
    onSearchChange={noop}
    selectedPricing="All"
    onPricingChange={noop}
    selectedTab="all"
    onTabChange={noop}
    selectedSort="Most Popular"
    onSortChange={noop}
    selectedCategory={ALL_CATEGORIES}
    onCategoryChange={noop}
    categories={categoryOptions}
    totalApproved={approvedSeed.length}
    forSaleCount={approvedSeed.filter((tool) => tool.is_for_sale).length}
    onOpenSubmit={noop}
  />,
);
check("(showcase) Hero renders live counts and filter groups",
  heroHtml.includes("Acquisition Marketplace") &&
  heroHtml.includes("Live Apps") &&
  heroHtml.includes("Sort"));

const acquisitionHtml = render(
  <AcquisitionModal isOpen tool={forSaleTool} onClose={noop} onOpenDealRoom={noop} />,
);
check("Acquisition modal shows the asking price and offer form",
  acquisitionHtml.includes(String(forSaleTool.asking_price)) &&
  acquisitionHtml.includes("Submit Offer"));

check("Deal room modal opens for the selected listing",
  render(<DealRoomModal isOpen tool={forSaleTool} userId="local-demo-user" onClose={noop} />)
    .includes("Deal Room:"));

check("Admin queue refuses non-admins",
  render(
    <AdminQueueModal
      isOpen
      onClose={noop}
      user={{ email: "random@example.com", app_metadata: {} } as never}
      onSetFeature={noop}
      onSetForSale={noop}
    />,
  ).includes("Admin access required"));

check("Admin queue renders for allow-listed admins",
  render(
    <AdminQueueModal
      isOpen
      onClose={noop}
      user={{ email: "admin@example.com", app_metadata: {} } as never}
      onSetFeature={noop}
      onSetForSale={noop}
    />,
  ).includes("Pending Review Queue"));

const submitHtml = render(<SubmitModal isOpen onClose={noop} onSubmitTool={submitSpy} />);
check("Submit modal renders both tiers and the free path",
  submitHtml.includes("Free Submission") &&
  submitHtml.includes("INSTANT LAUNCH") &&
  submitHtml.includes("Auto-fill Details") &&
  submitHtml.includes("Submit 100% Free ($0) to Queue"));
check("rendering the submit modal (or its paid tier) writes nothing by itself",
  submitCalls.length === 0);

check("(showcase) code viewer renders the blueprint corpus",
  render(<CodeViewerModal isOpen onClose={noop} />).includes("Stack Highlights:"));

check("(showcase) webhook simulator renders a payload preview",
  render(
    <PaddleWebhookSimulator isOpen onClose={noop} tools={[pendingTool]} onTriggerWebhookUpgrade={noop} />,
  ).includes("Dispatch Test Webhook"));

const appHtml = render(<App />);
check("App shell renders the header, marketing gate and footer",
  appHtml.includes("StackDirectory") &&
  appHtml.includes("Sign Up Free") &&
  appHtml.includes("Built for builders and buyers") &&
  appHtml.includes("Contact Support"));

/* ------------------------------------------------------------ api handlers */

section("Handler test doubles");

type FetchCall = { url: string; method: string; body: string };

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  headers: {
    get: () => null,
    entries: () => [] as Array<[string, string]>,
  },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const createReqRes = (
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
) => {
  const raw = options.body ?? "";
  const req = {
    method: options.method ?? "POST",
    headers: options.headers ?? {},
    on(event: string, listener: (chunk?: unknown) => void) {
      if (event === "data" && raw) listener(Buffer.from(raw));
      if (event === "end") listener();
      return req;
    },
    destroy: noop,
  };
  const res = {
    statusCode: 0,
    body: "",
    setHeader: noop,
    end(value?: string) {
      res.body = value ?? "";
    },
  };
  return { req, res };
};

const invoke = async (
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
) => {
  const { req, res } = createReqRes(options);
  await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
};

const withEnv = async <T,>(
  values: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> => {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withFetch = async <T,>(
  stub: (input: unknown, init?: { method?: string; body?: unknown }) => unknown,
  run: () => Promise<T>,
): Promise<T> => {
  const original = globalThis.fetch;
  (globalThis as { fetch: unknown }).fetch = stub;
  try {
    return await run();
  } finally {
    (globalThis as { fetch: unknown }).fetch = original;
  }
};

section("api/send-email.ts");

check("GET is rejected with 405", (await invoke(sendEmailHandler, { method: "GET" })).status === 405);

const unknownType = await invoke(sendEmailHandler, { body: JSON.stringify({ type: "NOPE" }) });
check("unknown payload types are rejected with 400", unknownType.status === 400);

const missingKey = await withEnv({ RESEND_API_KEY: undefined }, () =>
  invoke(sendEmailHandler, {
    body: JSON.stringify({
      type: "SUPPORT_MESSAGE",
      senderName: "A",
      senderEmail: "a@b.co",
      category: "General Support",
      message: "hi",
    }),
  }),
);
check("a missing RESEND_API_KEY fails loudly with 500", missingKey.status === 500);

const sentMails: Array<Record<string, unknown>> = [];

/** Resend may hand us a string URL or a WHATWG Request - handle both. */
const resendStub = async (input: unknown, init?: { body?: unknown }) => {
  const requestLike = input as { url?: string; text?: () => Promise<string> } | undefined;
  const url = typeof input === "string" ? input : requestLike?.url ?? "";
  let rawBody = typeof init?.body === "string" ? init.body : "";
  if (!rawBody && typeof requestLike?.text === "function") rawBody = await requestLike.text();
  sentMails.push({ url, ...(JSON.parse(rawBody || "{}") as Record<string, unknown>) });
  return jsonResponse({ id: "email_1" });
};

const supportResult = await withEnv(
  { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "StackDirectory <noreply@example.com>" },
  () =>
    withFetch(resendStub, () =>
      invoke(sendEmailHandler, {
        body: JSON.stringify({
          type: "SUPPORT_MESSAGE",
          senderName: "<b>A</b>",
          senderEmail: "a@b.co",
          category: "Report Listing",
          message: "line1\nline2 & <script>alert(1)</script>",
        }),
      }),
    ),
);
check("valid support messages are accepted", supportResult.status === 200 && supportResult.body?.success === true);
const supportMail = sentMails[sentMails.length - 1];
check("support mail goes to support@ with the sender as reply-to",
  supportMail?.to === "support@stackbuildco.com" && supportMail?.reply_to === "a@b.co",
  JSON.stringify(supportMail ?? null));
check("free-text fields are HTML-escaped before they reach the inbox",
  String(supportMail?.html ?? "").includes("&lt;script&gt;") &&
  !String(supportMail?.html ?? "").includes("<script>"));

/* ------------------------------------------------------------ paddle flow */

section("api/paddle-webhook.ts - signature verification");

const webhookSecret = "pdl_ntf_set_test_secret";
const eventBody = JSON.stringify({ event_type: "transaction.completed", data: {} });

const sign = (body: string, offsetSeconds = 0, secret = webhookSecret): string => {
  const timestamp = Math.floor(Date.now() / 1000) + offsetSeconds;
  const digest = createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex");
  return `ts=${timestamp};h1=${digest}`;
};

check("a correctly signed body is accepted", verifyPaddleSignature(eventBody, sign(eventBody), webhookSecret));
check("a tampered body is rejected", !verifyPaddleSignature(`${eventBody} `, sign(eventBody), webhookSecret));
check("a wrong secret is rejected", !verifyPaddleSignature(eventBody, sign(eventBody, 0, "other"), webhookSecret));
check("a stale timestamp is rejected", !verifyPaddleSignature(eventBody, sign(eventBody, -3600), webhookSecret));
check("a missing header is rejected", !verifyPaddleSignature(eventBody, undefined, webhookSecret));
check("an unconfigured secret is rejected", !verifyPaddleSignature(eventBody, sign(eventBody), ""));

section("api/paddle-webhook.ts - paid Featured upgrade");

type PaddleEvent = { raw: string; toolId: string };

const buildPaddleEvent = (toolId: string, websiteUrl = ""): PaddleEvent => {
  const raw = JSON.stringify({
    event_id: "evt_1",
    event_type: "transaction.completed",
    occurred_at: new Date().toISOString(),
    data: {
      id: "txn_1",
      status: "completed",
      customer_id: "ctm_1",
      currency_code: "USD",
      invoice_number: "INV-1",
      customer: { email: "buyer@example.com" },
      custom_data: {
        tool_id: toolId,
        plan_type: "featured_listing",
        tool_name: "DocuVector AI",
        tool_slug: "docuvector-ai",
        website_url: websiteUrl,
        customer_email: "buyer@example.com",
        category: "AI & Machine Learning",
        pricing_type: "Paid",
        tagline: "Contract intelligence for compliance teams",
        description: "Contract intelligence for compliance teams",
      },
      details: { totals: { total: "500", grand_total: "500", currency_code: "USD" } },
      items: [
        {
          quantity: 1,
          price: { description: "Featured Listing", unit_price: { amount: 500, currency_code: "USD" } },
        },
      ],
    },
  });
  return { raw, toolId };
};

const createBackendStub = (rowsById: unknown[], rowsByUrl: unknown[] = []) => {
  const calls: FetchCall[] = [];
  const stub = (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    if (url.includes("/rest/v1/tools")) {
      return jsonResponse(url.includes("id=eq.") ? rowsById : rowsByUrl);
    }
    if (url.includes("/api/send-email")) return jsonResponse({ success: true });
    return jsonResponse({}, false, 404);
  };
  return { stub, calls };
};

const productionEnv = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PADDLE_WEBHOOK_SECRET_KEY: webhookSecret,
  NODE_ENV: "production",
  APP_URL: "https://apps.stackbuildco.com",
};

const paidToolId = createToolId();
const paidEvent = buildPaddleEvent(paidToolId, "https://docuvector.app");
const paidBackend = createBackendStub([
  {
    id: paidToolId,
    name: "DocuVector AI",
    category: "AI & Machine Learning",
    pricing_type: "Paid",
    website_url: "https://docuvector.app",
  },
]);

const paidResult = await withEnv(productionEnv, () =>
  withFetch(paidBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: paidEvent.raw,
      headers: { "paddle-signature": sign(paidEvent.raw) },
    }),
  ),
);

check("a signed transaction.completed is processed",
  paidResult.status === 200 && paidResult.body?.success === true, JSON.stringify(paidResult.body));

const upgradeCall = paidBackend.calls.find((call) => call.url.includes("/rest/v1/tools"));
check("the upgrade targets the id Paddle sent",
  Boolean(upgradeCall?.url.includes(`id=eq.${paidToolId}`)), upgradeCall?.url);

const upgradeBody = JSON.parse(upgradeCall?.body ?? "{}") as Record<string, unknown>;
check("the upgrade approves + features + sets status=approved",
  upgradeBody.is_approved === true &&
  upgradeBody.is_featured === true &&
  upgradeBody.status === "approved",
  JSON.stringify(upgradeBody));
check("the upgrade never writes the invalid status 'active'",
  !JSON.stringify(upgradeBody).includes("active"));

const receiptCall = paidBackend.calls.find((call) => call.url.includes("/api/send-email"));
const receiptBody = JSON.parse(receiptCall?.body ?? "{}") as Record<string, unknown>;
check("a payment receipt is triggered for the buyer", Boolean(receiptCall));
check("the receipt carries the paid amount, currency and transaction",
  receiptBody.amount === 5 &&
  receiptBody.currency === "USD" &&
  receiptBody.transactionId === "txn_1" &&
  receiptBody.customerEmail === "buyer@example.com");
check("the receipt reuses the real listing details",
  receiptBody.toolName === "DocuVector AI" &&
  receiptBody.toolSlug === "docuvector-ai" &&
  receiptBody.category === "AI & Machine Learning");
check("the response reports the receipt", paidResult.body?.emailSent === true);

const legacyId = createToolId();
const legacyEvent = buildPaddleEvent(legacyId, "https://docuvector.app");
const legacyBackend = createBackendStub([], [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "DocuVector AI",
    category: "AI & Machine Learning",
    pricing_type: "Paid",
    website_url: "https://docuvector.app",
  },
]);
const legacyResult = await withEnv(productionEnv, () =>
  withFetch(legacyBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: legacyEvent.raw,
      headers: { "paddle-signature": sign(legacyEvent.raw) },
    }),
  ),
);
check("a mismatched custom_data id still upgrades by website_url",
  legacyResult.status === 200 &&
  legacyBackend.calls.some((call) => call.url.includes("website_url=eq.")),
  JSON.stringify(legacyBackend.calls.map((call) => call.url)));

const unsignedBackend = createBackendStub([{ id: "whatever" }]);
const unsignedResult = await withEnv(productionEnv, () =>
  withFetch(unsignedBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: paidEvent.raw,
      headers: { "paddle-signature": "ts=1;h1=deadbeef" },
    }),
  ),
);
check("a forged/invalid signature is rejected before touching the database",
  unsignedResult.status === 401 && unsignedBackend.calls.length === 0,
  JSON.stringify(unsignedResult.body));

const noSecretResult = await withEnv(
  { ...productionEnv, PADDLE_WEBHOOK_SECRET_KEY: undefined },
  () =>
    withFetch(createBackendStub([]).stub, () =>
      invoke(paddleWebhookHandler, { body: paidEvent.raw, headers: { "paddle-signature": sign(paidEvent.raw) } }),
    ),
);
check("production fails closed when the webhook secret is missing", noSecretResult.status === 500);

const noKeyResult = await withEnv(
  { ...productionEnv, SUPABASE_SERVICE_ROLE_KEY: undefined },
  () =>
    withFetch(createBackendStub([]).stub, () =>
      invoke(paddleWebhookHandler, {
        body: paidEvent.raw,
        headers: { "paddle-signature": sign(paidEvent.raw) },
      }),
    ),
);
check("a missing service role key reports a configuration error", noKeyResult.status === 500);

check("non-POST requests are rejected",
  (await invoke(paddleWebhookHandler, { method: "GET" })).status === 405);

const createdEvent = JSON.stringify({
  event_id: "evt_2",
  event_type: "transaction.created",
  data: { id: "txn_2", status: "draft", custom_data: { tool_id: paidToolId } },
});
const createdBackend = createBackendStub([]);
const createdResult = await withEnv(productionEnv, () =>
  withFetch(createdBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: createdEvent,
      headers: { "paddle-signature": sign(createdEvent) },
    }),
  ),
);
check("non-completed events are acknowledged without upgrading anything",
  createdResult.status === 200 &&
  createdResult.body?.emailSent === false &&
  createdBackend.calls.length === 0);

section("Paid Featured flow - App <-> Paddle <-> webhook round trip");

const submittedRow = buildToolInsertRow({ ...pendingTool, id: createToolId() });
const roundTripEvent = buildPaddleEvent(submittedRow.id, submittedRow.website_url);
const roundTripBackend = createBackendStub([
  {
    id: submittedRow.id,
    name: submittedRow.name,
    category: submittedRow.category,
    pricing_type: submittedRow.pricing_type,
    website_url: submittedRow.website_url,
  },
]);
const roundTripResult = await withEnv(productionEnv, () =>
  withFetch(roundTripBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: roundTripEvent.raw,
      headers: { "paddle-signature": sign(roundTripEvent.raw) },
    }),
  ),
);
check("a checkout for a just-submitted listing resolves on the first lookup",
  roundTripResult.status === 200 &&
  roundTripBackend.calls.some((call) => call.url.includes(`id=eq.${submittedRow.id}`)) &&
  !roundTripBackend.calls.some((call) => call.url.includes("website_url=eq.")));
check("the round trip approves the exact row the buyer paid for",
  JSON.parse(
    roundTripBackend.calls.find((call) => call.url.includes("/rest/v1/tools"))?.body ?? "{}",
  ).status === "approved");

/* ------------------------------------------------ paid-tier write gating */

section("src/lib/paddleCheckout.ts - when the paid row may be written");

check("Paddle Billing's `name` field is understood",
  readPaddleEventName({ name: PADDLE_CHECKOUT_COMPLETED }) === PADDLE_CHECKOUT_COMPLETED);
check("legacy `event_type` payloads still resolve",
  isPaddleCheckoutCompleted({ event_type: PADDLE_CHECKOUT_COMPLETED }));
check("only a completed checkout counts as paid",
  !isPaddleCheckoutCompleted({ name: "checkout.loaded" }) &&
  !isPaddleCheckoutCompleted({}) &&
  !isPaddleCheckoutCompleted(null) &&
  !isPaddleCheckoutCompleted(undefined));
check("closing or erroring the overlay releases the held listing",
  isPaddleCheckoutAbandoned({ name: "checkout.closed" }) &&
  isPaddleCheckoutAbandoned({ event_type: "checkout.error" }));
check("a completed checkout is never treated as abandoned",
  !isPaddleCheckoutAbandoned({ name: PADDLE_CHECKOUT_COMPLETED }));
check("a duplicate-key insert on the paid path counts as already handled",
  isDuplicateRowError({ code: "23505" }) &&
  isDuplicateRowError({ message: 'duplicate key value violates unique constraint "tools_pkey"' }) &&
  !isDuplicateRowError({ code: "42501", message: "permission denied" }) &&
  !isDuplicateRowError(null));

/* ----------------------------------------------- review-queue mutations */

section("src/lib/adminTools.ts - queue mutations");

type ApiCall = { url: string; method: string; body: string; authorization: string; apiKey: string };

const apiCalls: ApiCall[] = [];

const readHeader = (headers: unknown, name: string): string => {
  if (!headers) return "";
  const withGet = headers as { get?: (key: string) => string | null };
  if (typeof withGet.get === "function") return String(withGet.get(name) ?? "");
  const record = headers as Record<string, string>;
  return String(record[name] ?? record[name.toLowerCase()] ?? "");
};

const toApiCall = (
  input: unknown,
  init?: { method?: string; body?: unknown; headers?: unknown },
): ApiCall => ({
  url: typeof input === "string" ? input : String((input as { url?: string })?.url ?? ""),
  method: init?.method ?? "GET",
  body: typeof init?.body === "string" ? init.body : "",
  authorization: readHeader(init?.headers, "Authorization"),
  apiKey: readHeader(init?.headers, "apikey"),
});

/** Fetch double that records the request and answers with a canned payload. */
const adminApiStub =
  (result: unknown, status = 200) =>
  (input: unknown, init?: { method?: string; body?: unknown; headers?: unknown }) => {
    apiCalls.push(toApiCall(input, init));
    return jsonResponse(result, status < 400, status);
  };

apiCalls.length = 0;
const deletedViaApi = await withFetch(adminApiStub({ success: true, affected: 1 }), () =>
  callAdminToolAction("delete", "11111111-1111-4111-8111-111111111111", "access-token-1"),
);
check("a delete posts its action to the admin endpoint",
  deletedViaApi.ok &&
  deletedViaApi.affected === 1 &&
  apiCalls.length === 1 &&
  apiCalls[0].url === ADMIN_TOOLS_ENDPOINT &&
  apiCalls[0].method === "POST" &&
  JSON.parse(apiCalls[0].body).action === "delete",
  JSON.stringify(apiCalls[0] ?? null));
check("the mutation carries the admin's Supabase access token",
  apiCalls[0]?.authorization === "Bearer access-token-1");

const rejectedCall = await withFetch(
  adminApiStub({ success: false, error: "not an admin" }, 403),
  () => callAdminToolAction("delete", "abc", "access-token-1"),
);
check("a 403 is surfaced with its message and is not 'unavailable'",
  !rejectedCall.ok &&
  rejectedCall.status === 403 &&
  !isAdminApiUnavailable(rejectedCall) &&
  rejectedCall.error === "not an admin");

const brokenServer = await withFetch(
  adminApiStub({ success: false, error: "no service key" }, 500),
  () => callAdminToolAction("delete", "abc", "access-token-1"),
);
check("a 500 counts as 'unavailable' so the queue may fall back",
  !brokenServer.ok && isAdminApiUnavailable(brokenServer));

const offlineCall = await withFetch(
  () => {
    throw new Error("network down");
  },
  () => callAdminToolAction("delete", "abc", "access-token-1"),
);
check("an unreachable endpoint reports status 0 and never throws",
  !offlineCall.ok &&
  offlineCall.status === 0 &&
  isAdminApiUnavailable(offlineCall) &&
  offlineCall.error === "network down");

apiCalls.length = 0;
const blankIdCall = await withFetch(adminApiStub({ success: true, affected: 1 }), () =>
  callAdminToolAction("delete", "   ", "access-token-1"),
);
const noTokenCall = await withFetch(adminApiStub({ success: true, affected: 1 }), () =>
  callAdminToolAction("delete", "abc", ""),
);
check("a blank id or a missing token is rejected locally, without any request",
  blankIdCall.status === 400 && noTokenCall.status === 401 && apiCalls.length === 0);

/* ---------------------------------------------------- admin api handler */

section("api/admin-tools.ts - service-role moderation");

const adminEnv = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  ADMIN_EMAILS: "admin@example.com",
};

const adminUser = { id: "u1", email: "admin@example.com", app_metadata: {} };
const deleteRowId = createToolId();

const createAdminStub = (options: { rows?: unknown[]; user?: unknown | null } = {}) => {
  const rows = options.rows ?? [{}];
  const user = options.user === undefined ? adminUser : options.user;
  const calls: ApiCall[] = [];
  const stub = (input: unknown, init?: { method?: string; body?: unknown; headers?: unknown }) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
    calls.push(toApiCall(input, init));
    if (url.includes("/auth/v1/user")) {
      return user ? jsonResponse(user) : jsonResponse({ message: "invalid token" }, false, 401);
    }
    if (url.includes("/rest/v1/tools")) return jsonResponse(rows);
    return jsonResponse({}, false, 404);
  };
  return { stub, calls };
};

const invokeAdmin = (
  toolStub: (input: unknown, init?: { method?: string; body?: unknown; headers?: unknown }) => unknown,
  options: {
    action?: string;
    toolId?: string;
    token?: string | null;
    env?: Record<string, string | undefined>;
  } = {},
) =>
  withEnv({ ...adminEnv, ...(options.env ?? {}) }, () =>
    withFetch(toolStub, () =>
      invoke(adminToolsHandler, {
        headers:
          options.token === null
            ? {}
            : { authorization: `Bearer ${options.token ?? "session-jwt"}` },
        body: JSON.stringify({
          action: options.action ?? "delete",
          toolId: options.toolId ?? deleteRowId,
        }),
      }),
    ),
  );

check("GET is rejected with 405", (await invoke(adminToolsHandler, { method: "GET" })).status === 405);

const unknownAction = await invokeAdmin(createAdminStub().stub, { action: "drop_everything" });
check("an unknown action is rejected with 400",
  unknownAction.status === 400, JSON.stringify(unknownAction.body));

const anonymousBackend = createAdminStub();
const anonymousDelete = await invokeAdmin(anonymousBackend.stub, { token: null });
check("a delete without a session token is rejected before any database call",
  anonymousDelete.status === 401 && anonymousBackend.calls.length === 0,
  JSON.stringify(anonymousDelete.body));

const forgedDelete = await invokeAdmin(createAdminStub({ user: null }).stub);
check("a token Supabase does not recognise is rejected with 401", forgedDelete.status === 401);

const intruderDelete = await invokeAdmin(
  createAdminStub({ user: { id: "u2", email: "intruder@example.com", app_metadata: {} } }).stub,
);
check("an authenticated non-admin is rejected with 403",
  intruderDelete.status === 403, JSON.stringify(intruderDelete.body));

const deleteBackend = createAdminStub();
const deleteResponse = await invokeAdmin(deleteBackend.stub);
const restDeleteCall = deleteBackend.calls.find((call) => call.url.includes("/rest/v1/tools"));
check("a verified admin delete reports the row it removed",
  deleteResponse.status === 200 &&
  deleteResponse.body?.success === true &&
  deleteResponse.body?.affected === 1,
  JSON.stringify(deleteResponse.body));
check("the access token is verified against Supabase before the write",
  deleteBackend.calls.some((call) => call.url.includes("/auth/v1/user")),
  JSON.stringify(deleteBackend.calls.map((call) => call.url)));
check("the delete targets the requested row with the service-role key",
  restDeleteCall?.method === "DELETE" &&
  restDeleteCall.url.includes(`id=eq.${deleteRowId}`) &&
  `${restDeleteCall.authorization}${restDeleteCall.apiKey}`.includes("service-role-key"),
  JSON.stringify(restDeleteCall ?? null));

const noMatchDelete = await invokeAdmin(createAdminStub({ rows: [] }).stub);
check("a delete that matches no row reports 404 instead of pretending to work",
  noMatchDelete.status === 404, JSON.stringify(noMatchDelete.body));

const approveBackend = createAdminStub();
const approveResult = await invokeAdmin(approveBackend.stub, { action: "approve" });
const approveApiCall = approveBackend.calls.find((call) => call.url.includes("/rest/v1/tools"));
const approveBody = JSON.parse(approveApiCall?.body ?? "{}") as Record<string, unknown>;
check("approve keeps status and is_approved in agreement",
  approveResult.status === 200 &&
  approveApiCall?.method === "PATCH" &&
  approveBody.status === "approved" &&
  approveBody.is_approved === true,
  JSON.stringify(approveBody));

const roleAdminResult = await invokeAdmin(
  createAdminStub({ user: { id: "u3", email: "someone@else.dev", app_metadata: { role: "admin" } } }).stub,
  { env: { ADMIN_EMAILS: undefined, VITE_ADMIN_EMAILS: undefined, VITE_ADMIN_EMAIL: undefined } },
);
check("an app_metadata admin role is honoured with no allow-list configured",
  roleAdminResult.status === 200, JSON.stringify(roleAdminResult.body));

const publicAllowListResult = await invokeAdmin(
  createAdminStub({ user: { id: "u4", email: "second@example.com", app_metadata: {} } }).stub,
  { env: { ADMIN_EMAILS: undefined, VITE_ADMIN_EMAILS: "second@example.com" } },
);
check("VITE_ADMIN_EMAILS works for single-variable deployments",
  publicAllowListResult.status === 200, JSON.stringify(publicAllowListResult.body));

const missingServiceKey = await invokeAdmin(createAdminStub().stub, {
  env: { SUPABASE_SERVICE_ROLE_KEY: undefined },
});
check("a missing service-role key is reported as a 500 configuration error",
  missingServiceKey.status === 500, JSON.stringify(missingServiceKey.body));

/* ------------------------------------ paid listing created by the webhook */

section("api/paddle-webhook.ts - paid listing created when no row exists");

const orphanId = createToolId();
const orphanEvent = buildPaddleEvent(orphanId, "https://orphan.app");
const orphanBackend = createBackendStub([]);
const orphanResult = await withEnv(productionEnv, () =>
  withFetch(orphanBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: orphanEvent.raw,
      headers: { "paddle-signature": sign(orphanEvent.raw) },
    }),
  ),
);
check("a paid checkout with no matching row still succeeds",
  orphanResult.status === 200 && orphanResult.body?.success === true,
  JSON.stringify(orphanResult.body));

const insertCall = orphanBackend.calls.find(
  (call) => call.method === "POST" && call.url.includes("/rest/v1/tools"),
);
const insertedRow = JSON.parse(insertCall?.body ?? "{}") as Record<string, unknown>;
check("the missing listing is created with the id Paddle sent",
  Boolean(insertCall) && insertedRow.id === orphanId, JSON.stringify(insertedRow));
check("the created listing is live, featured and approved",
  insertedRow.is_approved === true &&
  insertedRow.is_featured === true &&
  insertedRow.status === "approved");
check("the created listing reuses the signed custom_data",
  insertedRow.name === "DocuVector AI" &&
  insertedRow.website_url === "https://orphan.app" &&
  insertedRow.category === "AI & Machine Learning" &&
  insertedRow.pricing_type === "Paid",
  JSON.stringify(insertedRow));
check("the buyer's Paddle customer id is recorded on the row",
  insertedRow.paddle_customer_id === "ctm_1");
check("the response reports that the listing had to be created",
  orphanResult.body?.created === true);
check("a listing created from custom_data still triggers the buyer receipt",
  (JSON.parse(
    orphanBackend.calls.find((call) => call.url.includes("/api/send-email"))?.body ?? "{}",
  ) as Record<string, unknown>).toolName === "DocuVector AI");

const bareEvent = JSON.stringify({
  event_id: "evt_bare",
  event_type: "transaction.completed",
  data: { id: "txn_bare", customer_id: "ctm_9", custom_data: { tool_id: orphanId } },
});
const bareBackend = createBackendStub([]);
const bareResult = await withEnv(productionEnv, () =>
  withFetch(bareBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: bareEvent,
      headers: { "paddle-signature": sign(bareEvent) },
    }),
  ),
);
check("an unmatched payment with no tool_name/website_url is never fabricated",
  bareResult.status === 200 &&
  bareResult.body?.created === false &&
  !bareBackend.calls.some((call) => call.method === "POST"),
  JSON.stringify(bareResult.body));

// Race: the browser inserted its own row between our two lookups, so the insert
// hits the primary key. The webhook must upgrade that row instead of failing.
const raceId = createToolId();
const raceEvent = buildPaddleEvent(raceId, "https://race.app");
const raceBackend = (() => {
  const calls: FetchCall[] = [];
  let toolLookups = 0;
  const stub = (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    if (!url.includes("/rest/v1/tools")) return jsonResponse({ success: true });
    if (init?.method === "POST") {
      return jsonResponse({ code: "23505", message: "duplicate key value violates unique constraint" }, false, 409);
    }
    toolLookups += 1;
    return toolLookups <= 2
      ? jsonResponse([])
      : jsonResponse([
          {
            id: raceId,
            name: "DocuVector AI",
            category: "AI & Machine Learning",
            pricing_type: "Paid",
            website_url: "https://race.app",
          },
        ]);
  };
  return { stub, calls };
})();
const raceResult = await withEnv(productionEnv, () =>
  withFetch(raceBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: raceEvent.raw,
      headers: { "paddle-signature": sign(raceEvent.raw) },
    }),
  ),
);
check("a listing that appears mid-insert is upgraded instead of failing the webhook",
  raceResult.status === 200 &&
  raceResult.body?.created !== true &&
  raceBackend.calls.filter((call) => call.method === "PATCH").length === 3,
  JSON.stringify(raceResult.body));

/* ---------------------------------------------------------------- summary */

section("Summary");
console.log(`Checks passed: ${passed}`);

if (failures.length > 0) {
  console.log(`Checks failed: ${failures.length}`);
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exit(1);
}

console.log("All checks passed.");







