# Implementation Notes

## Design goals

- Keep v1 narrow and reliable (Amazon Canada desktop only)
- Avoid false ASIN detection from unrelated page widgets
- Ensure the button updates cleanly during dynamic page navigation

## ASIN extraction order

1. URL path patterns
   - `/dp/<ASIN>`
   - `/gp/product/<ASIN>`
   - `/gp/aw/d/<ASIN>`
   - `/exec/obidos/ASIN/<ASIN>`
   - `/gp/offer-listing/<ASIN>`
2. Canonical URL sources
   - `link[rel="canonical"]`
   - `meta[property="og:url"]`
3. Query parameters
   - `asin`, `ASIN`, `pd_rd_i`
4. DOM fallbacks
   - `#ASIN`, `input[name="ASIN"]`, `#dp[data-asin]`
   - Product detail rows containing `ASIN`

Every candidate is normalized to uppercase and validated as exactly 10 alphanumeric characters.

## Injection strategy

- The script keeps a single injected container using a fixed element id.
- If the page changes product context, it updates the existing link instead of creating duplicates.
- Preferred target area is near buy box and right rail.
- If preferred selectors are unavailable, it falls back near title/center content.

## Dynamic page handling

Amazon may update content without full page reload. The script re-checks page state on:
- Initial load
- MutationObserver changes
- History API navigation (`pushState`, `replaceState`, `popstate`)

Checks are debounced to avoid excessive work during rapid DOM updates.

## Domain expansion path

To add another Amazon marketplace later:
1. Add the new host to userscript metadata `@match` entries.
2. Add host mapping in `MARKETPLACE_CONFIG`.
3. Test ASIN extraction and button placement on that domain.
4. Confirm Camel host target for the new marketplace.
