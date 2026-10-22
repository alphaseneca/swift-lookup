// Single source of truth for the OpenAPI spec. CommonJS so both
// build-site.js (Node, require()) and the Worker (esbuild, import)
// can use it without duplicating content.
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const Institution = {
  type: "object",
  description:
    "A real bank or financial institution. `codes` has one entry per code system it's registered in -- most institutions have exactly one.",
  properties: {
    name: { type: "string", example: "Nabil Bank Limited" },
    countryCode: { type: "string", example: "NP", description: "ISO 3166-1 alpha-2." },
    codes: {
      type: "object",
      description: "Known code-system codes, by code system. Absent key = no code in that system.",
      properties: { SWIFT: { type: "string", example: "NARBNP" }, NRB: { type: "string", example: "NP11003" } },
      additionalProperties: { type: "string" },
    },
    attributes: {
      type: "object",
      description: "System-specific detail that doesn't apply across systems. Present only when a system contributed some.",
      properties: {
        NRB: {
          type: "object",
          properties: { class: { type: "string", enum: ["A", "B", "C", "D"], description: "A=commercial, B=development, C=finance, D=microfinance." } },
        },
      },
      additionalProperties: true,
    },
  },
  required: ["name", "countryCode", "codes"],
};

const CodeSystem = {
  type: "object",
  properties: {
    code: { type: "string", example: "SWIFT" },
    name: { type: "string", example: "SWIFT/BIC" },
    issuer: { type: "string", example: "ISO 9362 Registration Authority (iso9362.org)" },
    scope: { type: "string", example: "global", description: "\"global\", or an ISO 3166-1 alpha-2 country code for a national system." },
    recordCount: { type: "integer" },
  },
  required: ["code", "name", "issuer", "scope", "recordCount"],
};

const Country = {
  type: "object",
  properties: {
    code: { type: "string", example: "NP" },
    name: { type: "string", example: "Nepal" },
    institutionCount: { type: "integer", example: 126 },
    codeSystems: { type: "array", items: { type: "string" }, example: ["NRB", "SWIFT"], description: "Which code systems have at least one institution here." },
  },
  required: ["code", "name", "institutionCount", "codeSystems"],
};

const Meta = {
  type: "object",
  properties: {
    author: { type: "string" },
    dataSource: { type: "string" },
    builtAt: { type: "string", format: "date-time" },
    recordCount: { type: "integer", description: "Raw SWIFT/BIC source records." },
    countryCount: { type: "integer" },
    institutionCount: { type: "integer", description: "Canonical institutions after merging SWIFT and national codes for the same bank." },
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

const paramCode = {
  name: "code",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Any code in any known code system -- a SWIFT/BIC code (6, 8, or 11 characters) or an NRB institution code. Dispatched by format, not by asking which system it's from.",
};
const paramCountry = { name: "country", in: "query", required: false, schema: { type: "string" }, description: "ISO 3166-1 alpha-2 country code filter." };
const paramQ = { name: "q", in: "query", required: false, schema: { type: "string" }, description: "Substring match on name or any code, case-insensitive." };
const paramLimit = { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 25 } };
const paramOffset = { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 } };

module.exports = {
  openapi: "3.1.0",
  info: {
    title: "swiftlookup",
    version: "2.0.0",
    description:
      "Look up a bank or financial institution by any code it holds, in any code system. Two code systems exist today: SWIFT/BIC (global, issued by the ISO 9362 Registration Authority) and NRB (Nepal only, issued by Nepal Rastra Bank, covering domestic institutions SWIFT doesn't reach). Served two ways with byte-identical response shapes: this dynamic API, and a static JSON file mirror (same paths, `.json` appended, no query-string support) for GitHub Pages / Cloudflare Pages.",
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
    "/institutions/{code}": {
      get: {
        summary: "Resolve any code, in any code system, to its institution",
        operationId: "getInstitution",
        parameters: [paramCode],
        responses: withCommon({ 200: jsonResponse(wrapData(ref("Institution"))), 404: errorResponse("No institution matches.") }),
      },
    },
    "/institutions": {
      get: {
        summary: "List or search institutions",
        operationId: "listInstitutions",
        description: "With neither `country` nor `q`, pages through all 33,676 institutions.",
        parameters: [paramCountry, paramQ, paramLimit, paramOffset],
        responses: withCommon({ 200: jsonResponse(wrapPage(ref("Institution"))) }),
      },
    },
    "/code-systems": {
      get: {
        summary: "What code systems exist and what each one covers",
        operationId: "listCodeSystems",
        responses: withCommon({ 200: jsonResponse(wrapData({ type: "array", items: ref("CodeSystem") })) }),
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
    "/dump": {
      get: {
        summary: "Every institution, unpaginated",
        operationId: "getDump",
        responses: withCommon({ 200: jsonResponse(wrapData({ type: "array", items: ref("Institution") })) }),
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
    schemas: { Institution, CodeSystem, Country, Meta, Pagination, Error: Error_ },
  },
};
