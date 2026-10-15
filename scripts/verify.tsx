/**
 * StackDirectory verification suite.
 *
 * Run with `npm run verify` (bundles this file with esbuild, then executes it in
 * Node). It covers the three layers where regressions have historically slipped
 * through:
 *
 *   1. pure logic   - filters, sorting, redaction, slugs, storage, submissions
 *   2. rendering    - every component App mounts (react-dom/server)
 *   3. api handlers - api/admin-tools.ts, api/send-email.ts and
 *                     api/paddle-webhook.ts end to end, with network calls
 *                     stubbed out
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
import paddleWebhookHandler, { hasProcessedEvent, verifyPaddleSignature } from "../api/paddle-webhook";
import resendAudienceHandler from "../api/resend-audience";
import sendEmailHandler from "../api/send-email";
import { INITIAL_TOOLS } from "../src/data/mockTools";
import { getAdminEmails, isAdminEmail, isAdminUser } from "../src/lib/admin";
import {
  ADMIN_TOOLS_ENDPOINT,
  callAdminToolAction,
  callAdminToolsList,
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
import {
  buildToolInsertRow,
  createToolId,
  isDuplicateRowError,
  isUnknownColumnError,
  submissionRejectionReason,
  TOOL_INSERT_COLUMNS,
} from "../src/lib/submissions";
import {
  FAVICON_ENDPOINT,
  getFaviconUrl,
  getHostname,
  getPricingBadgeColor,
  getSafeHostname,
  getSafeWebsiteUrl,
  initialToolImageSource,
  nextToolImageSource,
  resolveToolImageSrc,
  TOOL_IMAGE_SOURCES,
} from "../src/lib/toolDisplay";
import { buildCategoryOptions, matchesToolFilters, sortTools } from "../src/lib/toolFilters";
import { getToolSlug } from "../src/lib/toolSlug";
import { syncResendAudienceContact } from "../api/_lib/resendAudience";
import { ALL_CATEGORIES } from "../src/types/directory";
import type { Tool } from "../src/types/directory";
import {
  EMAIL_PATTERN as SERVER_EMAIL_PATTERN,
  escapeHtml,
  isValidEmail as isValidServerEmail,
  sanitizeHeaderValue,
} from "../api/_lib/email";
import { clientIpFromRequest, consumeRateLimit, resetRateLimits } from "../api/_lib/rateLimit";
import { OG_TEXT_LIMITS, ogText } from "../api/_lib/ogText";
import { isPublicAddress, resolvePublicUrl, setHostResolver } from "../api/_lib/publicUrl";
import type { HostResolver } from "../api/_lib/publicUrl";
import {
  avatarSvg,
  DEFAULT_ICON_SIZE,
  escapeXml,
  extractIconHref,
  iconLabel,
  isImageContentType,
  MAX_ICON_SIZE,
  MIN_ICON_SIZE,
  normalizeContentType,
  normalizeIconDomain,
  pickIconSize,
} from "../api/_lib/toolIcon";
import faviconHandler from "../api/favicon";
import { buildLocalAcquisitionOffer } from "../src/lib/acquisition";
import { authorizationHeader, getAccessToken } from "../src/lib/session";
import { applyToolOgMetadata, buildToolOgMetadata } from "../src/lib/toolOgMetadata";
import type { HeadOwnerLike, MetaElementLike } from "../src/lib/toolOgMetadata";
import {
  EMAIL_PATTERN as CLIENT_EMAIL_PATTERN,
  isValidEmail as isValidClientEmail,
} from "../src/lib/validation";

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
// Listing URLs come straight from the submit form (and from Paddle's
// custom_data), so anything that can execute or leak has to be refused before it
// reaches an href/src.
check("executable URL schemes are refused",
  getSafeWebsiteUrl("javascript:alert(document.cookie)") === null &&
  getSafeWebsiteUrl("  JaVaScRiPt:alert(1)") === null &&
  getSafeWebsiteUrl("data:text/html,<script>alert(1)</script>") === null &&
  getSafeWebsiteUrl("vbscript:msgbox(1)") === null &&
  getSafeWebsiteUrl("blob:https://evil.test/1") === null &&
  getSafeWebsiteUrl("file:///etc/passwd") === null &&
  getSafeWebsiteUrl("about:blank") === null);
check("a scheme smuggled through the host is refused",
  getSafeWebsiteUrl("https://javascript:alert(1)") === null &&
  getSafeWebsiteUrl("//javascript:alert(1)") === null);
check("bare hosts are normalised into absolute https URLs",
  getSafeWebsiteUrl("warp.dev") === "https://warp.dev/" &&
  getSafeWebsiteUrl("www.warp.dev/pricing") === "https://www.warp.dev/pricing" &&
  getSafeWebsiteUrl("http://warp.dev") === "http://warp.dev/");
check("blank, dotless, internal and credentialed URLs are refused",
  getSafeWebsiteUrl("") === null &&
  getSafeWebsiteUrl("   ") === null &&
  getSafeWebsiteUrl(undefined) === null &&
  getSafeWebsiteUrl(null) === null &&
  getSafeWebsiteUrl("localhost") === null &&
  getSafeWebsiteUrl("https://") === null &&
  getSafeWebsiteUrl("https://user:pass@warp.dev") === null &&
  getSafeWebsiteUrl("mailto:someone@warp.dev") === null);
check("a safe URL keeps its path and query",
  getSafeWebsiteUrl("https://www.warp.dev/pricing?plan=pro") ===
    "https://www.warp.dev/pricing?plan=pro");
check("hostnames are only exposed for safe URLs",
  getSafeHostname("https://www.warp.dev/pricing") === "www.warp.dev" &&
  getSafeHostname("www.warp.dev/pricing") === "www.warp.dev" &&
  getSafeHostname("javascript:alert(1)") === null &&
  getSafeHostname("") === null);
// Every icon is fetched from our own origin. The third-party favicon service the
// cards used before (`google.com/s2/favicons`) answers 404 for any site it has
// not indexed - which is every listing on a fresh subdomain - and that is what
// left the cards rendering an empty grey circle.
check("favicon URLs are only built for safe domains and point at our own endpoint",
  getFaviconUrl("https://www.warp.dev/pricing") ===
    `${FAVICON_ENDPOINT}?domain=www.warp.dev&size=128` &&
  getFaviconUrl("warp.dev", 64) === `${FAVICON_ENDPOINT}?domain=warp.dev&size=64` &&
  getFaviconUrl("javascript:alert(1)") === null &&
  getFaviconUrl("") === null);
check("an icon URL is same-origin, so a card makes no third-party request",
  FAVICON_ENDPOINT.startsWith("/") &&
  FAVICON_ENDPOINT.endsWith("/favicon") &&
  getFaviconUrl("https://warp.dev") === `${FAVICON_ENDPOINT}?domain=warp.dev&size=128` &&
  !getFaviconUrl("https://warp.dev")?.includes("google"));
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

// Regression: the deployed `public.tools` table has no `icon_url` column, so
// sending one made PostgREST reject the entire insert with `42703` — and the
// caller used to swallow that error into a "saved locally" success while the
// review queue stayed empty.
const insertColumns = Object.keys(insertRow);
const isSchemaColumn = (column: string): boolean =>
  (TOOL_INSERT_COLUMNS as readonly string[]).includes(column);
check("the insert row only sends columns the live table has",
  insertColumns.every(isSchemaColumn),
  insertColumns.filter((column) => !isSchemaColumn(column)).join(", "));
check("the insert row drops icon_url (public.tools has no such column)",
  !insertColumns.includes("icon_url") && insertColumns.includes("website_url"));
check("the insert row always carries the columns the schema requires",
  ["id", "name", "tagline", "description", "website_url", "pricing_type", "category",
    "upvotes", "status", "is_approved", "is_featured", "seller_contact", "tech_stack"]
    .every((column) => insertColumns.includes(column)),
  insertColumns.join(", "));
check("an unknown column is recognised however Postgres/PostgREST reports it",
  isUnknownColumnError({ code: "42703", message: "column tools.icon_url does not exist" }) &&
  isUnknownColumnError({ code: "PGRST204", message: "Could not find the 'icon_url' column of 'tools' in the schema cache" }) &&
  !isUnknownColumnError({ code: "23505", message: "duplicate key value violates unique constraint" }) &&
  !isUnknownColumnError(null));
check("a schema drift rejection explains itself to the visitor",
  submissionRejectionReason({ code: "42703", message: "column tools.icon_url does not exist" })
    .includes("The submitted columns do not match the deployed Supabase schema"));
check("any other rejection surfaces the server's own message",
  submissionRejectionReason({ code: "42501", message: "new row violates row-level security policy" })
    === "new row violates row-level security policy" &&
  submissionRejectionReason(null) === "Supabase rejected the submission.");

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
// `public.tools` has no rating column, so `tool.rating ?? "4.5"` fabricated a
// 4.5-star score on every listing the API returned. The block is now rendered
// only for a listing that actually carries a numeric rating.
check("ToolCard renders no rating for a listing that has none",
  !freeCardHtml.includes("fill-amber-500") && !freeCardHtml.includes("4.5"));
const ratedCardHtml = render(<ToolCard tool={{ ...freeTool, rating: 4.9 }} onToggleUpvote={noop} />);
check("ToolCard renders the rating a listing does carry",
  ratedCardHtml.includes("fill-amber-500") && ratedCardHtml.includes("4.9"));
// A blank/unsafe `website_url` used to produce an `<a>` with no `href`: styled as
// a link, but it did nothing. It is plain text now.
const unusableUrlCardHtml = render(
  <ToolCard tool={{ ...freeTool, website_url: "" }} onToggleUpvote={noop} />,
);
check("ToolCard does not render a dead link for an unusable website_url",
  unusableUrlCardHtml.includes(freeTool.name) &&
  !unusableUrlCardHtml.includes("href="));
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

// A listing whose URL cannot be trusted must still render — without ever
// emitting an executable/credentialed href or src.
const poisonedTool: Tool = {
  ...freeTool,
  id: "poisoned-listing",
  name: "Poisoned Listing",
  website_url: "javascript:alert(document.cookie)",
  icon_url: "data:text/html,<script>alert(1)</script>",
};
const poisonedCardHtml = render(<ToolCard tool={poisonedTool} onToggleUpvote={noop} />);
check("a poisoned URL never reaches the card href or src",
  !poisonedCardHtml.includes("javascript:") &&
  !poisonedCardHtml.includes("data:text/html") &&
  !poisonedCardHtml.includes("href=\"undefined\"") &&
  !poisonedCardHtml.includes("<img"),
  poisonedCardHtml.slice(0, 400));
check("a listing with no usable URL falls back to an initials avatar",
  poisonedCardHtml.includes("initial avatar"));
const poisonedDetailHtml = render(
  <ToolDetailModal isOpen tool={poisonedTool} onClose={noop} onToggleUpvote={noop} />,
);
check("the detail modal says so instead of offering a dead link",
  poisonedDetailHtml.includes("Website unavailable") &&
  !poisonedDetailHtml.includes("javascript:") &&
  !poisonedDetailHtml.includes("data:text/html"));
check("the detail modal renders the avatar instead of a broken <img>",
  !poisonedDetailHtml.includes("<img") && poisonedDetailHtml.includes("initial avatar"),
  poisonedDetailHtml.slice(0, 400));

// Bare hosts are what people type into the submit form; they used to render as
// href="warp.dev" (a link back to the directory itself) with no favicon.
const bareHostTool: Tool = {
  ...freeTool,
  id: "bare-host-listing",
  website_url: "warp.dev/pricing",
  icon_url: undefined,
};
const bareHostHtml = render(<ToolCard tool={bareHostTool} onToggleUpvote={noop} />);
check("a bare host still renders a working link and a first-party icon",
  bareHostHtml.includes('href="https://warp.dev/pricing"') &&
  bareHostHtml.includes(`${FAVICON_ENDPOINT}?domain=warp.dev`),
  bareHostHtml.slice(0, 400));

// The logo chain is the only thing standing between a dead `icon_url` / a failing
// icon request and a visibly broken image, so it is asserted on its own rather
// than through the components: custom -> /api/favicon -> letter avatar, exactly
// one step per `onError`, ending on the terminal avatar state that cannot loop.
const chainIsMonotonic = TOOL_IMAGE_SOURCES.every(
  (source, index) =>
    index === TOOL_IMAGE_SOURCES.length - 1 ||
    nextToolImageSource(source) === TOOL_IMAGE_SOURCES[index + 1],
);
check("the logo chain advances in declaration order and terminates on the avatar",
  chainIsMonotonic &&
  initialToolImageSource(true, true) === "custom" &&
  initialToolImageSource(false, true) === "favicon" &&
  initialToolImageSource(false, false) === "initial" &&
  nextToolImageSource("custom") === "favicon" &&
  nextToolImageSource("favicon") === "initial" &&
  nextToolImageSource("initial") === "initial" &&
  nextToolImageSource(nextToolImageSource(nextToolImageSource("custom"))) === "initial");

const customIconUrl = "https://cdn.example.com/mark.png";
const faviconEndpointUrl = `${FAVICON_ENDPOINT}?domain=warp.dev&size=128`;
check("a custom icon wins, the endpoint is the runner-up and a missing value degrades forward",
  resolveToolImageSrc("custom", customIconUrl, faviconEndpointUrl) === customIconUrl &&
  resolveToolImageSrc("custom", null, faviconEndpointUrl) === faviconEndpointUrl &&
  resolveToolImageSrc("favicon", customIconUrl, faviconEndpointUrl) === faviconEndpointUrl &&
  // A row with neither a stored icon nor a usable domain cannot render an `src`.
  resolveToolImageSrc("favicon", customIconUrl, null) === null &&
  // The avatar is inline SVG, so the chain deliberately yields no `src` at all -
  // which is what stops React rendering `src="undefined"`.
  resolveToolImageSrc("initial", customIconUrl, faviconEndpointUrl) === null,
  String(resolveToolImageSrc("initial", customIconUrl, faviconEndpointUrl)));
// The chain used to end on a hard-coded *third-party* image; now its last resort
// is inline SVG, so no listing icon can depend on a host we do not control.
check("the chain's last resort needs no network and no third party",
  TOOL_IMAGE_SOURCES.length === 3 &&
  nextToolImageSource("favicon") === "initial" &&
  resolveToolImageSrc("initial") === null &&
  FAVICON_ENDPOINT === "/api/favicon" &&
  faviconEndpointUrl.startsWith(FAVICON_ENDPOINT));

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
      onSetFeature={async () => true}
      onSetForSale={async () => true}
    />,
  ).includes("Admin access required"));

check("Admin queue renders for allow-listed admins",
  render(
    <AdminQueueModal
      isOpen
      onClose={noop}
      user={{ email: "admin@example.com", app_metadata: {} } as never}
      onSetFeature={async () => true}
      onSetForSale={async () => true}
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

// The webhook can be delivered twice for the same transaction, so the receipt
// must carry a Resend idempotency key: Resend then collapses the second send and
// the buyer sees one receipt. The key is per transaction, never per buyer, so
// two different purchases still produce two receipts.
const receiptHeaders: Array<Record<string, string>> = [];

const collectHeaders = (value: unknown): Record<string, string> => {
  const collected: Record<string, string> = {};
  const push = (source: unknown): void => {
    if (!source) return;
    if (typeof (source as { entries?: unknown }).entries === "function") {
      for (const [key, headerValue] of (source as { entries: () => Iterable<[string, string]> }).entries()) {
        collected[key.toLowerCase()] = headerValue;
      }
      return;
    }
    if (Array.isArray(source)) {
      for (const entry of source as Array<[string, string]>) {
        collected[String(entry[0]).toLowerCase()] = String(entry[1]);
      }
      return;
    }
    if (typeof source === "object") {
      for (const [key, headerValue] of Object.entries(source as Record<string, unknown>)) {
        collected[key.toLowerCase()] = String(headerValue);
      }
    }
  };
  push(value);
  return collected;
};

/** Resend stub that also records the outgoing request headers. */
const receiptStub = async (
  input: unknown,
  init?: { body?: unknown; headers?: unknown },
) => {
  const requestLike = input as { headers?: unknown } | undefined;
  const headers = collectHeaders(init?.headers);
  if (Object.keys(headers).length === 0) {
    Object.assign(headers, collectHeaders(requestLike?.headers));
  }
  receiptHeaders.push(headers);
  return jsonResponse({ id: "email_2" });
};

