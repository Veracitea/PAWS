const infoConfig = window.PAWS_CONFIG ?? {};
const numberFormat = new Intl.NumberFormat("en");

function activateConfiguredAnalytics() {
  const code = infoConfig.analytics?.goatCounterCode;
  if (!code) return;
  const script = document.createElement("script");
  script.async = true;
  script.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  script.src = "https://gc.zgo.at/count.js";
  document.head.append(script);
}

function renderCountryList(countries) {
  const list = document.querySelector("#country-list");
  const region = document.querySelector("#region-field");
  if (!countries.length) return;
  const maximum = Math.max(...countries.map((country) => country.visitors), 1);
  list.innerHTML = countries.slice(0, 8).map((country, index) => `
    <div class="country-row">
      <span class="country-rank">${String(index + 1).padStart(2, "0")}</span>
      <div><strong>${country.name}</strong><span class="country-bar"><i style="width:${(country.visitors / maximum) * 100}%"></i></span></div>
      <b>${numberFormat.format(country.visitors)}</b>
    </div>
  `).join("");
  region.innerHTML = `<div class="region-cloud">${countries.slice(0, 12).map((country, index) => `
    <span style="--weight:${Math.max(.72, country.visitors / maximum)};--delay:${index}">${country.code ?? country.name.slice(0, 3).toUpperCase()}<small>${numberFormat.format(country.visitors)}</small></span>
  `).join("")}</div>`;
}

async function loadVisitorStats() {
  const path = infoConfig.analytics?.publicStatsPath ?? "data/visitor-stats.json";
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Visitor summary unavailable");
    const stats = await response.json();
    if (!stats.configured) return;
    document.querySelector("#total-visitors").textContent = numberFormat.format(stats.totalVisitors ?? 0);
    document.querySelector("#recent-visitors").textContent = numberFormat.format(stats.last30Days ?? 0);
    document.querySelector("#country-count").textContent = numberFormat.format(stats.countryCount ?? stats.countries?.length ?? 0);
    document.querySelector("#stats-updated").textContent = stats.updatedAt
      ? new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(stats.updatedAt))
      : "Pending";
    const state = document.querySelector("#analytics-state");
    state.innerHTML = "<i></i> Aggregated analytics";
    state.classList.add("is-live");
    renderCountryList(stats.countries ?? []);
  } catch (error) {
    console.info("PAWS visitor board is awaiting its public aggregate.", error);
  }
}

activateConfiguredAnalytics();
loadVisitorStats();
