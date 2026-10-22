import records from "../../data/swift-codes.json";
import institutionsNp from "../../data/institutions-np.json";
import meta from "../../data/meta.json";
import openApiSpec from "./openapi.js";
import { renderLanding } from "./landing.js";

// ---------- domain model ----------
//
// A real bank is an Institution. It's identified by zero or more Codes,
// each issued by one Code System. Exactly two code systems exist today:
//   - SWIFT: global, issued by the ISO 9362 Registration Authority.
//     Every country has SWIFT coverage, but only for banks that do their
//     own cross-border correspondent banking.
//   - NRB: national, issued by Nepal Rastra Bank (the central bank).
//     Nepal-only, but covers every licensed domestic institution,
//     including ones with no SWIFT presence at all.
// A future country's own regulator is the same shape as NRB: national,
// not a new concept. "SWIFT record" and "NRB record" are not two
// unrelated resources, they're two possible labels on the one real
// entity, which is why the API has a single Institution resource with a
// `codes` map instead of parallel SWIFT-shaped and NRB-shaped endpoints.
//
// What's actually generic when adding a system vs. what isn't:
// - CODE_SYSTEMS_META, codeSystemIndexes, and lookupInstitution()'s
//   dispatch loop are generic -- adding a system means adding one entry
//   to CODE_SYSTEMS_META and one matcher to CODE_SYSTEM_MATCHERS below
//   (its code format, e.g. exact vs. truncate-to-6-chars, which is
//   inherently system-specific), never editing the loop itself.
// - Merging a new country's source data into `institutions` (the
//   fromNrb/fromSwiftOnly block below) is NOT generic and can't be:
//   every regulator publishes differently, so each one needs its own
//   merge code, the same way fromNrb is specific to NRB's shape.

const CODE_SYSTEMS_META = [
  { code: "SWIFT", name: "SWIFT/BIC", issuer: "ISO 9362 Registration Authority (iso9362.org)", scope: "global" },
  { code: "NRB", name: "Nepal Rastra Bank institution code", issuer: "Nepal Rastra Bank", scope: "NP" },
];

// NRB institutions whose SWIFT_CROSSWALK (build-np-institutions.py) set a
// swiftCode already own that SWIFT record -- it becomes one Institution
// with both codes, not two. Everything else in swift-codes.json is its
// own standalone Institution with just a SWIFT code.
const claimedSwiftCodes = new Set(institutionsNp.map((i) => i.swiftCode).filter(Boolean));

const fromNrb = institutionsNp.map((i) => ({
  name: i.name,
  countryCode: i.countryCode,
  codes: i.swiftCode ? { NRB: i.institutionCode, SWIFT: i.swiftCode } : { NRB: i.institutionCode },
  attributes: { NRB: { class: i.class } },
}));

const fromSwiftOnly = records
  .filter((r) => !claimedSwiftCodes.has(r.swiftCode))
  .map((r) => ({
    name: r.bank,
    countryCode: r.countryCode,
    codes: { SWIFT: r.swiftCode },
  }));

const institutions = [...fromNrb, ...fromSwiftOnly].sort(
  (a, b) => a.countryCode.localeCompare(b.countryCode) || a.name.localeCompare(b.name)
);

// ---------- indexes ----------

// One index per code system, keyed by that system's own code string.
// Built generically from CODE_SYSTEMS_META and each institution's codes
// map -- adding a country's regulator means one more entry in
// CODE_SYSTEMS_META and one more matcher below, never touching this loop.
const codeSystemIndexes = {};
for (const cs of CODE_SYSTEMS_META) codeSystemIndexes[cs.code] = new Map();

const byCountry = new Map();
const countryNames = new Map();
for (const r of records) countryNames.set(r.countryCode, r.country);

for (const inst of institutions) {
  for (const [system, code] of Object.entries(inst.codes)) codeSystemIndexes[system].set(code, inst);
  if (!byCountry.has(inst.countryCode)) byCountry.set(inst.countryCode, []);
  byCountry.get(inst.countryCode).push(inst);
}

