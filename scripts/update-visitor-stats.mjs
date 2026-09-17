import { writeFile } from "node:fs/promises";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Give each address more time before falling back to another address family.
// A slow IPv4 connection followed by unavailable IPv6 can otherwise fail early.
setDefaultAutoSelectFamilyAttemptTimeout(5_000);

const siteCode = process.env.GOATCOUNTER_SITE_CODE?.trim();
const apiToken = process.env.GOATCOUNTER_API_TOKEN?.trim();

if (!siteCode || !apiToken) {
  throw new Error("GOATCOUNTER_SITE_CODE and GOATCOUNTER_API_TOKEN are required.");
}

if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(siteCode) || siteCode.length > 63) {
  throw new Error("GOATCOUNTER_SITE_CODE must be a subdomain code such as tiviatis, not a full URL.");
}
if (/^Bearer\s/i.test(apiToken)) {
  throw new Error("GOATCOUNTER_API_TOKEN must contain only the token, without a Bearer prefix.");
}

const endpoint = `https://${siteCode}.goatcounter.com/api/v0`;
const headers = {
  Authorization: `Bearer ${apiToken}`,
  "Content-Type": "application/json",
};

const roundToHour = (date) => {
  const rounded = new Date(date);
  rounded.setUTCMinutes(0, 0, 0);
  return rounded.toISOString();
};

const now = new Date();
const end = roundToHour(now);
const allTimeStart = "2000-01-01T00:00:00.000Z";
const recentStart = roundToHour(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

async function getJsonOnce(path, params = {}) {
  const url = new URL(`${endpoint}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    const code = String(error.cause?.code ?? error.name ?? "network error");
    const safeCode = /^[a-z0-9_ -]{1,80}$/i.test(code) ? code : "network error";
    const failure = new Error(`GoatCounter network request failed for ${path} (${safeCode}). Check the runner's connection to GoatCounter.`);
    failure.retryable = new Set([
      "ETIMEDOUT", "ENETUNREACH", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED",
      "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "TimeoutError",
    ]).has(code);
    throw failure;
  }
  if (!response.ok) {
    const hints = {
      400: "GoatCounter rejected the request parameters.",
      401: "Check GOATCOUNTER_API_TOKEN: the token is missing, invalid, or revoked.",
      403: "Check that the API token can read statistics for the configured GoatCounter site.",
      404: "Check GOATCOUNTER_SITE_CODE and the API endpoint.",
      429: "The API rate limit was reached; retry the workflow later.",
    };
    let detail = "";
    try {
      const body = await response.json();
      const message = body.error ?? body.errors ?? body.Error;
      if (message != null) {
        const serialized = typeof message === "string" ? message : JSON.stringify(message);
        // Redact before truncating so even an echoed credential is never printed.
        const safeMessage = serialized.split(apiToken).join("[redacted]")
          .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 800);
        detail = ` API detail: ${safeMessage}`;
      }
    } catch {
      // HTML error pages and unreadable responses do not belong in CI logs.
    }
    const failure = new Error(`GoatCounter request failed (HTTP ${response.status}) for ${path}. ${hints[response.status] ?? "Check GoatCounter service availability."}${detail}`);
    failure.retryable = [429, 500, 502, 503, 504].includes(response.status);
    throw failure;
  }
  try {
    return await response.json();
  } catch (error) {
    const failure = new Error(error instanceof SyntaxError
      ? `GoatCounter returned invalid JSON for ${path}.`
      : `GoatCounter response could not be read for ${path}.`);
    failure.retryable = !(error instanceof SyntaxError);
    throw failure;
  }
}

async function getJson(path, params = {}) {
  const maximumAttempts = 3;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await getJsonOnce(path, params);
    } catch (error) {
      if (!error.retryable || attempt === maximumAttempts) throw error;
      const waitMs = 2_000 * 2 ** (attempt - 1);
      console.warn(`${error.message} Retrying in ${waitMs / 1_000}s (${attempt + 1}/${maximumAttempts}).`);
      await delay(waitMs);
    }
  }
}

async function getLocations() {
  const locations = [];
  let offset = 0;
  let more = true;
  while (more) {
    const page = await getJson("/stats/locations", {
      start: allTimeStart,
      end,
      limit: 100,
      offset,
    });
    locations.push(...(page.stats ?? []));
    more = Boolean(page.more);
    offset += page.stats?.length ?? 0;
    if (more && !page.stats?.length) throw new Error("GoatCounter locations pagination did not advance.");
  }
  return locations;
}

const [allTime, recent, rawLocations] = await Promise.all([
  getJson("/stats/total", { start: allTimeStart, end }),
  getJson("/stats/total", { start: recentStart, end }),
  getLocations(),
]);

const minimumPublicCount = 5;
const visibleLocations = rawLocations
  .filter((location) => Number(location.count) >= minimumPublicCount)
  .map((location) => ({
    code: String(location.id ?? "").toUpperCase(),
    name: String(location.name ?? "Unknown"),
    visitors: Number(location.count) || 0,
  }));

const groupedVisitors = rawLocations
  .filter((location) => Number(location.count) < minimumPublicCount)
  .reduce((sum, location) => sum + (Number(location.count) || 0), 0);

if (groupedVisitors) {
  visibleLocations.push({ code: "OTHER", name: "Other locations", visitors: groupedVisitors });
}

visibleLocations.sort((left, right) => right.visitors - left.visitors);

const publicSummary = {
  configured: true,
  updatedAt: new Date().toISOString(),
  totalVisitors: Number(allTime.total) || 0,
  last30Days: Number(recent.total) || 0,
  countryCount: rawLocations.length,
  privacyThreshold: minimumPublicCount,
  countries: visibleLocations,
};

await writeFile("data/visitor-stats.json", `${JSON.stringify(publicSummary, null, 2)}\n`, "utf8");
