import records from "../../data/swift-codes.json";
import institutionsNp from "../../data/institutions-np.json";
import meta from "../../data/meta.json";
import { renderLanding } from "./landing.js";

const byCode = new Map();
for (const r of records) byCode.set(r.swiftCode, r);

const byCountry = new Map();
for (const r of records) {
  if (!byCountry.has(r.countryCode)) byCountry.set(r.countryCode, []);
  byCountry.get(r.countryCode).push(r);
}

// Country-specific domestic institution directories (NRB codes for
// Nepal, not SWIFT/BIC). Keyed by countryCode so adding another country
// later is a map entry, not a new code path.
const institutionsByCountry = new Map([["NP", institutionsNp]]);
const institutionByCode = new Map(institutionsNp.map((i) => [i.institutionCode, i]));

// Union of both sources: a country can have an institution directory
// with zero SWIFT codes (not true for Nepal today, but must not 404 on
// /v1/countries/:code or /v1/countries/:code/banks when it happens).
const allCountryCodes = new Set([...byCountry.keys(), ...institutionsByCountry.keys()]);
const countryList = [...allCountryCodes]
  .map((code) => {
    const banks = byCountry.get(code) || [];
    return {
      code,
      name: banks[0]?.country ?? code,
      bankCount: banks.length,
      hasInstitutionDirectory: institutionsByCountry.has(code),
    };
  })
  .sort((a, b) => a.code.localeCompare(b.code));
const countryByCode = new Map(countryList.map((c) => [c.code, c]));

// Spread data/meta.json rather than hand-duplicating its fields, so this
// can't silently drift from what merge.py actually produces (it did:
// builtAt was missing here until this fix).
const META = { ...meta, recordCount: records.length, countryCount: countryList.length };

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
  return send({ error: { code, message } }, status, { "Cache-Control": "no-store", ...extraHeaders });
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

// parseInt(...) || DEFAULT would silently turn an explicit ?limit=0 into
// 25, since 0 is falsy -- check for NaN specifically instead, so only a
// missing/unparseable value falls back to the default.
function parsePagination(url) {
  const rawLimit = parseInt(url.searchParams.get("limit"), 10);
  const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, 1), MAX_LIMIT);
  const rawOffset = parseInt(url.searchParams.get("offset"), 10);
  const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);
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

// Domestic institution directories (NRB for Nepal). ?country= narrows to
// one country's directory; without it, searches across all of them
// (currently just NP, but this stays correct as more are added).
function queryInstitutions(url) {
  const country = (url.searchParams.get("country") || "").trim().toUpperCase();
  const q = (url.searchParams.get("q") || "").trim().toUpperCase();
  const { limit, offset } = parsePagination(url);

  // country is a filter on a collection, not a resource path segment --
  // matches queryCodes's behavior: an unknown/empty country is just a
  // filter that matches nothing (200, empty page), not a 404. 404 is
  // reserved for /v1/countries/:code, where the country IS the resource.
  let pool;
  if (country) pool = institutionsByCountry.get(country) || [];
  else pool = [...institutionsByCountry.values()].flat();

  let matches = pool;
  if (q) {
    matches = matches.filter(
      (i) => i.institutionCode.includes(q) || i.name.toUpperCase().includes(q)
    );
  }

  return paginated(matches.slice(offset, offset + limit), { limit, offset, total: matches.length });
}

// Every bank in a country, one row each, whether it has a SWIFT code, a
// domestic (e.g. NRB) code, or both -- institutions carry their own
// swiftCode when a hand-verified crosswalk set one (see
// build-np-institutions.py), so this just has to avoid listing that same
// SWIFT record a second time. Anything left in the SWIFT data with no
// institution claiming it (e.g. a bank absent from the domestic
// regulator's current list) still shows up, institutionCode: null.
function unifiedBanks(country) {
  const domestic = institutionsByCountry.get(country) || [];
  const claimedSwiftCodes = new Set(domestic.map((i) => i.swiftCode).filter(Boolean));

  const fromInstitutions = domestic.map((i) => ({
    name: i.name,
    countryCode: i.countryCode,
    institutionCode: i.institutionCode,
    swiftCode: i.swiftCode || null,
    class: i.class,
  }));

  const orphanSwift = (byCountry.get(country) || [])
    .filter((r) => !claimedSwiftCodes.has(r.swiftCode))
    .map((r) => ({
      name: r.bank,
      countryCode: r.countryCode,
      institutionCode: null,
      swiftCode: r.swiftCode,
      class: null,
    }));

  return [...fromInstitutions, ...orphanSwift];
}

function queryCountryBanks(url, countryParam) {
  const country = countryParam.trim().toUpperCase();
  if (!countryByCode.has(country)) {
    return fail("NOT_FOUND", `no country found for code "${country}"`, 404);
  }
  const q = (url.searchParams.get("q") || "").trim().toUpperCase();
  let matches = unifiedBanks(country);
  if (q) {
    matches = matches.filter(
      (b) =>
        b.name.toUpperCase().includes(q) ||
        (b.swiftCode && b.swiftCode.includes(q)) ||
        (b.institutionCode && b.institutionCode.includes(q))
    );
  }
  const { limit, offset } = parsePagination(url);
  return paginated(matches.slice(offset, offset + limit), { limit, offset, total: matches.length });
}

// ---------- routing ----------
// Everything lives under /v1. `parts` below always has "v1" stripped.

function routeV1(url, parts) {
  if (parts.length === 0) {
    return ok({
      name: "swiftlookup",
      endpoints: [
        "GET /v1/countries/:code/banks?q=   -> every bank in a country, SWIFT + domestic combined",
        "GET /v1/codes/:code                -> single SWIFT/BIC code lookup",
        "GET /v1/codes?country=&q=&limit=&offset= -> list/search SWIFT/BIC codes only",
        "GET /v1/institutions/:code         -> single domestic institution lookup (NRB, Nepal only)",
        "GET /v1/institutions?country=&q=&limit=&offset= -> list/search domestic institutions only",
        "GET /v1/countries                  -> all countries",
        "GET /v1/countries/:code            -> single country info",
        "GET /v1/dump                       -> full SWIFT/BIC dataset, unpaginated",
        "GET /v1/meta                       -> dataset info",
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
    if (parts.length === 3 && parts[2] === "banks") {
      return queryCountryBanks(url, parts[1]);
    }
  }

  if (parts[0] === "institutions") {
    if (parts.length === 1) return queryInstitutions(url);
    if (parts.length === 2) {
      const result = institutionByCode.get(parts[1].trim().toUpperCase());
      if (!result) return fail("NOT_FOUND", `no institution found for code "${parts[1]}"`, 404);
      return ok(result);
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
          "Access-Control-Max-Age": "86400", // lets the browser skip repeat preflights for a day
        },
      });
    }
    if (request.method !== "GET") {
      return fail("METHOD_NOT_ALLOWED", `${request.method} is not supported`, 405, { Allow: "GET, OPTIONS" });
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
