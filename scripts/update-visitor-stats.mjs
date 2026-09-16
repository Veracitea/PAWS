import { writeFile } from "node:fs/promises";

const siteCode = process.env.GOATCOUNTER_SITE_CODE;
const apiToken = process.env.GOATCOUNTER_API_TOKEN;

if (!siteCode || !apiToken) {
  throw new Error("GOATCOUNTER_SITE_CODE and GOATCOUNTER_API_TOKEN are required.");
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

async function getJson(path, params = {}) {
  const url = new URL(`${endpoint}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GoatCounter request failed (${response.status}) for ${path}.`);
  return response.json();
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
