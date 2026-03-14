# Manual Test Matrix

## Required environment

- Browser with Tampermonkey installed
- `userscript/amazon-camel-link.user.js` loaded and enabled

## Scenarios

1. Product page with `/dp/` URL
   - Example: `https://www.amazon.ca/dp/<ASIN>`
   - Expected: one Camel button appears and opens matching Camel product URL
2. Product page with `/gp/product/` URL
   - Expected: one Camel button appears with same ASIN behavior
3. Offer listing URL
   - Example: `/gp/offer-listing/<ASIN>`
   - Expected: button still resolves to same ASIN Camel page
4. Non-product pages (home/search/cart)
   - Expected: no Camel button
5. In-site navigation from product A to product B
   - Expected: button updates link to new ASIN, no duplicate button
6. Product variant changes on same page
   - Expected: if ASIN changes, button link updates
7. Unsupported host check
   - Example: `amazon.com` while script scope remains CA-only
   - Expected: no injection from this script metadata scope

## Logging checks

- Console should include verbose logs prefixed with `[CamelTools]`.
- No unhandled errors during repeated navigation.

## Regression checks

- Button style remains readable and clickable.
- Link opens in new tab.
- Link uses `noopener noreferrer`.