const receiptResult = await withEnv(
  { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "StackDirectory <noreply@example.com>" },
  () =>
    withFetch(receiptStub, () =>
      invoke(sendEmailHandler, {
        body: JSON.stringify({
          type: "PAYMENT_RECEIPT",
          customerEmail: "buyer@example.com",
          toolName: "DocuVector AI",
          toolSlug: "docuvector-ai",
          amount: 5,
          currency: "USD",
          transactionId: "txn_receipt_1",
        }),
      }),
    ),
);
check("a paid receipt is accepted",
  receiptResult.status === 200 && receiptResult.body?.success === true,
  JSON.stringify(receiptResult.body));
check("a paid receipt carries a per-transaction Resend idempotency key",
  receiptHeaders[receiptHeaders.length - 1]?.["idempotency-key"] ===
    "stackdirectory-receipt-txn_receipt_1",
  JSON.stringify(receiptHeaders));
check("the receipt request is still authenticated against Resend",
  String(receiptHeaders[receiptHeaders.length - 1]?.authorization ?? "").includes("re_test"));

section("api/resend-audience.ts - submitted contact sync");

const submittedAudienceCalls: Array<{ url: string; method: string; body: string }> = [];
const submittedAudienceBackend = async (
  input: unknown,
  init?: { method?: string; body?: unknown },
) => {
  const request = input as { url?: string; method?: string; clone?: () => { text: () => Promise<string> } };
  const url = typeof input === "string" ? input : String(request.url ?? "");
  const body = typeof init?.body === "string"
    ? init.body
    : request.clone
      ? await request.clone().text()
      : "";
  submittedAudienceCalls.push({
    url,
    method: init?.method ?? request.method ?? "GET",
    body,
  });
  return jsonResponse({ id: "contact_1" });
};
const submittedContactSynced = await withEnv({
  RESEND_API_KEY: "re_test",
  RESEND_AUDIENCE_ID: "aud_1",
}, () => withFetch(submittedAudienceBackend, () =>
  syncResendAudienceContact("submitter@example.com", "Submitted Tool"),
));
const submittedAudienceCall = submittedAudienceCalls.find((call) =>
  call.url.includes("/audiences/aud_1/contacts"),
);
const submittedAudienceContact = JSON.parse(submittedAudienceCall?.body ?? "{}") as Record<string, unknown>;
check("a persisted submission syncs its verified submitter contact to the configured Audience",
  submittedContactSynced &&
  submittedAudienceCall?.method === "POST" &&
  submittedAudienceContact.email === "submitter@example.com" &&
  submittedAudienceContact.first_name === "Submitted Tool" &&
  submittedAudienceContact.unsubscribed === false,
  JSON.stringify({
    synced: submittedContactSynced,
    contact: submittedAudienceContact,
  }));

