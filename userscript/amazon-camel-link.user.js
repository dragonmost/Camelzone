// ==UserScript==
// @name         Amazon CamelCamelCamel Link
// @namespace    https://github.com/Baker/cameltools
// @version      0.2.0
// @description  Adds a CamelCamelCamel button on Amazon product pages.
// @author       Baker
// @match        https://www.amazon.ca/*
// @match        https://amazon.ca/*
// @match        https://www.amazon.com/*
// @match        https://amazon.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const DEBUG = true;
  const ROOT_ID = "ccc-link-root";
  const LINK_ID = "ccc-link-anchor";
  const SOURCE_ID = "ccc-link-source";
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

  function log(...args) {
    if (!DEBUG) {
      return;
    }

    console.log("[CamelTools]", ...args);
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

    const sourceMeta = document.createElement("div");
    sourceMeta.id = SOURCE_ID;
    sourceMeta.style.marginTop = "4px";
    sourceMeta.style.fontSize = "11px";
    sourceMeta.style.color = "#565959";
    sourceMeta.textContent = `ASIN ${asin} (${source})`;

    root.appendChild(link);
    root.appendChild(sourceMeta);

    return root;
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
