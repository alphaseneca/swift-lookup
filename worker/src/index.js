import records from "../../data/swift-codes.json";
import { renderLanding } from "./landing.js";

const byCode = new Map();
for (const r of records) byCode.set(r.swiftCode, r);

const byCountry = new Map();
for (const r of records) {
  if (!byCountry.has(r.countryCode)) byCountry.set(r.countryCode, []);
  byCountry.get(r.countryCode).push(r);
}

const countryIndex = [...byCountry.entries()]
  .map(([code, banks]) => ({ code, name: banks[0].country, bankCount: banks.length }))
  .sort((a, b) => a.code.localeCompare(b.code));

const META = {
  author: "alphaseneca",
  dataSource: "ISO 9362 Registration Authority (iso9362.org), via lobax/banknames (MIT)",
  recordCount: records.length,
  countryCount: countryIndex.length,
  swiftCodeFormat: "bankCode(4) + countryCode(2): first 6 chars of any SWIFT/BIC code",
};

const RATE_LIMIT = { limit: 1200, periodSeconds: 60 };

function lookup(code) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  if (normalized.length < 6) return null;
  return byCode.get(normalized.slice(0, 6)) || null;
}

function search(q, limit) {
  const needle = q.trim().toUpperCase();
  const out = [];
  for (const r of records) {
    if (
      r.swiftCode.includes(needle) ||
      r.bank.toUpperCase().includes(needle) ||
      r.countryCode === needle ||
      r.country.toUpperCase().includes(needle)
    ) {
      out.push(r);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      ...extraHeaders,
    },
  });
}

function html(body) {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

// API lives under /v1; everything below assumes `parts` has "v1" stripped.
function routeV1(url, parts) {
  if (parts.length === 0) {
    return json({
      name: "swiftlookup",
      endpoints: [
        "GET /v1/:code             -> { swiftCode, bankCode, countryCode, country, bank }",
        "GET /v1/country/:code     -> banks in that country (ISO 3166-1 alpha-2)",
        "GET /v1/countries         -> [{ code, name, bankCount }]",
        "GET /v1/search?q=&limit=  -> match on code, bank name, or country",
        "GET /v1/dump              -> full record array",
        "GET /v1/meta              -> dataset info",
      ],
      meta: META,
    });
  }

  // Reserved paths checked first; anything else here is a code lookup.
  if (parts.length === 1) {
    if (parts[0] === "meta") return json(META);
    if (parts[0] === "dump") return json(records);
    if (parts[0] === "countries") return json(countryIndex);
    if (parts[0] === "search") {
      const q = url.searchParams.get("q") || "";
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "25", 10) || 25, 200);
      if (!q) return json({ error: "missing ?q=" }, 400);
      return json(search(q, limit));
    }
  }

  if (parts[0] === "country" && parts.length === 2) {
    const code = parts[1].trim().toUpperCase();
    const banks = byCountry.get(code);
    if (!banks) return json({ error: "unknown country code", code }, 404);
    return json(banks);
  }

  if (parts.length === 1) {
    const result = lookup(parts[0]);
    if (!result) return json({ error: "unknown swift code", code: parts[0] }, 404);
    return json(result);
  }

  return json({ error: "not found" }, 404);
}

function route(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length === 0) return html(renderLanding(META));
  if (parts[0] === "v1") return routeV1(url, parts.slice(1));
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return json(
          { error: "rate limit exceeded", limit: RATE_LIMIT.limit, periodSeconds: RATE_LIMIT.periodSeconds },
          429,
          { "Retry-After": String(RATE_LIMIT.periodSeconds) }
        );
      }
    }

    return route(request);
  },
};