const updatedAudienceCalls: Array<{ url: string; method: string; body: string }> = [];
const existingAudienceBackend = async (
  input: unknown,
  init?: { method?: string; body?: unknown },
) => {
  const request = input as { url?: string; method?: string; clone?: () => { text: () => Promise<string> } };
  const url = typeof input === "string" ? input : String(request.url ?? "");
  const method = init?.method ?? request.method ?? "GET";
  const body = typeof init?.body === "string"
    ? init.body
    : request.clone
      ? await request.clone().text()
      : "";
  updatedAudienceCalls.push({ url, method, body });
  if (method === "POST") return jsonResponse({ message: "Contact already exists" }, false, 409);
  if (method === "GET") {
    return jsonResponse({
      id: "existing_contact",
      email: "submitter@example.com",
      unsubscribed: true,
    });
  }
  return jsonResponse({ id: "existing_contact" });
};
const existingContactUpdated = await withEnv({
  RESEND_API_KEY: "re_test",
  RESEND_AUDIENCE_ID: "aud_1",
}, () => withFetch(existingAudienceBackend, () =>
  syncResendAudienceContact("submitter@example.com", "Updated Tool"),
));
const audienceUpdateCall = updatedAudienceCalls.find((call) => call.method === "PATCH");
const audienceUpdatePayload = JSON.parse(audienceUpdateCall?.body ?? "{}") as Record<string, unknown>;
check("an existing Resend contact is updated without being re-subscribed",
  existingContactUpdated &&
  updatedAudienceCalls.some((call) => call.method === "GET") &&
  // `?? ""` keeps the chain a definite boolean: a bare `?.` operand short-circuits
  // to `undefined` when no PATCH call was made.
  (audienceUpdateCall?.url ?? "").includes("/audiences/aud_1/contacts/existing_contact") &&
  audienceUpdatePayload.first_name === "Updated Tool" &&
  // The contact returned above is `unsubscribed: true`. Flipping that flag back
  // on a PATCH would silently re-subscribe someone who opted out (a CAN-SPAM /
  // GDPR violation), so only the create path — a fresh submission, i.e. fresh
  // consent — is allowed to set `unsubscribed: false`.
  !("unsubscribed" in audienceUpdatePayload),
  JSON.stringify({ calls: updatedAudienceCalls, update: audienceUpdatePayload }));

const unauthenticatedContactResult = await withEnv({
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
}, () => invoke(resendAudienceHandler, {
  body: JSON.stringify({ toolId: createToolId() }),
}));
check("submission contact sync rejects requests without a verified session",
  unauthenticatedContactResult.status === 401);

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

/* ------------------------------------------ webhook replay + price guards */

section("api/paddle-webhook.ts - replay and price guards");

/** `buildPaddleEvent`, but with an explicit (and mismatched) price id. */
const buildPricedEvent = (
  toolId: string,
  transactionId: string,
  priceId: string,
): PaddleEvent => {
  const parsed = JSON.parse(buildPaddleEvent(toolId, "https://priced.app").raw) as {
    data: { id: string; items: Array<Record<string, unknown>> };
  };
  parsed.data.id = transactionId;
  parsed.data.items = [
    {
      quantity: 1,
      price: {
        id: priceId,
        description: "Featured Listing",
        unit_price: { amount: 500, currency_code: "USD" },
      },
    },
  ];
  return { raw: JSON.stringify(parsed), toolId };
};

// Paddle retries a delivery until it receives a 2xx, so the exact same
// transaction.completed can arrive more than once. `paidEvent` was already
// processed above, so this delivery is a replay.
const duplicateBackend = createBackendStub([{ id: paidToolId }]);
const duplicateResult = await withEnv(productionEnv, () =>
  withFetch(duplicateBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: paidEvent.raw,
      headers: { "paddle-signature": sign(paidEvent.raw) },
    }),
  ),
);
check("a replayed delivery is acknowledged without repeating the upgrade",
  duplicateResult.status === 200 &&
  duplicateResult.body?.duplicate === true &&
  duplicateResult.body?.emailSent === false &&
  duplicateBackend.calls.length === 0,
  JSON.stringify(duplicateResult.body));
check("the processed-event ledger is keyed by transaction + listing",
  hasProcessedEvent(`txn_1:${paidToolId}`) &&
  !hasProcessedEvent(`txn_1:${createToolId()}`));
check("a replay still has to be signed",
  (
    await withEnv(productionEnv, () =>
      withFetch(createBackendStub([]).stub, () =>
        invoke(paddleWebhookHandler, {
          body: paidEvent.raw,
          headers: { "paddle-signature": "ts=1;h1=deadbeef" },
        }),
      ),
    )
  ).status === 401);

// The receipt callback is a server-to-server call, so the Host header on the
// incoming webhook must never be able to redirect it (and the buyer's details
// with it) to an attacker's domain.
const spoofEvent = buildPaddleEvent(createToolId(), "https://spoof.app");
const spoofBackend = createBackendStub([
  {
    id: spoofEvent.toolId,
    name: "DocuVector AI",
    category: "AI & Machine Learning",
    pricing_type: "Paid",
    website_url: "https://spoof.app",
  },
]);
const spoofResult = await withEnv({ ...productionEnv, APP_URL: undefined }, () =>
  withFetch(spoofBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: spoofEvent.raw,
      headers: {
        "paddle-signature": sign(spoofEvent.raw),
        "x-forwarded-host": "evil.test",
        host: "evil.test",
      },
    }),
  ),
);
check("a spoofed Host header cannot redirect the receipt callback",
  spoofResult.status === 200 &&
  spoofBackend.calls.some((call) =>
    call.url.startsWith("https://apps.stackbuildco.com/api/send-email"),
  ) &&
  !spoofBackend.calls.some((call) => call.url.includes("evil.test")),
  JSON.stringify(spoofBackend.calls.map((call) => call.url)));

// custom_data and the price both come from whichever checkout produced the
// transaction, so a cheaper product pointed at this notification destination
// must not be able to buy a Featured Listing.
const cheapEvent = buildPricedEvent(createToolId(), "txn_cheap", "pri_not_featured");
const cheapBackend = createBackendStub([{ id: cheapEvent.toolId }]);
const cheapResult = await withEnv(
  { ...productionEnv, PADDLE_FEATURED_PRICE_ID: "pri_featured" },
  () =>
    withFetch(cheapBackend.stub, () =>
      invoke(paddleWebhookHandler, {
        body: cheapEvent.raw,
        headers: { "paddle-signature": sign(cheapEvent.raw) },
      }),
    ),
);
check("a transaction that paid for another price id never features a listing",
  cheapResult.status === 200 &&
  cheapResult.body?.ignored === "price_mismatch" &&
  cheapResult.body?.emailSent === false &&
  cheapResult.body?.created === false &&
  cheapBackend.calls.length === 0,
  JSON.stringify(cheapResult.body));
check("an ignored price mismatch is not remembered as processed",
  !hasProcessedEvent(`txn_cheap:${cheapEvent.toolId}`));

const featuredEvent = buildPricedEvent(createToolId(), "txn_featured", "pri_featured");
const featuredBackend = createBackendStub([
  {
    id: featuredEvent.toolId,
    name: "DocuVector AI",
    category: "AI & Machine Learning",
    pricing_type: "Paid",
    website_url: "https://priced.app",
  },
]);
const featuredResult = await withEnv(
  { ...productionEnv, PADDLE_FEATURED_PRICE_ID: "pri_featured" },
  () =>
    withFetch(featuredBackend.stub, () =>
      invoke(paddleWebhookHandler, {
        body: featuredEvent.raw,
        headers: { "paddle-signature": sign(featuredEvent.raw) },
      }),
    ),
);
check("a transaction that paid the Featured price id is still upgraded",
  featuredResult.status === 200 &&
  featuredResult.body?.success === true &&
  featuredResult.body?.ignored === undefined &&
  (
    JSON.parse(
      featuredBackend.calls.find((call) => call.url.includes("id=eq."))?.body ?? "{}",
    ) as Record<string, unknown>
  ).is_featured === true,
  JSON.stringify(featuredResult.body));

// The public VITE_ variable is the one a deployment is most likely to have set
// already, so it works as a fallback for the server-side price id.
const fallbackEvent = buildPricedEvent(createToolId(), "txn_env_fallback", "pri_not_featured");
const fallbackBackend = createBackendStub([{ id: fallbackEvent.toolId }]);
const fallbackResult = await withEnv(
  { ...productionEnv, PADDLE_FEATURED_PRICE_ID: undefined, VITE_PADDLE_PRICE_ID: "pri_featured" },
  () =>
    withFetch(fallbackBackend.stub, () =>
      invoke(paddleWebhookHandler, {
        body: fallbackEvent.raw,
        headers: { "paddle-signature": sign(fallbackEvent.raw) },
      }),
    ),
);
check("VITE_PADDLE_PRICE_ID is accepted as the Featured price id",
  fallbackResult.status === 200 &&
  fallbackResult.body?.ignored === "price_mismatch" &&
  fallbackBackend.calls.length === 0,
  JSON.stringify(fallbackResult.body));

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

apiCalls.length = 0;
const queueList = await withFetch(
  adminApiStub({ success: true, tools: [{ id: "queue-row", name: "Queue row" }] }),
  () => callAdminToolsList("access-token-1"),
);
check("the queue client loads rows through the authenticated admin endpoint",
  queueList.ok &&
  queueList.tools[0]?.id === "queue-row" &&
  apiCalls[0]?.url === ADMIN_TOOLS_ENDPOINT &&
  JSON.parse(apiCalls[0]?.body ?? "{}").action === "list");

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

