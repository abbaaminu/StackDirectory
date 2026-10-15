/**
 * `<head>` social metadata for an open listing detail view.
 *
 * Why this is its own module and not inline in `ToolDetailModal`:
 *
 *  - **Restoring, not deleting.** The first implementation removed every tag it
 *    had touched on close. `index.html` already ships `og:title`,
 *    `og:description`, `og:image`, `og:url`, `twitter:card`, `twitter:title`,
 *    `twitter:description` and `twitter:image`, so opening and closing one
 *    listing permanently stripped the site's own preview cards until a reload.
 *    Tags that already existed are restored to their previous content; only tags
 *    this module created are removed.
 *  - **Testable.** It touches the smallest possible slice of the DOM
 *    (`querySelector`/`createElement`/`appendChild`), so the whole flow can be
 *    exercised against a stub head in `scripts/verify.tsx`.
 */

export type OgMetaAttribute = "property" | "name";

/** A single `<meta>` tag this module manages. */
export type OgMetaEntry = readonly [attribute: OgMetaAttribute, key: string, content: string];

/** The subset of `HTMLElement` the module uses. */
export interface MetaElementLike {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
  parentNode?: unknown;
}

/**
 * The subset of `Document` this module uses.
 *
 * `E` is the element `createElement("meta")` produces, which is what lets both
 * the real DOM (`HTMLMetaElement`) and the stub in `scripts/verify.tsx` satisfy
 * the interface: the DOM's `appendChild` requires a real `Node`, so the created
 * element's own type has to flow through rather than being widened away.
 */
export interface HeadOwnerLike<E extends MetaElementLike = MetaElementLike> {
  createElement(tagName: "meta"): E;
  head: {
    querySelector(selector: string): MetaElementLike | null;
    appendChild(node: E): unknown;
  };
}

/**
 * Social tags that describe one listing.
 *
 * `title`/`tagline` are user-supplied, so callers must pass them through
 * `encodeURIComponent` when they build the OG image URL - never into an
 * attribute value, where a quote could close the tag.
 */
export const buildToolOgMetadata = (listing: {
  name: string;
  tagline: string;
  imageUrl: string;
  shareUrl: string;
}): OgMetaEntry[] => [
  ["property", "og:title", listing.name],
  ["property", "og:description", listing.tagline],
  ["property", "og:image", listing.imageUrl],
  ["property", "og:url", listing.shareUrl],
  ["name", "twitter:card", "summary_large_image"],
  ["name", "twitter:title", listing.name],
  ["name", "twitter:description", listing.tagline],
  ["name", "twitter:image", listing.imageUrl],
];

/**
 * Applies `entries` to the document head and returns a restore function.
 *
 * Idempotent per entry: a tag that already exists is updated in place, so
 * re-running it (a new listing, an upvote re-render) never duplicates tags.
 */
export function applyToolOgMetadata<E extends MetaElementLike>(
  owner: HeadOwnerLike<E>,
  entries: ReadonlyArray<OgMetaEntry>,
): () => void {
  const restoreActions: Array<() => void> = [];

  for (const [attribute, key, content] of entries) {
    const selector = `meta[${attribute}="${key}"]`;
    const existing = owner.head.querySelector(selector);

    if (existing) {
      const previousContent = existing.getAttribute("content");
      existing.setAttribute("content", content);
      restoreActions.push(() => {
        if (previousContent === null) existing.remove();
        else existing.setAttribute("content", previousContent);
      });
      continue;
    }

    const created = owner.createElement("meta");
    created.setAttribute(attribute, key);
    created.setAttribute("content", content);
    if (!created.parentNode) owner.head.appendChild(created);
    restoreActions.push(() => created.remove());
  }

  return () => {
    for (const restore of restoreActions) restore();
  };
}
