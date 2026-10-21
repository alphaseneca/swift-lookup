import records from "../../data/swift-codes.json";
import { renderLanding } from "./landing.js";

const byCode = new Map();
for (const r of records) byCode.set(r.swiftCode, r);

const byCountry = new Map();
for (const r of records) {
  if (!byCountry.has(r.countryCode)) byCountry.set(r.countryCode, []);
  byCountry.get(r.countryCode).push(r);
}

const countryList = [...byCountry.entries()]
  .map(([code, banks]) => ({ code, name: banks[0].country, bankCount: banks.length }))
  .sort((a, b) => a.code.localeCompare(b.code));
const countryByCode = new Map(countryList.map((c) => [c.code, c]));

const META = {
  author: "alphaseneca",
  dataSource: "ISO 9362 Registration Authority (iso9362.org), via lobax/banknames (MIT)",
  recordCount: records.length,
  countryCount: countryList.length,
  swiftCodeFormat: "bankCode(4) + countryCode(2): first 6 chars of any SWIFT/BIC code",
};

const RATE_LIMIT = { limit: 1200, periodSeconds: 60 };
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 25;

// ---------- response helpers ----------

function ok(data, status = 200, extraHeaders = {}) {
  return send({ data }, status, extraHeaders);
}

function paginated(data, { limit, offset, total }, extraHeaders = {}) {
  return send(
    { data, pagination: { total, limit, offset, hasMore: offset + data.length < total } },
    200,
    extraHeaders
  );
}

function fail(code, message, status, extraHeaders = {}) {
  return send({ error: { code, message } }, status, extraHeaders);
}

function send(body, status, extraHeaders = {}) {
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

// ---------- data access ----------

function lookupCode(code) {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  if (normalized.length < 6) return null;
  return byCode.get(normalized.slice(0, 6)) || null;
}

function parsePagination(url) {
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
  return { limit, offset };
}

// Filters by ?country= and/or ?q=, then paginates. With neither param, this
// just pages through the full sorted dataset.
function queryCodes(url) {
  const country = (url.searchParams.get("country") || "").trim().toUpperCase();
  const q = (url.searchParams.get("q") || "").trim().toUpperCase();
  const { limit, offset } = parsePagination(url);

  let matches = records;
  if (country) matches = byCountry.get(country) || [];
  if (q) {
    matches = matches.filter(
      (r) =>
        r.swiftCode.includes(q) ||
        r.bank.toUpperCase().includes(q) ||
        r.country.toUpperCase().includes(q)
    );
  }

  const page = matches.slice(offset, offset + limit);
  return paginated(page, { limit, offset, total: matches.length });
}

// ---------- routing ----------
// Everything lives under /v1. `parts` below always has "v1" stripped.

function routeV1(url, parts) {
  if (parts.length === 0) {
    return ok({
      name: "swiftlookup",
      endpoints: [
        "GET /v1/codes/:code         -> single code lookup",
        "GET /v1/codes?country=&q=&limit=&offset= -> list/search codes",
        "GET /v1/countries           -> all countries",
        "GET /v1/countries/:code     -> single country info",
        "GET /v1/dump                -> full dataset, unpaginated",
        "GET /v1/meta                -> dataset info",
      ],
      meta: META,
    });
  }

  if (parts[0] === "meta" && parts.length === 1) return ok(META);
  if (parts[0] === "dump" && parts.length === 1) return ok(records);

  if (parts[0] === "codes") {
    if (parts.length === 1) return queryCodes(url);
    if (parts.length === 2) {
      const result = lookupCode(parts[1]);
      if (!result) return fail("NOT_FOUND", `no bank found for code "${parts[1]}"`, 404);
      return ok(result);
    }
  }

  if (parts[0] === "countries") {
    if (parts.length === 1) return ok(countryList);
    if (parts.length === 2) {
      const country = countryByCode.get(parts[1].trim().toUpperCase());
      if (!country) return fail("NOT_FOUND", `no country found for code "${parts[1]}"`, 404);
      return ok(country);
    }
  }

  return fail("NOT_FOUND", `no route for "/${parts.join("/")}"`, 404);
}

function route(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length === 0) return html(renderLanding(META));
  if (parts[0] === "v1") return routeV1(url, parts.slice(1));
  return fail("NOT_FOUND", `no route for "/${parts.join("/")}"`, 404);
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
    if (request.method !== "GET") {
      return fail("METHOD_NOT_ALLOWED", `${request.method} is not supported`, 405);
    }

    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return fail(
          "RATE_LIMITED",
          `rate limit exceeded: ${RATE_LIMIT.limit} requests per ${RATE_LIMIT.periodSeconds}s`,
          429,
          { "Retry-After": String(RATE_LIMIT.periodSeconds) }
        );
      }
    }

    return route(request);
  },
};