const createAdminStub = (options: {
  rows?: unknown[];
  user?: unknown | null;
  emailFailure?: boolean;
} = {}) => {
  const rows = options.rows ?? [{}];
  const user = options.user === undefined ? adminUser : options.user;
  const calls: ApiCall[] = [];
  const stub = async (input: unknown, init?: { method?: string; body?: unknown; headers?: unknown }) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
    const call = toApiCall(input, init);
    if (url.includes("api.resend.com/emails")) {
      const requestLike = input as { text?: () => Promise<string> } | undefined;
      if (!call.body && typeof requestLike?.text === "function") {
        call.body = await requestLike.text();
      }
      calls.push(call);
      return jsonResponse(
        options.emailFailure ? { message: "Resend unavailable" } : { id: "approval_email_1" },
        !options.emailFailure,
        options.emailFailure ? 503 : 200,
      );
    }
    if (url.includes("api.resend.com/audiences/")) {
      if (!call.body && typeof (input as { text?: () => Promise<string> } | undefined)?.text === "function") {
        call.body = await (input as { text: () => Promise<string> }).text();
      }
      calls.push(call);
      return jsonResponse({ id: "audience_contact_1" });
    }
    calls.push(call);
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

// Environment misconfiguration has to reach the admin UI as an actionable 500:
// before this guard the request went ahead on a `createClient(url, "")` client,
// and PostgREST answers a service-role-less delete with "0 rows matched" *and no
// error*, so the queue looked like it had worked while the row stayed put.
const missingKeyBackend = createAdminStub();
const missingKeyResponse = await invokeAdmin(missingKeyBackend.stub, {
  env: { SUPABASE_SERVICE_ROLE_KEY: undefined },
});
check("a missing SUPABASE_SERVICE_ROLE_KEY is a 500 that names the variable",
  missingKeyResponse.status === 500 &&
  missingKeyResponse.body?.success === false &&
  String(missingKeyResponse.body?.error ?? "").includes("SUPABASE_SERVICE_ROLE_KEY") &&
  // Nothing may be sent to Supabase without the key.
  missingKeyBackend.calls.length === 0,
  JSON.stringify(missingKeyResponse.body));

const missingUrlBackend = createAdminStub();
const missingUrlResponse = await invokeAdmin(missingUrlBackend.stub, {
  env: { SUPABASE_URL: undefined, VITE_SUPABASE_URL: undefined },
});
check("a missing SUPABASE_URL is a 500 that names the variable",
  missingUrlResponse.status === 500 &&
  missingUrlResponse.body?.success === false &&
  String(missingUrlResponse.body?.error ?? "").includes("SUPABASE_URL") &&
  missingUrlBackend.calls.length === 0,
  JSON.stringify(missingUrlResponse.body));

// `createClient` throws ("Invalid supabaseUrl: Must be a valid HTTP or HTTPS
// URL.") on a malformed value. That is a deployment mistake, so it must be
// reported as a 500 - not as a 401, and not as an unhandled crash.
const badUrlBackend = createAdminStub();
const badUrlResponse = await invokeAdmin(badUrlBackend.stub, {
  env: { SUPABASE_URL: "project.supabase.co" },
});
check("a malformed SUPABASE_URL surfaces the thrown configuration error as a 500",
  badUrlResponse.status === 500 &&
  badUrlResponse.body?.success === false &&
  /supabaseUrl/i.test(String(badUrlResponse.body?.error ?? "")),
  JSON.stringify(badUrlResponse.body));

// Any other throw (here: an oversized body rejected by `collectBody`) must also be
// answered as JSON, because an unhandled lambda crash returns an HTML error page
// the admin UI can only render as "endpoint unavailable".
const oversizedResponse = await withEnv(adminEnv, () =>
  withFetch(createAdminStub().stub, () =>
    invoke(adminToolsHandler, {
      headers: { authorization: "Bearer session-jwt" },
      body: `{"action":"list","padding":"${"x".repeat(1_000_001)}"}`,
    }),
  ),
);
check("an unhandled rejection is answered as JSON 500 instead of a crashed function",
  oversizedResponse.status === 500 &&
  oversizedResponse.body?.success === false &&
  String(oversizedResponse.body?.error ?? "").length > 0,
  JSON.stringify(oversizedResponse.body));

const queueRows = [{ id: deleteRowId, name: "Pending queue row", seller_contact: "owner@example.com" }];
const queueBackend = createAdminStub({ rows: queueRows });
const queueResponse = await invokeAdmin(queueBackend.stub, { action: "list" });
const queueRestCall = queueBackend.calls.find((call) => call.url.includes("/rest/v1/tools"));
check("the admin list action returns service-role-visible tool rows",
  queueResponse.status === 200 &&
  queueResponse.body?.success === true &&
  Array.isArray(queueResponse.body?.tools) &&
  (queueResponse.body?.tools as Array<{ seller_contact?: string }>)[0]?.seller_contact === "owner@example.com" &&
  queueRestCall?.method === "GET" &&
  `${queueRestCall.authorization}${queueRestCall.apiKey}`.includes("service-role-key"),
  JSON.stringify(queueResponse.body));

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

const approvalEmailBackend = createAdminStub({
  rows: [{ id: deleteRowId, name: "Approved <Tool>", seller_contact: "submitter@example.com" }],
});
const approvalEmailResult = await invokeAdmin(approvalEmailBackend.stub, {
  action: "approve",
  env: {
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "StackDirectory <noreply@example.com>",
    RESEND_AUDIENCE_ID: "aud_1",
  },
});
const approvalEmailCall = approvalEmailBackend.calls.find((call) => call.url.includes("api.resend.com/emails"));
const approvalEmail = JSON.parse(approvalEmailCall?.body ?? "{}") as Record<string, unknown>;
const approvalAudienceCall = approvalEmailBackend.calls.find((call) =>
  call.url.includes("api.resend.com/audiences/"),
);
const approvalAudienceContact = JSON.parse(approvalAudienceCall?.body ?? "{}") as Record<string, unknown>;
check("approval sends a Resend notification using the stored submitter contact",
  approvalEmailResult.status === 200 &&
  approvalEmailCall?.method === "POST" &&
  approvalEmail.to === "submitter@example.com" &&
  approvalEmail.from === "StackDirectory <noreply@example.com>",
  JSON.stringify(approvalEmail));
check("approval email includes an escaped tool name and direct listing link",
  String(approvalEmail.html ?? "").includes("Approved &lt;Tool&gt;") &&
  String(approvalEmail.html ?? "").includes("https://apps.stackbuildco.com/?tool=approved-tool"),
  String(approvalEmail.html ?? ""));
check("approval adds the submitter to the configured Resend Audience",
  approvalAudienceCall?.method === "POST" &&
  approvalAudienceCall.url.includes("/audiences/aud_1/contacts") &&
  approvalAudienceContact.email === "submitter@example.com" &&
  approvalAudienceContact.first_name === "Approved <Tool>" &&
  approvalAudienceContact.unsubscribed === false,
  JSON.stringify(approvalAudienceContact));

const failedApprovalEmailBackend = createAdminStub({
  rows: [{ id: deleteRowId, name: "Approved Tool", seller_contact: "submitter@example.com" }],
  emailFailure: true,
});
const failedApprovalEmailResult = await invokeAdmin(failedApprovalEmailBackend.stub, {
  action: "approve",
  env: {
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "StackDirectory <noreply@example.com>",
  },
});
check("Resend delivery failure does not fail the successful database approval",
  failedApprovalEmailResult.status === 200 &&
  failedApprovalEmailResult.body?.success === true &&
  failedApprovalEmailBackend.calls.some((call) => call.url.includes("api.resend.com/emails")),
  JSON.stringify(failedApprovalEmailResult.body));

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
check("a listing created by the webhook omits columns the live table lacks",
  !Object.keys(insertedRow).includes("icon_url") &&
  Object.keys(insertedRow).every((column) =>
    (TOOL_INSERT_COLUMNS as readonly string[]).includes(column)),
  Object.keys(insertedRow).join(", "));
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

/* -------------------------------------------- hardening: listing preview cards */

section("src/lib/toolOgMetadata.ts - listing preview cards");

type HeadMetaStub = MetaElementLike & {
  attributes: Record<string, string>;
  attached: boolean;
  removed: boolean;
};

/** Minimal `<head>`: `querySelector`, `createElement` and `appendChild`, nothing else. */
const createHeadStub = (
  preexisting: Array<{ attribute: string; key: string; content: string }> = [],
) => {
  const nodes: HeadMetaStub[] = [];
  const appended: HeadMetaStub[] = [];

  const makeNode = (attributes: Record<string, string>, attached: boolean): HeadMetaStub => {
    const node: HeadMetaStub = {
      attributes: { ...attributes },
      attached,
      removed: false,
      getAttribute: (name: string) => node.attributes[name] ?? null,
      setAttribute: (name: string, value: string) => {
        node.attributes[name] = value;
      },
      remove: () => {
        node.removed = true;
        node.attached = false;
      },
      get parentNode(): unknown {
        return node.attached ? node : null;
      },
    };
    nodes.push(node);
    return node;
  };

  for (const entry of preexisting) {
    makeNode({ [entry.attribute]: entry.key, content: entry.content }, true);
  }

  const owner: HeadOwnerLike<HeadMetaStub> = {
    createElement: () => makeNode({}, false),
    head: {
      querySelector: (selector: string) => {
        const parsed = /^meta\[(\w+)="(.+)"\]$/.exec(selector);
        const [, attribute, key] = parsed ?? [];
        if (!attribute || !key) return null;
        return nodes.find((node) => node.attached && node.attributes[attribute] === key) ?? null;
      },
      appendChild: (node: HeadMetaStub) => {
        node.attached = true;
        appended.push(node);
        return node;
      },
    },
  };

  return { owner, nodes, appended };
};

const siteTitle = "StackDirectory - Discover the best software products";
const headStub = createHeadStub([
  { attribute: "property", key: "og:title", content: siteTitle },
  { attribute: "name", key: "twitter:card", content: "summary_large_image" },
]);
const ogEntries = buildToolOgMetadata({
  name: "DocuVector AI",
  tagline: "Contract intelligence for compliance teams",
  imageUrl: "https://apps.stackbuildco.com/api/og?title=DocuVector%20AI",
  shareUrl: "https://apps.stackbuildco.com/?tool=docuvector-ai",
});
const headNode = (key: string): HeadMetaStub | undefined =>
  headStub.nodes.find(
    (node) => node.attributes.property === key || node.attributes.name === key,
  );

check("a listing is described in both card dialects",
  ogEntries.length === 8 &&
  ogEntries.filter(([attribute]) => attribute === "property").length === 4 &&
  ogEntries.filter(([attribute]) => attribute === "name").length === 4);
check("the title, canonical url and image come from the listing",
  ogEntries.some(([, key, content]) => key === "og:title" && content === "DocuVector AI") &&
  ogEntries.some(([, key, content]) => key === "og:url" && content.includes("tool=docuvector-ai")) &&
  ogEntries.some(([, key, content]) => key === "twitter:image" && content.includes("/api/og")));

const restoreHead = applyToolOgMetadata(headStub.owner, ogEntries);
check("an existing tag is updated in place, only missing ones are appended",
  headStub.appended.length === 6 &&
  headNode("og:title")?.getAttribute("content") === "DocuVector AI",
  `${headStub.appended.length} appended`);
check("every tag the module creates really reaches the head",
  headStub.appended.every((node) => node.attached));
restoreHead();
// The first implementation deleted every tag it had touched, so closing one
// listing stripped the site's own preview card until the next reload.
check("closing the listing restores the site's own preview card",
  headNode("og:title")?.getAttribute("content") === siteTitle &&
  headNode("og:title")?.removed === false);
check("only the tags this module created are removed",
  headStub.appended.every((node) => node.removed));
check("closing the listing leaves the tags it did not create alone",
  headNode("twitter:card")?.getAttribute("content") === "summary_large_image" &&
  headNode("twitter:card")?.removed === false);

const fullHead = createHeadStub(
  ogEntries.map(([attribute, key, content]) => ({ attribute, key, content })),
);
const restoreFullHead = applyToolOgMetadata(fullHead.owner, ogEntries);
check("re-opening a listing never duplicates a tag that already exists",
  fullHead.appended.length === 0);
restoreFullHead();
check("restoring a head that already had every tag removes nothing",
  fullHead.nodes.every((node) => !node.removed));

/* ------------------------- hardening: the shared client/server helper layer */

section("Shared address, header and rate-limit helpers");

// `src/lib/validation.ts` (browser) and `api/_lib/email.ts` (Node) hold one copy
// of the address rule each - `api/` must not import from `src/` - so both copies
// are asserted here. Without this the two drift and the forms accept what the
// relay rejects (or, worse, the relay accepts what the forms reject).
check("the client and the server share one address pattern",
  CLIENT_EMAIL_PATTERN.source === SERVER_EMAIL_PATTERN.source &&
  CLIENT_EMAIL_PATTERN.flags === SERVER_EMAIL_PATTERN.flags);

const deliverableAddresses = [
  "owner@example.com",
  "first.last+tag@sub.example.co.uk",
  "  padded@example.co  ",
];
const undeliverableAddresses = [
  "",
  "   ",
  "a@b",
  "a b@c.com",
  "@example.com",
  "owner@example",
  "owner@example.com\r\nBcc: attacker@example.com",
];
check("deliverable addresses pass both copies",
  deliverableAddresses.every((address) => isValidClientEmail(address) && isValidServerEmail(address)),
  deliverableAddresses
    .filter((address) => !isValidClientEmail(address) || !isValidServerEmail(address)).join(", "));
check("malformed and CR/LF-carrying addresses fail both copies",
  undeliverableAddresses.every((address) => !isValidClientEmail(address) && !isValidServerEmail(address)),
  undeliverableAddresses
    .filter((address) => isValidClientEmail(address) || isValidServerEmail(address)).join(", "));
check("a non-string address is never deliverable",
  !isValidClientEmail(undefined) && !isValidClientEmail(null) && !isValidServerEmail(42));

check("a header value cannot smuggle a second header",
  sanitizeHeaderValue("owner@example.com\r\nBcc: attacker@example.com") ===
    "owner@example.com Bcc: attacker@example.com");
check("header values are length-capped", sanitizeHeaderValue("x".repeat(500)).length === 200);
check("HTML escaping covers the five breakout characters",
  escapeHtml('<b>Tom & "Jerry\'s" list</b>') ===
    "&lt;b&gt;Tom &amp; &quot;Jerry&#39;s&quot; list&lt;/b&gt;");

resetRateLimits();
const limitDecisions = [1, 2, 3, 4, 5].map(() => consumeRateLimit("verify:unit", 3, 60_000));
check("the limiter allows exactly `limit` requests per window",
  limitDecisions.slice(0, 3).every((decision) => decision.allowed) &&
  !limitDecisions[3].allowed &&
  !limitDecisions[4].allowed,
  JSON.stringify(limitDecisions.map((decision) => decision.allowed)));
check("a blocked request reports a retry delay and nothing remaining",
  limitDecisions[3].remaining === 0 && limitDecisions[2].remaining === 0 &&
  limitDecisions[3].retryAfterSeconds >= 1);
check("buckets are per key, so one client cannot throttle another",
  consumeRateLimit("verify:other", 3, 60_000).allowed);
resetRateLimits();
check("resetRateLimits opens a fresh window",
  consumeRateLimit("verify:unit", 3, 60_000).remaining === 2);

check("x-forwarded-for's first hop identifies the client",
  clientIpFromRequest({ headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" } }) === "203.0.113.5");
check("an IPv4-mapped address is normalised to its dotted form",
  clientIpFromRequest({ headers: { "x-forwarded-for": "::ffff:203.0.113.9" } }) === "203.0.113.9");
check("the socket address is the fallback",
  clientIpFromRequest({ headers: {}, socket: { remoteAddress: "198.51.100.4" } }) === "198.51.100.4");
check("an unidentifiable client is not throttled at all",
  clientIpFromRequest({ headers: {} }) === "");

check("a signed-out browser holds no access token", (await getAccessToken()) === null);
check("a signed-out browser sends no Authorization header",
  Object.keys(await authorizationHeader()).length === 0);

/* --------------------------- hardening: the first-party icon endpoint chain */

section("api/_lib/publicUrl.ts - the shared SSRF guard");

// Both `/api/favicon` and `/api/website-metadata` turn a visitor's input into an
// outbound request from inside the deployment's network, so the "is this host a
// public website?" answer lives in exactly one module. DNS is injected here, so
// the suite never depends on the network being reachable.
check("addresses that are not publicly routable are refused",
  isPublicAddress("93.184.216.34") &&
  isPublicAddress("2606:4700:4700::1111") &&
  !isPublicAddress("127.0.0.1") &&
  !isPublicAddress("0.0.0.0") &&
  !isPublicAddress("10.1.2.3") &&
  !isPublicAddress("172.16.0.1") &&
  !isPublicAddress("192.168.1.1") &&
  !isPublicAddress("169.254.169.254") &&
  !isPublicAddress("100.64.0.1") &&
  !isPublicAddress("224.0.0.1") &&
  !isPublicAddress("::") &&
  !isPublicAddress("::1") &&
  !isPublicAddress("fd00::1") &&
  !isPublicAddress("fe80::1") &&
  !isPublicAddress("::ffff:127.0.0.1") &&
  !isPublicAddress("not-an-ip"));

const publicLookup: HostResolver = async () => [{ address: "93.184.216.34" }];
const privateLookup: HostResolver = async () => [{ address: "10.0.0.7" }];
const mixedLookup: HostResolver = async () => [
  { address: "93.184.216.34" },
  { address: "192.168.0.9" },
];
const deadLookup: HostResolver = async () => [];

/** Message `resolvePublicUrl` rejected `value` with, or "" when it accepted it. */
const rejectionReason = async (value: string, resolver: HostResolver = publicLookup) => {
  setHostResolver(resolver);
  try {
    await resolvePublicUrl(value);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

check("only credential-free http(s) URLs are inspected",
  (await rejectionReason("file:///etc/passwd")).includes("public HTTP") &&
  (await rejectionReason("ftp://warp.dev/mark.png")).includes("public HTTP") &&
  (await rejectionReason("https://user:pass@warp.dev/mark.png")).includes("credentials") &&
  (await rejectionReason("warp.dev is not a url")).length > 0);
check("bare, local and internal hostnames are refused before any request",
  (await rejectionReason("http://localhost/mark.png")).includes("publicly accessible") &&
  (await rejectionReason("http://warp/mark.png")).includes("publicly accessible") &&
  (await rejectionReason("http://build.local/mark.png")).includes("publicly accessible") &&
  (await rejectionReason("http://api.localhost/mark.png")).includes("publicly accessible"));
check("a host that resolves anywhere non-public is refused, even when the URL looks public",
  (await rejectionReason("https://internal.example.com/mark.png", privateLookup)).includes("public IP") &&
  (await rejectionReason("https://mixed.example.com/mark.png", mixedLookup)).includes("public IP") &&
  (await rejectionReason("https://dead.example.com/mark.png", deadLookup)).includes("public IP") &&
  (await rejectionReason("http://127.0.0.1/mark.png")).includes("public IP") &&
  (await rejectionReason("http://169.254.169.254/latest/meta-data/")).includes("public IP"));
check("a resolvable public host is accepted",
  (await resolvePublicUrl("https://warp.dev/mark.svg")).href === "https://warp.dev/mark.svg" &&
  // A trailing dot is a valid fully-qualified name, so it is accepted (and left
  // alone: only the check strips it).
  (await resolvePublicUrl("HTTPS://Warp.dev./mark.svg")).hostname === "warp.dev.");
setHostResolver(null);

section("api/_lib/toolIcon.ts - which domain, which icon, which avatar");

check("the `?domain=` value must be a bare public host, not a URL",
  normalizeIconDomain("WARP.dev.") === "warp.dev" &&
  normalizeIconDomain("  scribeswift.stackbuildco.com  ") === "scribeswift.stackbuildco.com" &&
  normalizeIconDomain("https://warp.dev/favicon.ico") === null &&
  normalizeIconDomain("warp.dev/logo.png") === null &&
  normalizeIconDomain("warp.dev:8443") === null &&
  normalizeIconDomain("user@warp.dev") === null &&
  normalizeIconDomain("warp%2edev") === null);
check("localhost, local suffixes and IP literals never reach the network",
  normalizeIconDomain("localhost") === null &&
  normalizeIconDomain("app.localhost") === null &&
  normalizeIconDomain("build.local") === null &&
  normalizeIconDomain("vault.internal") === null &&
  normalizeIconDomain("printer.home.arpa") === null &&
  normalizeIconDomain("127.0.0.1") === null &&
  normalizeIconDomain("169.254.169.254") === null &&
  normalizeIconDomain("::1") === null);
check("a malformed host is rejected rather than fetched",
  normalizeIconDomain("") === null &&
  normalizeIconDomain("   ") === null &&
  normalizeIconDomain("warp") === null &&
  normalizeIconDomain(".warp.dev") === null &&
  normalizeIconDomain("warp..dev") === null &&
  normalizeIconDomain("-warp.dev") === null &&
  normalizeIconDomain("warp-.dev") === null &&
  normalizeIconDomain(`${"w".repeat(254)}.dev`) === null &&
  normalizeIconDomain(null) === null &&
  normalizeIconDomain(42) === null);

check("the requested icon size is clamped into range, never NaN",
  pickIconSize("128") === 128 &&
  pickIconSize(64) === 64 &&
  pickIconSize(" 256 ") === 256 &&
  pickIconSize("64.7") === 64 &&
  pickIconSize("9999") === MAX_ICON_SIZE &&
  pickIconSize("4") === MIN_ICON_SIZE &&
  pickIconSize("abc") === DEFAULT_ICON_SIZE &&
  pickIconSize("") === DEFAULT_ICON_SIZE &&
  pickIconSize(null) === DEFAULT_ICON_SIZE &&
  pickIconSize(undefined) === DEFAULT_ICON_SIZE);

check("only a real image message type is forwarded",
  isImageContentType("image/png") &&
  isImageContentType("IMAGE/PNG") &&
  isImageContentType("image/svg+xml") &&
  isImageContentType("image/x-icon") &&
  isImageContentType("image/vnd.microsoft.icon; charset=binary") &&
  // Vercel's SPA rewrite answers `/favicon.ico` with `200 text/html`, so the
  // status alone would forward an HTML document as an icon.
  !isImageContentType("text/html; charset=utf-8") &&
  !isImageContentType("application/octet-stream") &&
  !isImageContentType("text/plain") &&
  !isImageContentType("") &&
  !isImageContentType(null) &&
  !isImageContentType(undefined));
check("the forwarded content type is normalised before it reaches the browser",
  normalizeContentType("image/png; charset=utf-8") === "image/png" &&
  normalizeContentType("IMAGE/PNG") === "image/png" &&
  normalizeContentType("image/x-icon") === "image/x-icon" &&
  normalizeContentType("image/svg+xml") === "image/svg+xml; charset=utf-8");

const iconPageHtml = [
  "<html><head>",
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
  "<link rel='stylesheet' href='/app.css'>",
  '<link rel="icon" type="image/svg+xml" href="/clauseguard-logo.svg">',
  '<link rel="shortcut icon" href="https://cdn.example.com/favicon.ico">',
  "</head><body></body></html>",
].join("");
check("the icon a page declares wins over an apple-touch tile",
  extractIconHref(iconPageHtml, "https://clause.stackbuildco.com/features") ===
    "https://clause.stackbuildco.com/clauseguard-logo.svg" &&
  extractIconHref('<link rel="apple-touch-icon" href="/tile.png">', "https://warp.dev/") ===
    "https://warp.dev/tile.png");
check("an icon href is resolved against the page and protocol-checked",
  extractIconHref('<link rel="icon" href="mark.svg">', "https://warp.dev/docs/") ===
    "https://warp.dev/docs/mark.svg" &&
  extractIconHref('<link rel="icon" href="data:image/png;base64,AAAA">', "https://warp.dev/") === null &&
  extractIconHref('<link rel="icon" href="javascript:alert(1)">', "https://warp.dev/") === null &&
  extractIconHref('<link rel="mask-icon" href="/mask.svg">', "https://warp.dev/") === null &&
  extractIconHref("<html><head></head></html>", "https://warp.dev/") === null &&
  extractIconHref("", "https://warp.dev/") === null &&
  extractIconHref("<link rel=icon href=/mark.svg>", "not a url") === null);

const avatar = (label: string, size: number = DEFAULT_ICON_SIZE): string => avatarSvg(label, size);
check("a domain with no usable icon still gets a deterministic brand avatar",
  avatar("scribeswift.stackbuildco.com").includes(">S</text>") &&
  avatar("www.warp.dev").includes(">W</text>") &&
  avatar("").includes(">?</text>") &&
  avatar("warp.dev") === avatar("warp.dev"));
check("the avatar's label comes from the domain, never from raw markup",
  iconLabel("  www.Devfolio.io ") === "D" &&
  iconLabel("123tool.com") === "1" &&
  iconLabel("!!!") === "!" &&
  iconLabel("") === "?");
check("avatar text is XML-escaped, so a hostile label cannot inject markup",
  escapeXml(`<b>&"'</b>`) === "&lt;b&gt;&amp;&quot;&apos;&lt;/b&gt;" &&
  avatar("<img src=x onerror=alert(1)>").includes("&lt;img") &&
  !avatar("<img src=x onerror=alert(1)>").includes("<img"));
check("the avatar is a self-contained SVG sized by the clamped request",
  avatar("warp.dev", 32).includes('width="32"') &&
  avatar("warp.dev", 32).includes('height="32"') &&
  avatar("warp.dev", pickIconSize("9999")).includes(`width="${MAX_ICON_SIZE}"`) &&
  avatar("warp.dev").startsWith("<svg ") &&
  avatar("warp.dev").endsWith("</svg>") &&
  avatar("warp.dev").includes("url(#icon)"));
check("the avatar's colour is stable per domain and varies between domains",
  new Set(
    [
      "warp.dev",
      "clause.stackbuildco.com",
      "devfolio.stackbuildco.com",
      "scribeswift.stackbuildco.com",
      "raycast.com",
    ].map((domain) => avatar(domain, MIN_ICON_SIZE)),
  ).size > 1);

section("api/favicon.ts - the endpoint that always answers with an icon");

// The endpoint's contract is "always a 200 image", which is what removes the
// empty circle from every card. `fetch` is stubbed per URL, and DNS is injected,
// so each branch can be asserted without touching the network.
type StubHttpResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  body: null;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const binaryResponse = (
  bytes: Buffer,
  contentType: string,
  status = 200,
  declaredLength = bytes.byteLength,
): StubHttpResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get(name: string) {
      const key = name.toLowerCase();
      if (key === "content-type") return contentType;
      if (key === "content-length") return String(declaredLength);
      return null;
    },
  },
  body: null,
  arrayBuffer: async () => new Uint8Array(bytes).buffer as ArrayBuffer,
});

const redirectResponse = (location: string): StubHttpResponse => ({
  ok: false,
  status: 302,
  headers: { get: (name: string) => (name.toLowerCase() === "location" ? location : null) },
  body: null,
  arrayBuffer: async () => new ArrayBuffer(0),
});

/**
 * A `fetch` that answers exactly the URLs in `routes`. Anything else rejects,
 * standing in for a host that does not resolve or refuses the connection.
 */
const iconRoutes =
  (routes: Record<string, StubHttpResponse>) =>
  (input: unknown): Promise<StubHttpResponse> => {
    const target = typeof input === "string" ? input : String(input);
    const route = routes[target];
    return route ? Promise.resolve(route) : Promise.reject(new Error(`ENOTFOUND ${target}`));
  };

/**
 * The `ServerResponse` surface `api/favicon.ts` uses, captured in a plain object.
 *
 * `body` is annotated rather than inferred: `Buffer.alloc` is typed
 * `Buffer<ArrayBuffer>` in newer `@types/node` releases while `Buffer.isBuffer`
 * narrows to `Buffer<ArrayBufferLike>`, so an inferred property would reject the
 * assignment below (`Buffer<ArrayBufferLike> is not assignable to
 * Buffer<ArrayBuffer>`). Annotating keeps the harness compiling under both.
 */
type CapturedIconResponse = {
  statusCode: number;
  body: Buffer;
  setHeader(name: string, value: string): void;
  end(value?: Buffer | string): void;
};

const callIcon = async (
  url: string,
  options: { method?: string; ip?: string } = {},
): Promise<{
  status: number;
  source: string;
  headers: Record<string, string>;
  body: Buffer;
  text: string;
}> => {
  const headers: Record<string, string> = {};
  const response: CapturedIconResponse = {
    statusCode: 0,
    body: Buffer.alloc(0),
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = String(value);
    },
    end(value?: Buffer | string) {
      if (value !== undefined) {
        response.body = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
      }
    },
  };
  const request = {
    method: options.method ?? "GET",
    url,
    headers: options.ip ? { "x-forwarded-for": options.ip } : {},
    socket: null,
  };
  await faviconHandler(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  return {
    status: response.statusCode,
    headers,
    source: headers["x-icon-source"],
    body: response.body,
    text: response.body.toString("utf8"),
  };
};

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', "utf8");
const SPA_HTML = '<html><head><link rel="icon" href="/clauseguard-logo.svg"></head></html>';

setHostResolver(async () => [{ address: "93.184.216.34" }]);

const directIcon = await withFetch(
  iconRoutes({
    "https://clause.stackbuildco.com/favicon.ico": binaryResponse(PNG_BYTES, "image/png"),
  }),
  () => callIcon("/api/favicon?domain=clause.stackbuildco.com&size=128"),
);
check("a site's own /favicon.ico is forwarded unchanged",
  directIcon.status === 200 &&
  directIcon.source === "favicon" &&
  directIcon.headers["content-type"] === "image/png" &&
  directIcon.body.equals(PNG_BYTES) &&
  directIcon.headers["cache-control"].includes("immutable") &&
  directIcon.headers["x-content-type-options"] === "nosniff" &&
  !("content-security-policy" in directIcon.headers));

// devfolio.stackbuildco.com answers `/favicon.ico` with `200 text/html` (Vercel's
// SPA rewrite), so the icon has to be discovered from the page itself.
const linkIcon = await withFetch(
  iconRoutes({
    "https://devfolio.stackbuildco.com/favicon.ico": binaryResponse(Buffer.from(SPA_HTML), "text/html; charset=utf-8"),
    "https://devfolio.stackbuildco.com/": binaryResponse(Buffer.from(SPA_HTML), "text/html; charset=utf-8"),
    "https://devfolio.stackbuildco.com/clauseguard-logo.svg": binaryResponse(SVG_BYTES, "image/svg+xml"),
  }),
  () => callIcon("/api/favicon?domain=devfolio.stackbuildco.com"),
);
check("an SPA's HTML `favicon.ico` is rejected and the page's own icon is used instead",
  linkIcon.status === 200 &&
  linkIcon.source === "link" &&
  linkIcon.headers["content-type"] === "image/svg+xml; charset=utf-8" &&
  linkIcon.body.equals(SVG_BYTES) &&
  linkIcon.headers["content-security-policy"] === "default-src 'none'; style-src 'unsafe-inline'; sandbox");

const avatarIcon = await withFetch(
  iconRoutes({
    "https://parked.stackbuildco.com/favicon.ico": binaryResponse(Buffer.from("<html></html>"), "text/html"),
    "https://parked.stackbuildco.com/": binaryResponse(Buffer.from("<html><head></head></html>"), "text/html"),
  }),
  () => callIcon("/api/favicon?domain=parked.stackbuildco.com"),
);
check("a site with no usable icon is answered with a generated avatar, not a 404",
  avatarIcon.status === 200 &&
  avatarIcon.source === "avatar" &&
  avatarIcon.headers["content-type"] === "image/svg+xml; charset=utf-8" &&
  avatarIcon.text.includes(">P</text>") &&
  avatarIcon.headers["cache-control"].includes("max-age=3600"));

const deadIcon = await withFetch(iconRoutes({}), () =>
  callIcon("/api/favicon?domain=gone.stackbuildco.com"),
);
check("an unreachable host still answers 200 with an icon",
  deadIcon.status === 200 && deadIcon.source === "avatar" && deadIcon.text.startsWith("<svg "));

const hugeIcon = await withFetch(
  iconRoutes({
    "https://big.stackbuildco.com/favicon.ico": binaryResponse(PNG_BYTES, "image/png", 200, 900_000),
    "https://big.stackbuildco.com/": binaryResponse(Buffer.from("<html></html>"), "text/plain"),
  }),
  () => callIcon("/api/favicon?domain=big.stackbuildco.com"),
);
const octetIcon = await withFetch(
  iconRoutes({
    "https://blob.stackbuildco.com/favicon.ico": binaryResponse(PNG_BYTES, "application/octet-stream"),
  }),
  () => callIcon("/api/favicon?domain=blob.stackbuildco.com"),
);
check("an oversized or non-image upstream body is never proxied through",
  hugeIcon.source === "avatar" &&
  octetIcon.source === "avatar" &&
  octetIcon.headers["content-type"].startsWith("image/svg+xml"));

// The redirect hop is where an SSRF attempt would land, so it is asserted on the
// endpoint rather than only on the guard.
const ssrfIcon = await withFetch(
  iconRoutes({
    "https://evil.stackbuildco.com/favicon.ico": redirectResponse("http://169.254.169.254/latest/meta-data/"),
    "https://evil.stackbuildco.com/": binaryResponse(Buffer.from("<html><head></head></html>"), "text/html"),
  }),
  () => callIcon("/api/favicon?domain=evil.stackbuildco.com"),
);
const cdnIcon = await withFetch(
  iconRoutes({
    "https://shorthand.stackbuildco.com/favicon.ico": redirectResponse("https://cdn.example.com/mark.ico"),
    "https://cdn.example.com/mark.ico": binaryResponse(PNG_BYTES, "image/x-icon"),
  }),
  () => callIcon("/api/favicon?domain=shorthand.stackbuildco.com"),
);
const loopIcon = await withFetch(
  iconRoutes({
    "https://loop.stackbuildco.com/favicon.ico": redirectResponse("https://loop.stackbuildco.com/favicon.ico"),
  }),
  () => callIcon("/api/favicon?domain=loop.stackbuildco.com"),
);
check("a redirect into the deployment's own network is refused",
  ssrfIcon.status === 200 && ssrfIcon.source === "avatar");
check("a redirect to a public host is followed",
  cdnIcon.status === 200 &&
  cdnIcon.source === "favicon" &&
  cdnIcon.headers["content-type"] === "image/x-icon" &&
  cdnIcon.body.equals(PNG_BYTES));
check("a redirect loop is abandoned instead of followed forever",
  loopIcon.status === 200 && loopIcon.source === "avatar");

// A request we cannot attribute to a public host must never become a fetch - and
// it still has to answer with an image, because the browser has already asked.
const invalidIcons = await withFetch(iconRoutes({}), async () => [
  await callIcon("/api/favicon"),
  await callIcon("/api/favicon?domain=localhost"),
  await callIcon(`/api/favicon?domain=${encodeURIComponent("https://warp.dev/")}`),
]);
check("a missing, local or URL-shaped domain is answered with the avatar, never a fetch",
  invalidIcons.every(
    (response) =>
      response.status === 400 &&
      response.source === "invalid" &&
      response.headers["content-type"] === "image/svg+xml; charset=utf-8" &&
      response.headers["cache-control"] === "no-store" &&
      response.text.includes("<svg "),
  ));

const resizedIcon = await withFetch(iconRoutes({}), () =>
  callIcon("/api/favicon?domain=warp.dev&size=9999"),
);
check("the avatar honours `?size=` inside its clamp",
  resizedIcon.status === 200 && resizedIcon.text.includes(`width="${MAX_ICON_SIZE}"`));

const headIcon = await withFetch(
  iconRoutes({
    "https://clause.stackbuildco.com/favicon.ico": binaryResponse(PNG_BYTES, "image/png"),
  }),
  () => callIcon("/api/favicon?domain=clause.stackbuildco.com", { method: "HEAD" }),
);
const postIcon = await withFetch(iconRoutes({}), () =>
  callIcon("/api/favicon?domain=warp.dev", { method: "POST" }),
);
check("HEAD answers with the same headers and no body",
  headIcon.status === 200 &&
  headIcon.source === "favicon" &&
  headIcon.headers["content-length"] === String(PNG_BYTES.byteLength) &&
  headIcon.body.byteLength === 0);
check("only GET and HEAD are served",
  postIcon.status === 405 &&
  postIcon.headers["allow"] === "GET, HEAD" &&
  postIcon.headers["cache-control"] === "no-store");

// One card per listing means one request per listing, so the ceiling is per
// client and generous - but it must exist, and a throttled response must still be
// an image rather than a broken one.
resetRateLimits();
const throttledStatuses: number[] = [];
for (let attempt = 0; attempt < 122; attempt += 1) {
  throttledStatuses.push(
    (await callIcon("/api/favicon?domain=localhost", { ip: "203.0.113.7" })).status,
  );
}
const blockedIcon = await callIcon("/api/favicon?domain=localhost", { ip: "203.0.113.7" });
const otherClientIcon = await callIcon("/api/favicon?domain=localhost", { ip: "198.51.100.9" });
check("one client cannot turn the deployment into an icon farm",
  throttledStatuses.filter((status) => status === 400).length === 120 &&
  throttledStatuses[120] === 429 &&
  throttledStatuses[121] === 429 &&
  blockedIcon.status === 429 &&
  blockedIcon.source === "throttled" &&
  Number(blockedIcon.headers["retry-after"]) >= 1);
check("a throttled response is still an image and another client is unaffected",
  blockedIcon.headers["content-type"] === "image/svg+xml; charset=utf-8" &&
  blockedIcon.text.includes("<svg ") &&
  otherClientIcon.status === 400 &&
  otherClientIcon.text.includes("<svg "));
resetRateLimits();

check("every branch - icon, avatar, invalid, throttled - answered with an image",
  [
    directIcon,
    linkIcon,
    avatarIcon,
    deadIcon,
    hugeIcon,
    octetIcon,
    ssrfIcon,
    cdnIcon,
    loopIcon,
    headIcon,
    resizedIcon,
  ].every(
    (response) =>
      response.status === 200 && response.headers["content-type"].startsWith("image/"),
  ) &&
    blockedIcon.headers["content-type"].startsWith("image/"));

// Restore real DNS for anything that runs after this point.
setHostResolver(null);

section("api/_lib/ogText.ts - generated card fields");

// The card is rendered from `?title=`/`?tagline=`/`?category=`/`?pricing=`, so
// every value is caller-controlled. Uncapped, `?title=<hundreds of kB>` was laid
// out by satori verbatim.
check("a card field is collapsed onto one line",
  ogText("Docu\nVector\tAI", "fallback", 60) === "Docu Vector AI");
check("control characters never reach the canvas",
  ogText("Docu\u0000Vector\u009F AI", "fallback", 60) === "Docu Vector AI");
check("an over-long field is capped with an ellipsis inside the limit",
  ogText("x".repeat(500), "fallback", OG_TEXT_LIMITS.title).length === OG_TEXT_LIMITS.title &&
  ogText("x".repeat(500), "fallback", OG_TEXT_LIMITS.title) === `${"x".repeat(OG_TEXT_LIMITS.title - 3)}...`);
check("an empty or missing field falls back to the site's own copy",
  ogText("", "StackDirectory", 120) === "StackDirectory" &&
  ogText("   ", "StackDirectory", 120) === "StackDirectory" &&
  ogText(null, "StackDirectory", 120) === "StackDirectory" &&
  ogText(42, "StackDirectory", 120) === "StackDirectory");
check("a field that already fits is rendered exactly as written",
  ogText("DocuVector AI", "fallback", OG_TEXT_LIMITS.title) === "DocuVector AI");

section("Local acquisition offers - the deal-room contract");

const builtOffer = buildLocalAcquisitionOffer({
  toolId: "tool-1",
  userId: "user-7",
  buyerName: "  Ada Lovelace  ",
  buyerEmail: " ada@example.com ",
  offerAmount: 1200,
  message: "   ",
  now: new Date("2026-01-02T03:04:05.000Z"),
});
check("a local offer records the buyer_id the deal room filters on",
  builtOffer.buyer_id === "user-7" && builtOffer.tool_id === "tool-1");
check("a local offer is trimmed, pending and stamped",
  builtOffer.buyer_name === "Ada Lovelace" &&
  builtOffer.buyer_email === "ada@example.com" &&
  builtOffer.status === "pending" &&
  builtOffer.created_at === "2026-01-02T03:04:05.000Z");
check("a blank message is stored as null, not as whitespace", builtOffer.message === null);
check("offers for two listings never share an id",
  buildLocalAcquisitionOffer({
    toolId: "tool-2",
    userId: "user-7",
    buyerName: "Ada",
    buyerEmail: "ada@example.com",
    offerAmount: 1,
  }).id !== builtOffer.id);

resetStorage();
check("an offer round-trips through storage and is still found by buyer_id",
  writeJsonArray(STORAGE_KEYS.acquisitionOffers, [builtOffer]) &&
  readJsonArray<{ buyer_id?: string }>(STORAGE_KEYS.acquisitionOffers)
    .filter((entry) => entry.buyer_id === "user-7").length === 1);

// Private mode and a full quota both make `setItem` throw. The helpers must turn
// that into `false` so a form can fail loudly, instead of reporting success for
// an offer (or a bookmark, or a vote) that was never stored.
const storageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
) as PropertyDescriptor;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: noop,
  },
});
check("a rejected storage write reports failure instead of throwing",
  writeJsonArray(STORAGE_KEYS.tools, [pendingTool]) === false &&
  writeStringArray(STORAGE_KEYS.savedTools, ["one"]) === false);