// Each code system's own code format, in lookup order. The format rule
// is necessarily system-specific (NRB codes are exact; SWIFT codes are
// 6, 8, or 11 characters and always key on the first 6) -- that part
// can't be generic, different registries format codes differently. But
// adding a system means adding one entry here; lookupInstitution()
// below never changes.
const CODE_SYSTEM_MATCHERS = [
  { code: "NRB", match: (normalized) => codeSystemIndexes.NRB.get(normalized) || null },
  {
    code: "SWIFT",
    match: (normalized) => (normalized.length >= 6 ? codeSystemIndexes.SWIFT.get(normalized.slice(0, 6)) || null : null),
  },
];

const codeSystemCounts = {};
for (const inst of institutions) {
  for (const system of Object.keys(inst.codes)) codeSystemCounts[system] = (codeSystemCounts[system] || 0) + 1;
}
const codeSystemsList = CODE_SYSTEMS_META.map((cs) => ({ ...cs, recordCount: codeSystemCounts[cs.code] || 0 }));

const countryList = [...byCountry.entries()]
  .map(([code, insts]) => {
    const systems = new Set();
    for (const inst of insts) for (const s of Object.keys(inst.codes)) systems.add(s);
    return {
      code,
      name: countryNames.get(code) || code,
      institutionCount: insts.length,
      codeSystems: [...systems].sort(),
    };
  })
  .sort((a, b) => a.code.localeCompare(b.code));
const countryByCode = new Map(countryList.map((c) => [c.code, c]));

const META = {
  ...meta,
  recordCount: records.length,
  countryCount: countryList.length,
  institutionCount: institutions.length,
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

// Dispatches by format, not by asking the caller which system a code
// belongs to: NRB codes are "<countryCode><digits>" (currently always
// 7 chars, e.g. NP11003); SWIFT codes normalize to a 6-char prefix. The
// two formats can't collide (digits vs. letters, different lengths), so
// trying NRB first and falling back to SWIFT is unambiguous.
function lookupInstitution(code) {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  for (const { match } of CODE_SYSTEM_MATCHERS) {
    const result = match(normalized);
    if (result) return result;
  }
  return null;
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

// country is a filter on the collection, not a resource path segment:
// an unrecognized country is just a filter that matches nothing (200,
// empty page), not a 404. 404 is reserved for /v1/countries/:code,
// where the country IS the resource.
function queryInstitutions(url) {
  const country = (url.searchParams.get("country") || "").trim().toUpperCase();
  const q = (url.searchParams.get("q") || "").trim().toUpperCase();
  const { limit, offset } = parsePagination(url);

  let pool = country ? byCountry.get(country) || [] : institutions;
  if (q) {
    pool = pool.filter(
      (inst) => inst.name.toUpperCase().includes(q) || Object.values(inst.codes).some((c) => c.includes(q))
    );
  }

  return paginated(pool.slice(offset, offset + limit), { limit, offset, total: pool.length });
}

// ---------- routing ----------
// Everything lives under /v1. `parts` below always has "v1" stripped.

function routeV1(url, parts) {
  if (parts.length === 0) {
    return ok({
      name: "swiftlookup",
      endpoints: [
        "GET /v1/institutions/:code             -> resolve any code, any system",
        "GET /v1/institutions?country=&q=&limit=&offset= -> list/search institutions",
        "GET /v1/code-systems                    -> what code systems exist and cover what",
        "GET /v1/countries                       -> all countries",
        "GET /v1/countries/:code                 -> single country info",
        "GET /v1/dump                            -> every institution, unpaginated",
        "GET /v1/meta                             -> dataset info",
        "GET /v1/openapi.json                    -> OpenAPI 3.1 spec",
      ],
      meta: META,
    });
  }

  if (parts[0] === "meta" && parts.length === 1) return ok(META);
  if (parts[0] === "dump" && parts.length === 1) return ok(institutions);
  // Unwrapped, unlike every other route: standard OpenAPI tooling
  // (Swagger UI, Postman, codegen) expects the spec document itself at
  // the root, not nested under { data }.
  if (parts[0] === "openapi.json" && parts.length === 1) return send(openApiSpec, 200);

  if (parts[0] === "code-systems" && parts.length === 1) return ok(codeSystemsList);

  if (parts[0] === "institutions") {
    if (parts.length === 1) return queryInstitutions(url);
    if (parts.length === 2) {
      const result = lookupInstitution(parts[1]);
      if (!result) return fail("NOT_FOUND", `no institution found for code "${parts[1]}"`, 404);
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
          "Access-Control-Max-Age": "86400",
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
