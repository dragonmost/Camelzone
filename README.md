# Camelzone

Tampermonkey userscript tools for Amazon product workflows.

## Current project

`userscript/amazon-camel-link.user.js` adds a button to Amazon product pages that opens the matching CamelCamelCamel product history page and shows lowest price highlights.

Version 1 scope:
- Supports desktop Amazon Canada and US pages (`amazon.ca`, `www.amazon.ca`, `amazon.com`, and `www.amazon.com`)
- Injects one button per product page
- Uses layered ASIN extraction with validation
- Fetches and displays best historical Amazon and 3rd-party-new prices from CamelCamelCamel
- Includes verbose debug logs in browser console

## Install

1. Install Tampermonkey in your browser.
2. Open Tampermonkey dashboard.
3. Create a new script.
4. Replace template content with the script from `userscript/amazon-camel-link.user.js`.
5. Save.
6. Visit an Amazon.ca or Amazon.com product page and confirm the button appears.

## How it works

- Detects supported marketplace host (v1: `amazon.ca` and `amazon.com`)
- Extracts ASIN from URL path, canonical URL, query params, then DOM fallbacks
- Builds Camel URL in the form:

```text
https://{market}.camelcamelcamel.com/product/<ASIN>
```

Where `{market}` is:
- `ca` for Amazon Canada
- empty (root host) for Amazon US (`camelcamelcamel.com`)
- Inserts an idempotent button near the buy box, with fallback placement near title/center content
- Fetches Camel page stats and shows:
	- `Best Amazon`
	- `Best 3rd party new`
- Re-evaluates on DOM mutations and history navigation changes

## Future domain support

The script is prepared for extension with:
- A marketplace mapping object (`MARKETPLACE_CONFIG`)
- Explicit metadata match entries per supported Amazon domain

When adding a domain, update:
1. Metadata `@match` entries
2. `MARKETPLACE_CONFIG` camel host mapping
3. Manual test scenarios

## Notes

- Mobile domains are intentionally excluded in v1.
- Non-product pages should not display the button.
- Debug logs are prefixed with `[Camelzone]`.