Object.defineProperty(globalThis, "localStorage", storageDescriptor);

/* ------------------------------- hardening: the public mail relay's own rules */

section("api/send-email.ts - address validation and session guards");

const emailEnv = {
  ...adminEnv,
  RESEND_API_KEY: "re_test",
  RESEND_FROM_EMAIL: "StackDirectory <noreply@example.com>",
};

const offerPayload = (overrides: Record<string, unknown> = {}) => ({
  type: "NEW_OFFER",
  toolName: "DocuVector AI",
  toolSlug: "docuvector-ai",
  ownerEmail: "owner@example.com",
  offerAmount: 1200,
  message: "Is the price negotiable?",
  ...overrides,
});

const resendCalls = (backend: { calls: ApiCall[] }) =>
  backend.calls.filter((call) => call.url.includes("api.resend.com/emails"));

// Addresses are caller-supplied, so an undeliverable or header-carrying one has
// to be refused before Resend is asked to send anything.
const invalidRecipientBackend = createAdminStub();
const invalidRecipient = await withEnv(emailEnv, () =>
  withFetch(invalidRecipientBackend.stub, () =>
    invoke(sendEmailHandler, {
      body: JSON.stringify(offerPayload({ ownerEmail: "not-an-email" })),
    }),
  ),
);
check("an undeliverable recipient is rejected before anything is sent",
  invalidRecipient.status === 400 && invalidRecipientBackend.calls.length === 0,
  JSON.stringify(invalidRecipient.body));

