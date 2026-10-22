// Single source of truth for the OpenAPI spec. CommonJS so both
// build-site.js (Node, require()) and the Worker (esbuild, import)
// can use it without duplicating content.
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const SwiftCode = {
  type: "object",
  properties: {
    swiftCode: { type: "string", example: "DEUTDE" },
    bankCode: { type: "string", example: "DEUT" },
    countryCode: { type: "string", example: "DE" },
    country: { type: "string", example: "Germany" },
    bank: { type: "string", example: "DEUTSCHE BANK AG" },
  },
  required: ["swiftCode", "bankCode", "countryCode", "country", "bank"],
};

const Institution = {
  type: "object",
  properties: {
    institutionCode: { type: "string", example: "NP11003" },
    nrbCode: { type: "string", example: "11003" },
    name: { type: "string", example: "Nabil Bank Limited" },
    class: { type: "string", enum: ["A", "B", "C", "D"], description: "A=commercial, B=development, C=finance, D=microfinance (Nepal Rastra Bank's classes)" },
    countryCode: { type: "string", example: "NP" },
    codeSystem: { type: "string", example: "NRB" },
    swiftCode: { type: ["string", "null"], example: "NARBNP", description: "Null unless this institution has a hand-verified SWIFT code." },
  },
  required: ["institutionCode", "nrbCode", "name", "class", "countryCode", "codeSystem", "swiftCode"],
};

const Country = {
  type: "object",
  properties: {
    code: { type: "string", example: "NP" },
    name: { type: "string", example: "Nepal" },
    bankCount: { type: "integer", example: 23, description: "Number of SWIFT/BIC codes for this country." },
    hasInstitutionDirectory: { type: "boolean", example: true },
  },
  required: ["code", "name", "bankCount", "hasInstitutionDirectory"],
};

const CombinedBank = {
  type: "object",
  properties: {
    name: { type: "string", example: "Nabil Bank Limited" },
    countryCode: { type: "string", example: "NP" },
    institutionCode: { type: ["string", "null"], example: "NP11003" },
    swiftCode: { type: ["string", "null"], example: "NARBNP" },
    class: { type: ["string", "null"], enum: ["A", "B", "C", "D", null] },
  },
  required: ["name", "countryCode", "institutionCode", "swiftCode", "class"],
  description: "One row per bank. Either code field is null when that bank has no code in that system — never two rows for one bank.",
};

const Meta = {
  type: "object",
  properties: {
    author: { type: "string" },
    dataSource: { type: "string" },
    builtAt: { type: "string", format: "date-time" },
    recordCount: { type: "integer" },
    countryCount: { type: "integer" },
    swiftCodeFormat: { type: "string" },
  },
};

const Pagination = {
  type: "object",
  properties: {
    total: { type: "integer" },
    limit: { type: "integer" },
    offset: { type: "integer" },
    hasMore: { type: "boolean" },
  },
  required: ["total", "limit", "offset", "hasMore"],
};

const Error_ = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string", enum: ["NOT_FOUND", "BAD_REQUEST", "METHOD_NOT_ALLOWED", "RATE_LIMITED"] },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
};

const wrapData = (schemaRef) => ({ type: "object", properties: { data: schemaRef }, required: ["data"] });
const wrapPage = (itemRef) => ({
  type: "object",
  properties: { data: { type: "array", items: itemRef }, pagination: ref("Pagination") },
  required: ["data", "pagination"],
});

const jsonResponse = (schema) => ({ description: "OK", content: { "application/json": { schema } } });
const errorResponse = (description) => ({ description, content: { "application/json": { schema: ref("Error") } } });

// Applies to literally every route: the Worker checks method and rate
// limit before routing at all (see worker/src/index.js's fetch()), so
// every operation below gets these merged in rather than repeating them.
const commonResponses = {
  405: errorResponse("Method not allowed (this API is GET-only)."),
  429: errorResponse("Rate limit exceeded (1,200 requests/60s per IP)."),
};
const withCommon = (responses) => ({ ...responses, ...commonResponses });

const paramCode = { name: "code", in: "path", required: true, schema: { type: "string" }, description: "Case-insensitive; accepts 6, 8, or 11-character codes, normalized to the first 6 characters." };
const paramCountry = { name: "country", in: "query", required: false, schema: { type: "string" }, description: "ISO 3166-1 alpha-2 country code filter." };
const paramQ = { name: "q", in: "query", required: false, schema: { type: "string" }, description: "Substring match, case-insensitive." };
const paramLimit = { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 25 } };
const paramOffset = { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 } };

