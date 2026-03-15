// ==UserScript==
// @name         Camelzone
// @namespace    https://github.com/Dragonmost/Camelzone
// @version      0.4.0
// @description  Adds a CamelCamelCamel button on Amazon product pages.
// @author       Dragonmost
// @updateURL    https://raw.githubusercontent.com/Dragonmost/Camelzone/main/userscript/amazon-camel-link.user.js
// @downloadURL  https://raw.githubusercontent.com/Dragonmost/Camelzone/main/userscript/amazon-camel-link.user.js
// @match        https://www.amazon.ca/*
// @match        https://amazon.ca/*
// @match        https://www.amazon.com/*
// @match        https://amazon.com/*
// @connect      camelcamelcamel.com
// @connect      *.camelcamelcamel.com
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  "use strict";

  const DEBUG = false;
  const ROOT_ID = "ccc-link-root";
  const LINK_ID = "ccc-link-anchor";
  const SOURCE_ID = "ccc-link-source";
  const AMAZON_PRICE_ID = "ccc-lowest-amazon";
  const THIRD_PARTY_PRICE_ID = "ccc-lowest-third-party-new";
  const EVALUATE_DEBOUNCE_MS = 150;

  // Keep this table ready for future marketplace additions.
  const MARKETPLACE_CONFIG = {
    "amazon.ca": {
      camelHost: "ca.camelcamelcamel.com",
    },
    "amazon.com": {
      camelHost: "camelcamelcamel.com",
    },
  };

  let evaluateTimer = null;
  let observer = null;
  let currentPriceRequestId = 0;
  const priceCache = new Map();

  function log(...args) {
    if (!DEBUG) {
      return;
    }

    console.log("[Camelzone]", ...args);
  }

  function normalizeHost(hostname) {
    return hostname.toLowerCase().replace(/^www\./, "");
  }

  function getMarketplaceConfig(hostname) {
    const normalizedHost = normalizeHost(hostname);
    return MARKETPLACE_CONFIG[normalizedHost] || null;
  }

  function validateAsin(value) {
    if (!value) {
      return null;
    }

    const normalized = String(value).trim().toUpperCase();
    return /^[A-Z0-9]{10}$/.test(normalized) ? normalized : null;
  }

  function parseAsinFromText(text) {
    if (!text) {
      return null;
    }

    const match = String(text).toUpperCase().match(/\b([A-Z0-9]{10})\b/);
    return match ? validateAsin(match[1]) : null;
  }

  function safeParseUrl(rawUrl) {
    try {
      return new URL(rawUrl, window.location.origin);
    } catch (error) {
      return null;
    }
  }

  function extractAsinFromPath(pathname) {
    const path = String(pathname || "").toUpperCase();
    const patterns = [
      /\/DP\/([A-Z0-9]{10})(?:[/?]|$)/,
      /\/GP\/PRODUCT\/([A-Z0-9]{10})(?:[/?]|$)/,
      /\/GP\/AW\/D\/([A-Z0-9]{10})(?:[/?]|$)/,
      /\/EXEC\/OBIDOS\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/,
      /\/GP\/OFFER-LISTING\/([A-Z0-9]{10})(?:[/?]|$)/,
    ];

    for (const pattern of patterns) {
      const match = path.match(pattern);
      if (match) {
        return validateAsin(match[1]);
      }
    }

    return null;
  }

  function extractAsinFromCanonical() {
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const ogUrlEl = document.querySelector('meta[property="og:url"]');
    const candidates = [
      canonicalEl ? canonicalEl.getAttribute("href") : null,
      ogUrlEl ? ogUrlEl.getAttribute("content") : null,
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      const parsed = safeParseUrl(candidate);
      if (!parsed) {
        continue;
      }

      const asin = extractAsinFromPath(parsed.pathname);
      if (asin) {
        return asin;
      }
    }

    return null;
  }

  function extractAsinFromQuery(search) {
    const params = new URLSearchParams(search || window.location.search);
    const keys = ["asin", "ASIN", "pd_rd_i"];

    for (const key of keys) {
      const value = params.get(key);
      const asin = validateAsin(value);
      if (asin) {
        return asin;
      }
    }

    return null;
  }

  function extractAsinFromDom() {
    const directSelectors = ["#ASIN", 'input[name="ASIN"]', "#dp"];

    for (const selector of directSelectors) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      const value =
        element.getAttribute("value") ||
        element.getAttribute("data-asin") ||
        element.getAttribute("asin");
      const asin = validateAsin(value);
      if (asin) {
        return asin;
      }
    }

    const detailBulletRows = document.querySelectorAll(
      "#detailBullets_feature_div li, #productDetails_detailBullets_sections1 tr, #prodDetails tr"
    );

    for (const row of detailBulletRows) {
      const text = row.textContent || "";
      if (!/\bASIN\b/i.test(text)) {
        continue;
      }

      const asin = parseAsinFromText(text);
      if (asin) {
        return asin;
      }
    }

    return null;
  }

  function getAsinAndSource() {
    const sources = [
      {
        id: "url-path",
        getter: () => extractAsinFromPath(window.location.pathname),
      },
      {
        id: "canonical",
        getter: extractAsinFromCanonical,
      },
      {
        id: "query",
        getter: () => extractAsinFromQuery(window.location.search),
      },
      {
        id: "dom",
        getter: extractAsinFromDom,
      },
    ];

    for (const source of sources) {
      const asin = source.getter();
      if (asin) {
        return { asin, source: source.id };
      }
    }

    return { asin: null, source: null };
  }

  function buildCamelUrl(camelHost, asin) {
    return `https://${camelHost}/product/${asin}`;
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function extractCurrencyPrice(text) {
    const input = normalizeWhitespace(text);
    if (!input) {
      return null;
    }

    const match = input.match(/(?:US\$|CA\$|C\$|A\$|\$|£|€)\s*\d[\d,]*(?:\.\d{2})?/i);
    return match ? normalizeWhitespace(match[0]) : null;
  }

  function findPriceNearLabel(documentRoot, labelPatterns) {
    const nodes = documentRoot.querySelectorAll("tr, li, p, div, span");

    for (const node of nodes) {
      const text = normalizeWhitespace(node.textContent);
      if (!text) {
        continue;
      }

      const isMatch = labelPatterns.some((pattern) => pattern.test(text));
      if (!isMatch) {
        continue;
      }

      const nearbyTexts = [
        text,
        node.nextElementSibling ? normalizeWhitespace(node.nextElementSibling.textContent) : "",
        node.parentElement ? normalizeWhitespace(node.parentElement.textContent) : "",
      ];

      for (const nearbyText of nearbyTexts) {
        const price = extractCurrencyPrice(nearbyText);
        if (price) {
          return price;
        }
      }
    }

    return null;
  }

  function findPriceInBodyText(bodyText, labelPatterns) {
    if (!bodyText) {
      return null;
    }

    const matches = [
      /(?:US\$|CA\$|C\$|A\$|\$|£|€)\s*\d[\d,]*(?:\.\d{2})?/i,
    ];

    for (const pattern of labelPatterns) {
      const source = pattern.source;
      const flags = pattern.flags.includes("i") ? pattern.flags : `${pattern.flags}i`;
      const combined = new RegExp(`${source}.{0,120}${matches[0].source}`, flags);
      const segment = bodyText.match(combined);
      if (segment) {
        const price = extractCurrencyPrice(segment[0]);
        if (price) {
          return price;
        }
      }
    }

    return null;
  }

  function parseLowestPricesFromCamelHtml(html) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");

    const amazonLabelPatterns = [/\blowest\b.*\bamazon\b/i, /\bamazon\b.*\blowest\b/i];
    const thirdPartyLabelPatterns = [
      /\blowest\b.*\b(?:3rd|third)\s*party\b.*\bnew\b/i,
      /\b(?:3rd|third)\s*party\b.*\bnew\b.*\blowest\b/i,
      /\blowest\b.*\bnew\b.*\b(?:3rd|third)\s*party\b/i,
    ];

    const bodyText = normalizeWhitespace(parsed.body ? parsed.body.textContent : html);

    const lowestAmazon =
      findPriceNearLabel(parsed, amazonLabelPatterns) ||
      findPriceInBodyText(bodyText, amazonLabelPatterns);

    const lowestThirdPartyNew =
      findPriceNearLabel(parsed, thirdPartyLabelPatterns) ||
      findPriceInBodyText(bodyText, thirdPartyLabelPatterns);

    return {
      lowestAmazon: lowestAmazon || null,
      lowestThirdPartyNew: lowestThirdPartyNew || null,
    };
  }

  function fetchCamelPage(camelUrl) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url: camelUrl,
          timeout: 10000,
          onload: (response) => {
            if (response.status >= 200 && response.status < 400) {
              resolve(response.responseText || "");
              return;
            }

            reject(new Error(`Camel request failed with status ${response.status}`));
          },
          onerror: () => {
            reject(new Error("Camel request failed"));
          },
          ontimeout: () => {
            reject(new Error("Camel request timed out"));
          },
        });

        return;
      }

      fetch(camelUrl)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Camel request failed with status ${response.status}`);
          }

          return response.text();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function getInjectionTarget() {
    const preferredSelectors = [
      "#buybox",
      "#desktop_qualifiedBuyBox",
      "#exports_desktop_qualifiedBuybox_atf_feature_div",
      "#corePriceDisplay_desktop_feature_div",
      "#rightCol",
    ];

    for (const selector of preferredSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    const fallbackSelectors = ["#title_feature_div", "#titleSection", "#centerCol"];
    for (const selector of fallbackSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    return null;
  }

  function createButtonRoot(camelUrl, asin, source) {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.style.marginTop = "10px";
    root.style.padding = "10px";
    root.style.border = "1px solid #b5d6ea";
    root.style.borderRadius = "10px";
    root.style.background = "linear-gradient(180deg, #f7fbff 0%, #eef7ff 100%)";
    root.style.boxShadow = "0 1px 4px rgba(17, 24, 39, 0.08)";

    const link = document.createElement("a");
    link.id = LINK_ID;
    link.href = camelUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View price history on CamelCamelCamel";
    link.style.display = "inline-block";
    link.style.padding = "8px 12px";
    link.style.border = "1px solid #ad8b00";
    link.style.borderRadius = "8px";
    link.style.background = "#ffd814";
    link.style.color = "#111111";
    link.style.fontWeight = "700";
    link.style.fontSize = "13px";
    link.style.textDecoration = "none";
    link.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.12)";

    const sourceMeta = document.createElement("div");
    sourceMeta.id = SOURCE_ID;
    sourceMeta.style.marginTop = "6px";
    sourceMeta.style.fontSize = "11px";
    sourceMeta.style.color = "#565959";
    sourceMeta.textContent = `ASIN ${asin} (${source})`;

    const amazonPrice = document.createElement("div");
    amazonPrice.id = AMAZON_PRICE_ID;
    amazonPrice.style.marginTop = "8px";
    amazonPrice.style.fontSize = "12px";
    amazonPrice.style.fontWeight = "700";
    amazonPrice.style.color = "#0f5c39";
    amazonPrice.style.background = "#eaf8f0";
    amazonPrice.style.border = "1px solid #a9dbbf";
    amazonPrice.style.borderRadius = "6px";
    amazonPrice.style.padding = "6px 8px";
    amazonPrice.textContent = "Best Amazon: loading...";

    const thirdPartyPrice = document.createElement("div");
    thirdPartyPrice.id = THIRD_PARTY_PRICE_ID;
    thirdPartyPrice.style.marginTop = "6px";
    thirdPartyPrice.style.fontSize = "12px";
    thirdPartyPrice.style.fontWeight = "700";
    thirdPartyPrice.style.color = "#0c4f78";
    thirdPartyPrice.style.background = "#e9f4fb";
    thirdPartyPrice.style.border = "1px solid #a7cee6";
    thirdPartyPrice.style.borderRadius = "6px";
    thirdPartyPrice.style.padding = "6px 8px";
    thirdPartyPrice.textContent = "Best 3rd party new: loading...";

    root.appendChild(link);
    root.appendChild(sourceMeta);
    root.appendChild(amazonPrice);
    root.appendChild(thirdPartyPrice);

    return root;
  }

  function setLowestPriceLabels(prices) {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    const amazonLabel = root.querySelector(`#${AMAZON_PRICE_ID}`);
    const thirdPartyLabel = root.querySelector(`#${THIRD_PARTY_PRICE_ID}`);

    if (amazonLabel) {
      amazonLabel.textContent = `Best Amazon: ${prices.lowestAmazon || "unavailable"}`;
    }

    if (thirdPartyLabel) {
      thirdPartyLabel.textContent = `Best 3rd party new: ${prices.lowestThirdPartyNew || "unavailable"}`;
    }
  }

  function setLowestPriceLoadingState() {
    setLowestPriceLabels({
      lowestAmazon: "loading...",
      lowestThirdPartyNew: "loading...",
    });
  }

  async function resolveAndRenderLowestPrices(camelUrl, requestId) {
    const cacheHit = priceCache.get(camelUrl);
    if (cacheHit) {
      if (requestId === currentPriceRequestId) {
        setLowestPriceLabels(cacheHit);
      }

      return;
    }

    setLowestPriceLoadingState();

    try {
      const html = await fetchCamelPage(camelUrl);
      const parsed = parseLowestPricesFromCamelHtml(html);
      priceCache.set(camelUrl, parsed);

      if (requestId === currentPriceRequestId) {
        setLowestPriceLabels(parsed);
      }
    } catch (error) {
      log("Unable to fetch lowest prices", { camelUrl, error: String(error) });

      if (requestId === currentPriceRequestId) {
        setLowestPriceLabels({
          lowestAmazon: "unavailable",
          lowestThirdPartyNew: "unavailable",
        });
      }
    }
  }

  function upsertButton(camelUrl, asin, source) {
    const target = getInjectionTarget();
    if (!target) {
      log("No injection target found for", window.location.href);
      return false;
    }

    const existingRoot = document.getElementById(ROOT_ID);
    if (existingRoot) {
      const existingLink = existingRoot.querySelector(`#${LINK_ID}`);
      const sourceLabel = existingRoot.querySelector(`#${SOURCE_ID}`);

      if (existingLink) {
        existingLink.href = camelUrl;
      }

      if (sourceLabel) {
        sourceLabel.textContent = `ASIN ${asin} (${source})`;
      }

      if (existingRoot.parentElement !== target) {
        target.prepend(existingRoot);
      }

      return true;
    }

    const newRoot = createButtonRoot(camelUrl, asin, source);
    target.prepend(newRoot);
    return true;
  }

  function removeButton() {
    const existingRoot = document.getElementById(ROOT_ID);
    if (existingRoot) {
      existingRoot.remove();
    }
  }

  function evaluatePage() {
    const requestId = ++currentPriceRequestId;

    const marketplace = getMarketplaceConfig(window.location.hostname);
    if (!marketplace) {
      removeButton();
      log("Unsupported marketplace host", window.location.hostname);
      return;
    }

    const { asin, source } = getAsinAndSource();
    if (!asin) {
      removeButton();
      log("No ASIN found for", window.location.href);
      return;
    }

    const camelUrl = buildCamelUrl(marketplace.camelHost, asin);
    const success = upsertButton(camelUrl, asin, source || "unknown");

    if (success) {
      log("Button ready", { asin, source, camelUrl });
      resolveAndRenderLowestPrices(camelUrl, requestId);
    }
  }

  function scheduleEvaluate() {
    if (evaluateTimer) {
      window.clearTimeout(evaluateTimer);
    }

    evaluateTimer = window.setTimeout(() => {
      evaluateTimer = null;
      evaluatePage();
    }, EVALUATE_DEBOUNCE_MS);
  }

  function wrapHistoryMethod(methodName) {
    const original = window.history[methodName];
    if (typeof original !== "function") {
      return;
    }

    window.history[methodName] = function wrappedHistoryMethod(...args) {
      const result = original.apply(this, args);
      scheduleEvaluate();
      return result;
    };
  }

  function startObservers() {
    if (!observer) {
      observer = new MutationObserver(() => {
        scheduleEvaluate();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
    window.addEventListener("popstate", scheduleEvaluate);
  }

  function init() {
    scheduleEvaluate();
    startObservers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