const injectedRecipientBackend = createAdminStub();
const injectedRecipient = await withEnv(emailEnv, () =>
  withFetch(injectedRecipientBackend.stub, () =>
    invoke(sendEmailHandler, {
      body: JSON.stringify(
        offerPayload({ ownerEmail: "owner@example.com\r\nBcc: attacker@example.com" }),
      ),
    }),
  ),
);
check("a CR/LF-carrying recipient is rejected before anything is sent",
  injectedRecipient.status === 400 && injectedRecipientBackend.calls.length === 0,
  JSON.stringify(injectedRecipient.body));

// `NEW_OFFER` and `APP_APPROVED` are hand-triggered, so they must carry the
// session of the visitor who triggered them. Without the guard the endpoint is an
// open relay: anyone could mail any listing owner from StackDirectory's domain.
const anonymousOffer = await withEnv(emailEnv, () =>
  withFetch(createAdminStub().stub, () =>
    invoke(sendEmailHandler, { body: JSON.stringify(offerPayload()) }),
  ),
);
check("an anonymous NEW_OFFER is refused once Supabase is configured",
  anonymousOffer.status === 401, JSON.stringify(anonymousOffer.body));

const forgedSessionBackend = createAdminStub({ user: null });
const forgedSession = await withEnv(emailEnv, () =>
  withFetch(forgedSessionBackend.stub, () =>
    invoke(sendEmailHandler, {
      headers: { authorization: "Bearer forged-token" },
      body: JSON.stringify(offerPayload()),
    }),
  ),
);
check("a token Supabase does not recognise is refused",
  forgedSession.status === 401 && resendCalls(forgedSessionBackend).length === 0,
  JSON.stringify(forgedSession.body));