module.exports = {
  openapi: "3.1.0",
  info: {
    title: "swiftlookup",
    version: "1.0.0",
    description:
      "SWIFT/BIC code to bank name lookup, plus a Nepal-only domestic institution directory (Nepal Rastra Bank codes — a separate identifier system, not SWIFT). Served two ways with identical response shapes: this dynamic API, and a static JSON file mirror (same paths, `.json` appended, no query-string support) for GitHub Pages / Cloudflare Pages.",
    license: { name: "MIT", url: "https://github.com/alphaseneca/swift-lookup/blob/main/LICENSE" },
  },
  servers: [{ url: "/v1" }],
  // Public, unauthenticated by design -- stated explicitly so tooling
  // doesn't flag the absence of a security scheme as an oversight.
  security: [],
  paths: {
    "/": {
      get: {
        summary: "API info",
        operationId: "getApiInfo",
        responses: withCommon({ 200: jsonResponse({ type: "object", properties: { name: { type: "string" }, endpoints: { type: "array", items: { type: "string" } }, meta: ref("Meta") } }) }),
      },
    },
    "/codes/{code}": {
      get: {
        summary: "Resolve a single SWIFT/BIC code",
        operationId: "getCode",
        parameters: [paramCode],
        responses: withCommon({ 200: jsonResponse(wrapData(ref("SwiftCode"))), 404: errorResponse("No SWIFT/BIC code matches.") }),
      },
    },
    "/codes": {
      get: {
        summary: "List or search SWIFT/BIC codes",
        operationId: "listCodes",
        description: "With neither `country` nor `q`, pages through the full 33,593-record dataset.",
        parameters: [paramCountry, paramQ, paramLimit, paramOffset],
        responses: withCommon({ 200: jsonResponse(wrapPage(ref("SwiftCode"))) }),
      },
    },
    "/institutions/{code}": {
      get: {
        summary: "Resolve a single domestic institution code (NRB, Nepal only)",
        operationId: "getInstitution",
        parameters: [paramCode],
        responses: withCommon({ 200: jsonResponse(wrapData(ref("Institution"))), 404: errorResponse("No institution matches.") }),
      },
    },
    "/institutions": {
      get: {
        summary: "List or search domestic institutions",
        operationId: "listInstitutions",
        description: "`country` is an optional filter, not a required resource identifier — an unrecognized country returns an empty page, not 404.",
        parameters: [paramCountry, paramQ, paramLimit, paramOffset],
        responses: withCommon({ 200: jsonResponse(wrapPage(ref("Institution"))) }),
      },
    },
    "/countries": {
      get: {
        summary: "All countries",
        operationId: "listCountries",
        responses: withCommon({ 200: jsonResponse(wrapData({ type: "array", items: ref("Country") })) }),
      },
    },
    "/countries/{code}": {
      get: {
        summary: "Single country info",
        operationId: "getCountry",
        parameters: [{ ...paramCode, description: "ISO 3166-1 alpha-2 country code." }],
        responses: withCommon({ 200: jsonResponse(wrapData(ref("Country"))), 404: errorResponse("Unknown country code.") }),
      },
    },
    "/countries/{code}/banks": {
      get: {
        summary: "Every bank in a country, SWIFT and domestic combined — one row per bank",
        operationId: "listCountryBanks",
        parameters: [{ ...paramCode, description: "ISO 3166-1 alpha-2 country code." }, paramQ, paramLimit, paramOffset],
        responses: withCommon({ 200: jsonResponse(wrapPage(ref("CombinedBank"))), 404: errorResponse("Unknown country code.") }),
      },
    },
    "/dump": {
      get: {
        summary: "Full SWIFT/BIC dataset, unpaginated",
        operationId: "getDump",
        responses: withCommon({ 200: jsonResponse(wrapData({ type: "array", items: ref("SwiftCode") })) }),
      },
    },
    "/meta": {
      get: {
        summary: "Dataset provenance and build info",
        operationId: "getMeta",
        responses: withCommon({ 200: jsonResponse(wrapData(ref("Meta"))) }),
      },
    },
    "/openapi.json": {
      get: {
        summary: "This OpenAPI 3.1 document",
        operationId: "getOpenApiSpec",
        description: "Unwrapped, unlike every other response here — the raw spec document, so standard tooling (Swagger UI, Postman, codegen) can consume it directly.",
        responses: withCommon({ 200: { description: "OK", content: { "application/json": { schema: { type: "object" } } } } }),
      },
    },
  },
  components: {
    schemas: { SwiftCode, Institution, Country, CombinedBank, Meta, Pagination, Error: Error_ },
  },
};
