# Manual Test Matrix

## Required environment

- Browser with Tampermonkey installed
- `userscript/amazon-camel-link.user.js` loaded and enabled

## Scenarios

1. Product page with `/dp/` URL
   - Example: `https://www.amazon.ca/dp/<ASIN>`
   - Example: `https://www.amazon.com/dp/<ASIN>`
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
   - Example: `amazon.co.uk`
   - Expected: no injection from this script metadata scope

8. Marketplace routing check
   - Example: open one `amazon.ca` product and one `amazon.com` product
   - Expected: Canada links use `ca.camelcamelcamel.com`; US links use `camelcamelcamel.com`
9. Lowest price fields load
   - On a supported product page, wait for Camel fetch to complete
   - Expected: `Best Amazon` and `Best 3rd party new` show price values or `unavailable`
10. Lowest price fields update on in-site navigation
   - Navigate from product A to product B without full reload
   - Expected: both lowest price rows update for the new ASIN and do not duplicate

## Logging checks

- Console should include verbose logs prefixed with `[Camelzone]`.
- No unhandled errors during repeated navigation.
- On Camel fetch failure or timeout, logs should indicate lowest price fetch failure without breaking the button.

## Regression checks

- Button style remains readable and clickable.
- Link opens in new tab.
- Link uses `noopener noreferrer`.