const memberUser = { id: "u2", email: "member@example.com", app_metadata: {} };
const memberOfferBackend = createAdminStub({ user: memberUser });
const memberOffer = await withEnv(emailEnv, () =>
  withFetch(memberOfferBackend.stub, () =>
    invoke(sendEmailHandler, {
      headers: { authorization: "Bearer session-jwt" },
      body: JSON.stringify(offerPayload()),
    }),
  ),
);
check("a signed-in visitor's offer is delivered",
  memberOffer.status === 200 && resendCalls(memberOfferBackend).length === 1,
  JSON.stringify(memberOffer.body));
const offerMail = JSON.parse(
  resendCalls(memberOfferBackend)[0]?.body || "{}",
) as Record<string, unknown>;
check("the offer is addressed to the listing owner and names the listing",
  offerMail.to === "owner@example.com" &&
  String(offerMail.subject ?? "").includes("DocuVector AI"),
  JSON.stringify(offerMail));

const approvalPayload = {
  type: "APP_APPROVED",
  toolName: "DocuVector AI",
  toolSlug: "docuvector-ai",
  submitterEmail: "submitter@example.com",
};

const memberApprovalBackend = createAdminStub({ user: memberUser });
const memberApproval = await withEnv(emailEnv, () =>
  withFetch(memberApprovalBackend.stub, () =>
    invoke(sendEmailHandler, {
      headers: { authorization: "Bearer session-jwt" },
      body: JSON.stringify(approvalPayload),
    }),
  ),
);
check("a signed-in non-admin cannot trigger the approval notification",
  memberApproval.status === 403 && resendCalls(memberApprovalBackend).length === 0,
  JSON.stringify(memberApproval.body));

const adminApprovalBackend = createAdminStub({ user: adminUser });
const adminApproval = await withEnv(emailEnv, () =>
  withFetch(adminApprovalBackend.stub, () =>
    invoke(sendEmailHandler, {
      headers: { authorization: "Bearer session-jwt" },
      body: JSON.stringify(approvalPayload),
    }),
  ),
);
check("an administrator can trigger the approval notification",
  adminApproval.status === 200 && resendCalls(adminApprovalBackend).length === 1,
  JSON.stringify(adminApproval.body));

// Deliberate: a deployment with no Supabase project has no session to verify, so
// the endpoint keeps its previous best-effort behaviour instead of going dark.
const unconfiguredBackend = createAdminStub();
const unconfiguredOffer = await withEnv(
  {
    ...emailEnv,
    SUPABASE_URL: undefined,
    VITE_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
  () =>
    withFetch(unconfiguredBackend.stub, () =>
      invoke(sendEmailHandler, { body: JSON.stringify(offerPayload()) }),
    ),
);
check("with no Supabase project there is no session to verify",
  unconfiguredOffer.status === 200 && resendCalls(unconfiguredBackend).length === 1,
  JSON.stringify(unconfiguredOffer.body));

// The relay is public, so one client must not be able to spend the deployment's
// Resend quota in a loop. The limit is applied before the body is even parsed.
resetRateLimits();
const throttledBackend = createAdminStub();
const throttled = await withEnv(
  {
    ...emailEnv,
    SUPABASE_URL: undefined,
    VITE_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
  async () => {
    const responses: Array<{ status: number; body: Record<string, unknown> | null }> = [];
    for (let request = 0; request < 16; request += 1) {
      responses.push(
        await withFetch(throttledBackend.stub, () =>
          invoke(sendEmailHandler, {
            headers: { "x-forwarded-for": "198.51.100.7" },
            body: JSON.stringify(offerPayload()),
          }),
        ),
      );
    }
    return responses;
  },
);
check("one client is throttled after 15 requests in the window",
  throttled.slice(0, 15).every((response) => response.status === 200) &&
  throttled[15].status === 429,
  throttled.map((response) => response.status).join(","));
check("the throttled request is refused before it can send mail",
  throttled[15].body?.success === false &&
  String(throttled[15].body?.error ?? "").includes("Too many requests") &&
  resendCalls(throttledBackend).length === 15,
  JSON.stringify(throttled[15].body));
resetRateLimits();

/* ------------- hardening: a failed upgrade must not consume its replay slot */

section("api/paddle-webhook.ts - a failed upgrade releases its replay guard");

// The upgrade is recorded as processed *before* the database work, and Paddle
// only retries a delivery that did not receive a 2xx. A transient Supabase
// failure therefore had to release that key again: otherwise Paddle's retry was
// answered `duplicate: true` and the paying customer's listing was never featured.
const retryId = createToolId();
const retryEvent = buildPaddleEvent(retryId, "https://retry.app");
const retryRow = {
  id: retryId,
  name: "DocuVector AI",
  category: "AI & Machine Learning",
  pricing_type: "Paid",
  website_url: "https://retry.app",
};

const failingUpgradeBackend = (() => {
  const calls: FetchCall[] = [];
  const stub = (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    if (!url.includes("/rest/v1/tools")) return jsonResponse({ success: true });
    if (init?.method === "PATCH" || init?.method === "POST") {
      return jsonResponse({ message: "connection to the database failed" }, false, 500);
    }
    return jsonResponse([retryRow]);
  };
  return { stub, calls };
})();

const failedUpgrade = await withEnv(productionEnv, () =>
  withFetch(failingUpgradeBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: retryEvent.raw,
      headers: { "paddle-signature": sign(retryEvent.raw) },
    }),
  ),
);
check("a database failure answers 500 so Paddle retries",
  failedUpgrade.status === 500,
  JSON.stringify(failedUpgrade.body));
check("the failed delivery does not consume the replay guard",
  !hasProcessedEvent(`txn_1:${retryId}`));

const retryBackend = createBackendStub([retryRow]);
const retried = await withEnv(productionEnv, () =>
  withFetch(retryBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: retryEvent.raw,
      headers: { "paddle-signature": sign(retryEvent.raw) },
    }),
  ),
);
check("Paddle's retry is applied instead of being answered as a duplicate",
  retried.status === 200 &&
  retried.body?.duplicate !== true &&
  retryBackend.calls.some((call) => call.method === "PATCH"),
  JSON.stringify(retried.body));
check("the delivery that finally succeeded is the one that is remembered",
  hasProcessedEvent(`txn_1:${retryId}`));

const replayedBackend = createBackendStub([retryRow]);
const replayed = await withEnv(productionEnv, () =>
  withFetch(replayedBackend.stub, () =>
    invoke(paddleWebhookHandler, {
      body: retryEvent.raw,
      headers: { "paddle-signature": sign(retryEvent.raw) },
    }),
  ),
);
check("a later replay is acknowledged without repeating any work",
  replayed.status === 200 &&
  replayed.body?.duplicate === true &&
  replayedBackend.calls.length === 0,
  JSON.stringify(replayed.body));

/* ---------------------------------------------------------------- summary */

section("Summary");
console.log(`Checks passed: ${passed}`);

if (failures.length > 0) {
  console.log(`Checks failed: ${failures.length}`);
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exit(1);
}

console.log("All checks passed.");
