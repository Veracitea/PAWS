const siteConfig = window.PAWS_CONFIG ?? {};

const state = {
  data: null,
  table: "News",
  policyId: "all",
  query: "",
  selectedRecordKey: null,
  selectedRecord: null,
  timelinePolicy: "all",
  timelineWindow: "policy",
  selectedTimeline: null,
  entityPolicy: "all",
  selectedEntityId: null,
};

const elements = {
  recordList: document.querySelector("#record-list"),
  inspector: document.querySelector("#record-inspector"),
  resultCount: document.querySelector("#result-count"),
  searchInput: document.querySelector("#record-search"),
  tableFilter: document.querySelector("#table-filter"),
  policyFilter: document.querySelector("#policy-filter"),
  resetFilters: document.querySelector("#reset-filters"),
  tableLabel: document.querySelector("#active-table-label"),
  schemaSummary: document.querySelector("#schema-summary"),
  recordTotal: document.querySelector("#dataset-record-total"),
  databaseNote: document.querySelector("#database-note"),
  timelinePolicy: document.querySelector("#timeline-policy"),
  timelineWindow: document.querySelector("#timeline-window"),
  showNews: document.querySelector("#show-news"),
  showActions: document.querySelector("#show-actions"),
  timelineChart: document.querySelector("#timeline-chart"),
  timelineDetail: document.querySelector("#timeline-detail"),
  timelineSummary: document.querySelector("#timeline-summary"),
  entityPolicy: document.querySelector("#entity-policy"),
  entityLimit: document.querySelector("#entity-limit"),
  entityCloud: document.querySelector("#entity-cloud"),
  entityDetail: document.querySelector("#entity-detail"),
};

const figureData = {
  timeline: {
    number: "Figure 04",
    title: "Policy action timeline",
    src: "figures/fig4_policy_action_timeline_wide.png",
    alt: "Actions for policies P5 through P43 plotted by relative position in each policy's observed action window; color encodes linked origin-news count",
    caption: "Relative action timing across verified policy episodes; color encodes each action's linked origin-news count.",
  },
  stakeholders: {
    number: "Figure 01",
    title: "Stakeholder diversity",
    src: "figures/fig1_policy_stakeholders_vs_rows.png",
    alt: "Unique stakeholder and action-row counts by policy on a logarithmic scale",
    caption: "Raw unique-stakeholder and Action-row counts across verified policies, shown on a logarithmic scale.",
  },
  taxonomy: {
    number: "Figure 05",
    title: "Policy class distributions",
    src: "figures/fig5_policy_class_distribution_heatmap.png",
    alt: "Within-policy distribution heatmap for action type, interaction mode, and financial action family",
    caption: "Within-policy proportions across action type, interaction mode, and financial-action family classes.",
  },
};

// Complete policy catalogue. Only the five policies in public-dataset.json
// currently have browsable news, action, event-frame, and policy rows.
const policyCatalog = [
  [5, "Short-selling ban", "Emergency Order Halting Short Selling in Financial Stocks"],
  [6, "TALF", "Term Asset-Backed Securities Loan Facility"],
  [7, "CPFF", "Commercial Paper Funding Facility"],
  [8, "TAF", "Term Auction Facility"],
  [10, "Decimalization", "Decimalization"],
  [12, "Jobs and Growth Tax Relief", "Jobs and Growth Tax Relief"],
  [13, "Operation Twist", "Operation Twist (Maturity Extension Program)"],
  [14, "Evans Rule", "State-Contingent Forward Guidance (The Evans Rule)"],
  [15, "Quantitative Easing 3", "Quantitative Easing 3 (Open-Ended LSAP)"],
  [16, "Dollar Liquidity Swap Line Rate Reduction", "Dollar Liquidity Swap Line Rate Reduction"],
  [18, "Durbin Amendment", "The Durbin Amendment"],
  [19, "U.S. Basel III", "U.S. Implementation of Basel III"],
  [20, "G-SIFI Designations", "G-SIFI Designations"],
  [21, "Budget Control Act / S&P Downgrade", "Budget Control Act / S&P Sovereign Downgrade"],
  [22, "JOBS Act", "Jumpstart Our Business Startups (JOBS) Act"],
  [23, "Say-on-Pay Mandates", "Say-on-Pay Mandates"],
  [24, "Taper Tantrum", "Unconventional Monetary Policy Tapering Announcement (Taper Tantrum)"],
  [25, "JOBS Act Title II", "Title II of the JOBS Act (General Solicitation)"],
  [26, "Volcker Rule", "The Volcker Rule (Dodd-Frank Act Section 619)"],
  [27, "2014 SEC Money Market Fund Reform", "2014 SEC Money Market Fund Reform"],
  [28, "DOL Fiduciary Rule", "Department of Labor (DOL) Fiduciary Rule"],
  [29, "Crude Oil Export Ban Repeal", "Repeal of the U.S. Crude Oil Export Ban"],
  [30, "ZLB Liftoff", "Federal Reserve Zero Lower Bound (ZLB) Liftoff"],
  [31, "Section 385 Regulations", "Treasury Department Section 385 Regulations (Anti-Inversion and Earnings Stripping Rules)"],
  [32, "Tax Cuts and Jobs Act", "The Tax Cuts and Jobs Act (TCJA)"],
  [33, "U.S.-China Tariff 1", "U.S.-China Trade War Tariff (1)"],
  [34, "U.S.-China Tariff 2", "U.S.-China Trade War Tariff (2)"],
  [35, "U.S.-China Tariff 3", "U.S.-China Trade War Tariff (3)"],
  [36, "EGRRCPA", "Economic Growth, Regulatory Relief, and Consumer Protection Act (EGRRCPA)"],
  [37, "2019 Repo Intervention", "The September 2019 Repo Market Intervention and FOMC Policy Pivot"],
  [38, "Volcker 2.0 / 2.1", "Final Rule Implementing Amendments to the Volcker Rule (Volcker 2.0 / 2.1)"],
  [39, "Emergency Rate Cuts and Credit Facilities", "Federal Reserve Emergency Rate Cuts and Corporate Credit Facilities (PMCCF/SMCCF)"],
  [40, "CARES Act", "Coronavirus Aid, Relief, and Economic Security (CARES) Act"],
  [41, "American Rescue Plan", "American Rescue Plan Act of 2021 (Third Round Stimulus Checks / EIP3)"],
  [42, "CHIPS and Science Act", "CHIPS and Science Act"],
  [43, "Infrastructure Investment and Jobs Act", "Infrastructure Investment and Jobs Act (IIJA)"],
].map(([id, shortName, name]) => ({ id, shortName, name }));

const numberFormatter = new Intl.NumberFormat("en-US");
const DAY_MS = 86_400_000;
const formatNumber = (value) => numberFormatter.format(Number(value) || 0);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const readable = (value, fallback = "Not recorded") => {
  const text = String(value ?? "").trim();
  return text ? text.replaceAll("_", " ") : fallback;
};

function validateDataset(payload) {
  const invalid = (message) => { throw new Error(`Invalid public dataset: ${message}`); };
  if (!payload || typeof payload !== "object") invalid("root value must be an object");
  ["policies", "news", "actions", "entities"].forEach((key) => {
    if (!Array.isArray(payload[key])) invalid(`${key} must be an array`);
  });
  if (!payload.schema || !Array.isArray(payload.schema.tables)) invalid("schema.tables must be an array");

  const policyIds = new Set();
  payload.policies.forEach((policy) => {
    if (!Number.isInteger(policy.id) || policyIds.has(policy.id)) invalid("policy IDs must be unique integers");
    policyIds.add(policy.id);
  });

  const newsIds = new Set(payload.news.map((record) => record.id));
  const actionIds = new Set(payload.actions.map((record) => record.id));
  payload.news.forEach((record) => {
    if (!policyIds.has(record.policyId)) invalid(`News ${record.id} references an unknown policy`);
    if (!Array.isArray(record.linkedActionIds)) invalid(`News ${record.id} is missing linkedActionIds`);
    if (record.linkedActionIds.some((id) => !actionIds.has(id))) invalid(`News ${record.id} references an unpublished action`);
  });
  payload.actions.forEach((record) => {
    if (!Array.isArray(record.policyIds) || record.policyIds.some((id) => !policyIds.has(id))) invalid(`Action ${record.id} has invalid policy links`);
    if (!Array.isArray(record.newsIds) || record.newsIds.some((id) => !newsIds.has(id))) invalid(`Action ${record.id} has invalid news links`);
    if (!record.frame || typeof record.frame !== "object") invalid(`Action ${record.id} is missing its ActionFrame`);
  });
  payload.entities.forEach((entity) => {
    ["aliases", "policies", "topActionTypes", "topFamilies", "sampleActionIds"].forEach((key) => {
      if (!Array.isArray(entity[key])) invalid(`Entity ${entity.id} is missing ${key}`);
    });
    if (entity.sampleActionIds.some((id) => !actionIds.has(id))) invalid(`Entity ${entity.id} references an unpublished action`);
  });
  return payload;
}

const truncate = (value, length = 120) => {
  const text = String(value ?? "").trim();
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
};
const policyById = (id) => state.data?.policies.find((policy) => policy.id === Number(id))
  ?? policyCatalog.find((policy) => policy.id === Number(id));

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function sourceLink(value, label = "Open source ↗") {
  const href = safeExternalUrl(value);
  return href
    ? `<a class="source-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    : '<span class="source-unavailable">No public source URL recorded</span>';
}

function parseDate(value) {
  const match = String(value ?? "").match(/^(\d{4})(?:-(\d{2})-(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1800 || year > 2100) return null;
  const month = Number(match[2] || 1);
  const day = Number(match[3] || 1);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return Number.isFinite(time) && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : null;
}

function formatDate(value) {
  if (!value) return "Date not recorded";
  if (/^\d{4}$/.test(String(value))) return String(value);
  const time = parseDate(value);
  if (time === null) return String(value);
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(time);
}

function metaGrid(items) {
  return `<div class="meta-grid">${items.map(([label, value]) => `
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(readable(value))}</strong></div>
  `).join("")}</div>`;
}

function provenanceBlock(title, rows) {
  return `
    <div class="provenance-block">
      <span>${escapeHtml(title)}</span>
      <dl>${rows.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd><code>${escapeHtml(readable(value))}</code></dd></div>`).join("")}</dl>
    </div>`;
}

function recordKey(record, table = state.table) {
  if (table === "ActionFrame") return `FRAME-${record.id}`;
  if (table === "Policies") return `POLICY-${record.id}`;
  return record.recordId;
}

function recordPolicies(record, table = state.table) {
  if (table === "News") return [record.policyId];
  if (table === "Policies") return [record.id];
  return record.policyIds ?? [];
}

function tableRecords(table = state.table) {
  if (!state.data) return [];
  if (table === "News") return state.data.news;
  if (table === "Policies") return state.data.policies;
  return state.data.actions;
}

function recordTitle(record, table = state.table) {
  if (table === "News") return record.headline;
  if (table === "Policies") return record.name;
  if (table === "ActionFrame") {
    const family = readable(record.frame?.family, "Unclassified frame");
    const subtype = readable(record.frame?.subtype, "");
    return subtype && subtype !== "no subtype" ? `${family} · ${subtype}` : family;
  }
  return record.action || record.entity || record.organisation || "Untitled action row";
}

function recordSubtitle(record, table = state.table) {
  const policies = recordPolicies(record, table).map((id) => policyById(id)?.shortName).filter(Boolean).join(", ");
  if (table === "News") return `${record.sourceLabel || "Source"} · ${policies}`;
  if (table === "Policies") return `${formatDate(record.startDate)} – ${formatDate(record.endDate)}`;
  const actor = record.organisation || record.entity || "Actor not recorded";
  return `${actor} · ${policies}`;
}

function recordSearchText(record, table = state.table) {
  const policyNames = recordPolicies(record, table)
    .flatMap((id) => [policyById(id)?.name, policyById(id)?.shortName])
    .filter(Boolean);
  const values = table === "News"
    ? [record.recordId, record.headline, record.sourceLabel, record.date]
    : table === "Policies"
      ? [record.id, record.name, record.shortName, record.intendedEffect, record.actualImpact]
      : [record.recordId, record.action, record.entity, record.organisation, record.actionType, ...Object.values(record.frame ?? {})];
  return [...values, ...policyNames].join(" ").toLowerCase();
}

function filteredRecords() {
  const query = state.query.toLowerCase();
  return tableRecords().filter((record) => {
    const matchesPolicy = state.policyId === "all" || recordPolicies(record).includes(Number(state.policyId));
    const matchesQuery = !query || recordSearchText(record).includes(query);
    return matchesPolicy && matchesQuery;
  });
}

function updateUrl() {
  if (!elements.recordList) return;
  const params = new URLSearchParams();
  if (state.table !== "News") params.set("table", state.table);
  if (state.policyId !== "all") params.set("policy", state.policyId);
  if (state.query) params.set("q", state.query);
  if (state.selectedRecordKey) params.set("record", state.selectedRecordKey);
  const next = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next);
}

function loadUrlState() {
  const params = new URLSearchParams(window.location.search);
  const table = params.get("table");
  const policy = params.get("policy");
  if (["News", "Action", "ActionFrame", "Policies"].includes(table)) state.table = table;
  if (policy === "all" || policyCatalog.some((item) => String(item.id) === policy)) state.policyId = policy;
  state.query = params.get("q") ?? "";
  state.selectedRecordKey = params.get("record");
  elements.tableFilter.value = state.table;
  elements.policyFilter.value = state.policyId;
  elements.searchInput.value = state.query;
}

function inspectorActions(record) {
  return `
    <div class="inspector-actions">
      <button class="small-button" type="button" data-copy-id="${escapeHtml(recordKey(record))}">Copy row ID</button>
      <button class="small-button" type="button" data-view-json>View published JSON</button>
    </div>`;
}

function linkedRecordButtons(ids, table, label) {
  if (!ids?.length) return `<p class="linked-empty">No ${escapeHtml(label.toLowerCase())} are included in this public subset.</p>`;
  return `<div class="linked-records"><span>${escapeHtml(label)}</span><div>${ids.slice(0, 12).map((id) => `
    <button class="small-button" type="button" data-open-table="${escapeHtml(table)}" data-open-id="${escapeHtml(id)}">${escapeHtml(table === "News" ? `NEWS-${id}` : `ACTION-${id}`)}</button>
  `).join("")}</div></div>`;
}

function renderNewsInspector(record) {
  const policy = policyById(record.policyId);
  elements.inspector.innerHTML = `
    <div class="inspector-topline"><span class="record-id">${escapeHtml(record.recordId)}</span><span class="record-status">SQLite-derived</span></div>
    <h3>${escapeHtml(record.headline)}</h3>
    <p class="record-summary">A published metadata row from the <code>News</code> table. Article content is intentionally omitted.</p>
    ${metaGrid([
      ["Policy episode", policy?.name], ["Article date", formatDate(record.date)],
      ["Source host", record.sourceLabel], ["Retrieval count", record.retrievalCount],
      ["Linked actions in full DB", record.linkedActionCount], ["Linked actions published here", record.linkedActionIds.length],
    ])}
    <div class="source-row">${sourceLink(record.sourceUrl, `Visit ${record.sourceLabel || "source"} ↗`)}</div>
    ${provenanceBlock("Row provenance", [
      ["Source row", `News.news_id = ${record.id}`],
      ["Policy link", `News.policy_id = ${record.policyId}`],
      ["Source URL field", "News.source"],
      ["Not published", "News.content"],
    ])}
    ${linkedRecordButtons(record.linkedActionIds, "Action", "Linked action rows")}
    ${inspectorActions(record)}
  `;
}

function actionProvenance(record) {
  const frame = record.frame ?? {};
  return provenanceBlock("Join-based provenance", [
    ["Source row", `Action.action_id = ${record.id}`],
    ["News links", record.newsIds.length ? `Action.news_ids → News.news_id (${record.newsIds.join(", ")})` : "Action.news_ids is empty"],
    ["Frame join", `Action.action_id → ActionFrame.action_id = ${record.id}`],
    ["Frame schema", frame.schemaVersion ? `version ${frame.schemaVersion}` : "not recorded"],
    ["Pipeline stage", frame.pipelineStage || "not recorded"],
    ["Frame confidence", frame.confidence ?? "not recorded"],
  ]);
}

function renderActionInspector(record, frameOnly = false) {
  const policyNames = record.policyIds.map((id) => policyById(id)?.name || `Policy ${id}`).join("; ");
  const actor = record.organisation || record.entity || "Actor not recorded";
  const frame = record.frame ?? {};
  const frameItems = [
    ["Interaction mode", frame.interactionMode], ["Financial-action family", frame.family],
    ["Subtype", frame.subtype], ["Modality", frame.modality],
    ["Status", frame.status], ["Direction", frame.direction],
    ["Actor role", frame.actorRole], ["Target entity", frame.targetEntity],
    ["Target sector", frame.targetSector], ["Instrument / facility", frame.instrument],
  ];
  const actionItems = [
    ["Policy episode", policyNames], ["Event date", formatDate(record.date)],
    ["Actor", actor], ["Action type", record.actionType],
    ["Organisation ID", record.organisationId], ["Wikidata QID", record.organisationQid],
  ];
  elements.inspector.innerHTML = `
    <div class="inspector-topline"><span class="record-id">${escapeHtml(frameOnly ? `FRAME-${record.id}` : record.recordId)}</span><span class="record-status">SQLite-derived</span></div>
    <h3>${escapeHtml(frameOnly ? recordTitle(record, "ActionFrame") : recordTitle(record, "Action"))}</h3>
    <p class="record-summary">${escapeHtml(record.action || "No action description was recorded for this row.")}</p>
    ${metaGrid(frameOnly ? frameItems : actionItems)}
    ${frameOnly ? `<details class="frame-context"><summary>Show linked action context</summary>${metaGrid(actionItems)}</details>` : `<details class="frame-context"><summary>Show ActionFrame classification</summary>${metaGrid(frameItems)}</details>`}
    ${actionProvenance(record)}
    ${linkedRecordButtons(record.newsIds, "News", "Linked news rows")}
    ${inspectorActions(record)}
  `;
}

function renderPolicyInspector(record) {
  elements.inspector.innerHTML = `
    <div class="inspector-topline"><span class="record-id">POLICY-${escapeHtml(record.id)}</span><span class="record-status">SQLite-derived</span></div>
    <h3>${escapeHtml(record.name)}</h3>
    <p class="record-summary">${escapeHtml(record.intendedEffect || "No intended effect was recorded.")}</p>
    ${metaGrid([
      ["Short name", record.shortName], ["Documented window", `${formatDate(record.startDate)} – ${formatDate(record.endDate)}`],
      ["Announcement", formatDate(record.announcementDate)], ["Implementation", formatDate(record.implementationDate)],
      ["Observed evidence", `${formatDate(record.observedStart)} – ${formatDate(record.observedEnd)}`], ["Policy ID", record.id],
    ])}
    <div class="evidence-block"><span>Recorded actual impact</span><p>${escapeHtml(record.actualImpact || "Not recorded")}</p></div>
    <div class="source-row">${sourceLink(record.sourceUrl, "Open policy source ↗")}</div>
    ${provenanceBlock("Row provenance", [
      ["Source row", `Policies.policy_id = ${record.id}`],
      ["Timeline dates", "Policies.start_date / end_date"],
      ["Evidence range", "derived from linked News and Action dates"],
    ])}
    ${inspectorActions(record)}
  `;
}

function renderInspector(record) {
  if (!record) {
    elements.inspector.innerHTML = '<div class="empty-state"><strong>No matching row selected.</strong><p>Adjust the table, policy, or search filter.</p></div>';
    state.selectedRecord = null;
    return;
  }
  state.selectedRecord = record;
  if (state.table === "News") renderNewsInspector(record);
  else if (state.table === "Policies") renderPolicyInspector(record);
  else renderActionInspector(record, state.table === "ActionFrame");
}

function renderExplorer() {
  const records = filteredRecords();
  if (!records.some((record) => recordKey(record) === state.selectedRecordKey)) {
    state.selectedRecordKey = records[0] ? recordKey(records[0]) : null;
  }
  const selectedRecord = records.find((record) => recordKey(record) === state.selectedRecordKey);
  let visible = records.slice(0, 200);
  const selectedOutsideFirstPage = selectedRecord && !visible.includes(selectedRecord);
  if (selectedOutsideFirstPage) visible = [...visible.slice(0, 199), selectedRecord];
  elements.resultCount.textContent = records.length > visible.length
    ? `${formatNumber(records.length)} rows · showing ${visible.length}${selectedOutsideFirstPage ? " including selected" : ""}`
    : `${formatNumber(records.length)} ${records.length === 1 ? "row" : "rows"}`;
  elements.tableLabel.textContent = `${state.table} table`;
  const selectedPolicyIsSample = state.policyId === "all"
    || state.data.policies.some((policy) => String(policy.id) === state.policyId);
  const emptyMessage = selectedPolicyIsSample
    ? '<div class="empty-state"><strong>No matching rows</strong><p>Try clearing one of the filters.</p></div>'
    : '<div class="empty-state"><strong>Policy catalogue entry</strong><p>Rows for this policy are not included in the current five-policy public sample.</p></div>';
  elements.recordList.innerHTML = visible.length ? visible.map((record) => {
    const key = recordKey(record);
    const selected = key === state.selectedRecordKey;
    const date = state.table === "Policies" ? record.startDate : record.date;
    const index = state.table === "News" ? `N${record.id}` : state.table === "Action" ? `A${record.id}` : state.table === "ActionFrame" ? `F${record.id}` : `P${record.id}`;
    return `
      <button class="record-card ${selected ? "is-selected" : ""}" type="button" data-record-key="${escapeHtml(key)}" aria-pressed="${selected}">
        <span class="record-index">${escapeHtml(index)}</span>
        <span><strong>${escapeHtml(truncate(recordTitle(record), 125))}</strong><span>${escapeHtml(truncate(recordSubtitle(record), 105))}</span></span>
        <time datetime="${escapeHtml(date || "")}">${escapeHtml(String(date || "—").slice(0, 4))}</time>
      </button>`;
  }).join("") : emptyMessage;
  renderInspector(selectedRecord);
  updateUrl();
}

function openExplorer(table, id, policyId = "all") {
  state.table = table;
  state.policyId = policyId === undefined || policyId === null ? "all" : String(policyId);
  state.query = "";
  state.selectedRecordKey = table === "News" ? `NEWS-${id}` : table === "Policies" ? `POLICY-${id}` : table === "ActionFrame" ? `FRAME-${id}` : `ACTION-${id}`;
  elements.tableFilter.value = state.table;
  elements.policyFilter.value = state.policyId;
  elements.searchInput.value = "";
  renderExplorer();
  document.querySelector("[data-explorer]")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getTimelineWindow(policy) {
  const preferred = state.timelineWindow === "policy"
    ? [policy.startDate, policy.endDate]
    : [policy.observedStart, policy.observedEnd];
  let start = parseDate(preferred[0]);
  let end = parseDate(preferred[1]);
  let label = state.timelineWindow === "policy" ? "documented policy window" : "robust observed window (5th–95th percentile)";
  let fallback = false;
  if (start === null || end === null || end <= start) {
    start = parseDate(policy.observedStart);
    end = parseDate(policy.observedEnd);
    label = "robust observed window (fallback)";
    fallback = true;
  }
  if (start === null || end === null || end <= start) {
    const dates = [
      ...state.data.news.filter((item) => item.policyId === policy.id).map((item) => parseDate(item.date)),
      ...state.data.actions.filter((item) => item.policyIds.includes(policy.id)).map((item) => parseDate(item.date)),
    ].filter((value) => value !== null);
    if (dates.length) {
      start = Math.min(...dates);
      end = Math.max(...dates);
      label = "available row dates (fallback)";
      if (end <= start) {
        start -= DAY_MS / 2;
        end += DAY_MS / 2;
        label = "single available row date (fallback)";
      }
    } else {
      start = null;
      end = null;
      label = "no usable date window";
    }
    fallback = true;
  }
  return { start, end, label, fallback };
}

function sampleEven(items, limit) {
  if (items.length <= limit) return items;
  const indexes = new Set(Array.from({ length: limit }, (_, index) => Math.round(index * (items.length - 1) / (limit - 1))));
  return [...indexes].map((index) => items[index]);
}

function timelineEvents(policy) {
  const windowData = getTimelineWindow(policy);
  const makeEvent = (kind, record) => {
    const time = parseDate(record.date);
    if (time === null || !Number.isFinite(windowData.start) || !Number.isFinite(windowData.end)) return null;
    const rawPosition = ((time - windowData.start) / (windowData.end - windowData.start)) * 100;
    return {
      kind,
      record,
      policy,
      window: windowData,
      position: Math.max(0, Math.min(100, rawPosition)),
      outside: rawPosition < 0 || rawPosition > 100,
      key: `${kind}:${record.id}:${policy.id}`,
    };
  };
  const news = state.data.news.filter((record) => record.policyId === policy.id).map((record) => makeEvent("News", record)).filter(Boolean);
  const actions = state.data.actions.filter((record) => record.policyIds.includes(policy.id)).map((record) => makeEvent("Action", record)).filter(Boolean);
  return { news, actions };
}

function timelinePoint(event, index) {
  const title = event.kind === "News" ? event.record.headline : event.record.action || event.record.entity || "Action row";
  const lane = event.kind === "News" ? 18 + ((event.record.id + index) % 4) * 8 : 60 + ((event.record.id + index) % 4) * 8;
  const selected = state.selectedTimeline?.key === event.key;
  return `<button class="timeline-point ${event.kind.toLowerCase()} ${event.outside ? "is-outside" : ""} ${selected ? "is-selected" : ""}" type="button"
    style="left:${event.position.toFixed(2)}%;top:${lane}%" data-timeline-key="${escapeHtml(event.key)}"
    aria-pressed="${selected}"
    aria-label="${escapeHtml(`${event.kind}, ${formatDate(event.record.date)}, ${title}${event.outside ? ", outside the selected window and clamped to its edge" : ""}`)}"
    title="${escapeHtml(`${formatDate(event.record.date)} · ${truncate(title, 100)}`)}"></button>`;
}

function renderTimelineDetail(event) {
  if (!event) {
    elements.timelineDetail.innerHTML = '<span class="detail-empty">Select a news or action point to inspect its real date, source row, and linked records.</span>';
    return;
  }
  const isNews = event.kind === "News";
  const record = event.record;
  const title = isNews ? record.headline : record.action || record.entity || "Action row";
  const actor = isNews ? record.sourceLabel : record.organisation || record.entity || "Actor not recorded";
  elements.timelineDetail.innerHTML = `
    <div class="detail-kicker"><span>${escapeHtml(event.kind)} row</span><strong>${event.position.toFixed(1)}%</strong></div>
    <h4>${escapeHtml(title)}</h4>
    <p>${escapeHtml(formatDate(record.date))} · ${escapeHtml(event.policy.shortName)}</p>
    <dl>
      <div><dt>${isNews ? "Source" : "Actor"}</dt><dd>${escapeHtml(readable(actor))}</dd></div>
      <div><dt>Normalized against</dt><dd>${escapeHtml(event.window.label)}</dd></div>
      <div><dt>Source row</dt><dd><code>${escapeHtml(isNews ? `News.news_id = ${record.id}` : `Action.action_id = ${record.id}`)}</code></dd></div>
    </dl>
    ${event.outside ? '<p class="window-warning">This date falls outside the selected window, so its marker is clamped to the nearest edge.</p>' : ""}
    ${isNews ? `<div class="source-row">${sourceLink(record.sourceUrl)}</div>` : ""}
    <button class="small-button" type="button" data-open-timeline>Open in table browser</button>
  `;
}

function renderTimeline() {
  const policies = state.timelinePolicy === "all"
    ? state.data.policies
    : state.data.policies.filter((policy) => String(policy.id) === state.timelinePolicy);
  const showNews = elements.showNews.checked;
  const showActions = elements.showActions.checked;
  const perTypeLimit = state.timelinePolicy === "all" ? 24 : 100;
  const eventMap = new Map();
  let shown = 0;
  let available = 0;
  const rows = policies.map((policy) => {
    const events = timelineEvents(policy);
    const selectedNews = showNews ? sampleEven(events.news, perTypeLimit) : [];
    const selectedActions = showActions ? sampleEven(events.actions, perTypeLimit) : [];
    const displayed = [...selectedNews, ...selectedActions].sort((a, b) => a.position - b.position);
    displayed.forEach((event) => eventMap.set(event.key, event));
    shown += displayed.length;
    available += (showNews ? events.news.length : 0) + (showActions ? events.actions.length : 0);
    const windowData = getTimelineWindow(policy);
    return `
      <div class="timeline-row">
        <div class="timeline-row-label"><strong>${escapeHtml(policy.shortName)}</strong><span>${escapeHtml(windowData.label)}</span></div>
        <div class="timeline-track" aria-label="${escapeHtml(`${policy.name}: ${displayed.length} displayed points`)}">
          ${displayed.map(timelinePoint).join("")}
        </div>
      </div>`;
  });
  elements.timelineChart.innerHTML = rows.join("") || '<div class="empty-state">No policy timeline is available.</div>';
  elements.timelineSummary.textContent = `${shown} interactive points displayed from ${available} dated rows. Large groups are evenly sampled visually; every published row remains searchable in the table browser. Use arrow keys to move between timeline points.`;
  const selected = state.selectedTimeline ? eventMap.get(state.selectedTimeline.key) : null;
  if (selected) state.selectedTimeline = selected;
  else if (eventMap.size) state.selectedTimeline = eventMap.values().next().value;
  else state.selectedTimeline = null;
  renderTimelineDetail(state.selectedTimeline);
  const pointButtons = [...elements.timelineChart.querySelectorAll("[data-timeline-key]")];
  const selectPoint = (button, moveFocus = false) => {
    state.selectedTimeline = eventMap.get(button.dataset.timelineKey);
    pointButtons.forEach((point) => {
      const isSelected = point === button;
      point.classList.toggle("is-selected", isSelected);
      point.setAttribute("aria-pressed", String(isSelected));
      point.tabIndex = isSelected ? 0 : -1;
    });
    renderTimelineDetail(state.selectedTimeline);
    if (moveFocus) button.focus();
  };
  pointButtons.forEach((button) => {
    const isSelected = button.dataset.timelineKey === state.selectedTimeline?.key;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.tabIndex = isSelected ? 0 : -1;
    button.addEventListener("click", () => selectPoint(button));
    button.addEventListener("keydown", (event) => {
      const currentIndex = pointButtons.indexOf(button);
      let nextIndex = null;
      if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (currentIndex + 1) % pointButtons.length;
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (currentIndex - 1 + pointButtons.length) % pointButtons.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = pointButtons.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      selectPoint(pointButtons[nextIndex], true);
    });
  });
}

function entityPolicyCount(entity) {
  if (state.entityPolicy === "all") return entity.actionCount;
  return entity.policies.find((policy) => String(policy.id) === state.entityPolicy)?.actionCount ?? 0;
}

function renderEntityDetail(entity) {
  if (!entity) {
    elements.entityDetail.innerHTML = '<span class="detail-empty">Select an organization to see its policy involvement and recurring action families.</span>';
    return;
  }
  const maxPolicy = Math.max(...entity.policies.map((policy) => policy.actionCount), 1);
  const selectedPolicySummary = state.entityPolicy === "all"
    ? null
    : entity.policies.find((policy) => String(policy.id) === state.entityPolicy);
  const detailSummary = selectedPolicySummary ?? entity;
  const sampleActionIds = detailSummary.sampleActionIds ?? [];
  const actionTypes = detailSummary.topActionTypes.map((item) => `<li><span>${escapeHtml(readable(item.name))}</span><strong>${formatNumber(item.count)}</strong></li>`).join("");
  const families = detailSummary.topFamilies.map((item) => `<li><span>${escapeHtml(readable(item.name))}</span><strong>${formatNumber(item.count)}</strong></li>`).join("");
  elements.entityDetail.innerHTML = `
    <div class="detail-kicker"><span>${escapeHtml(selectedPolicySummary ? `${selectedPolicySummary.shortName} summary` : "Entity summary")}</span><strong>${formatNumber(detailSummary.actionCount)} actions</strong></div>
    <h4>${escapeHtml(entity.name)}</h4>
    <p>${formatNumber(detailSummary.linkedNewsCount)} linked news rows${entity.aliases.length ? ` · aliases include ${escapeHtml(entity.aliases.slice(0, 3).join(", "))}` : ""}</p>
    <div class="involvement-list"><span>Policy involvement</span>${entity.policies.map((policy) => `
      <div><strong>${escapeHtml(policy.shortName)}</strong><i><b style="width:${(policy.actionCount / maxPolicy) * 100}%"></b></i><em>${formatNumber(policy.actionCount)}</em></div>
    `).join("")}</div>
    <div class="frequency-columns">
      <div><span>Most frequent action types</span><ol>${actionTypes}</ol></div>
      <div><span>Most frequent action families</span><ol>${families}</ol></div>
    </div>
    ${linkedRecordButtons(sampleActionIds, "Action", "Example action rows")}
    ${provenanceBlock("Summary provenance", [
      ["Derived from", entity.provenance.derivedFrom.join(" + ")],
      ["Grouped by", entity.provenance.groupingFields.join(", ")],
      ["Policy field", entity.provenance.policyField],
    ])}
  `;
}

function renderEntities() {
  const limit = Number(elements.entityLimit.value);
  const ranked = state.data.entities
    .filter((entity) => entityPolicyCount(entity) > 0)
    .sort((a, b) => entityPolicyCount(b) - entityPolicyCount(a) || a.name.localeCompare(b.name))
    .slice(0, limit);
  if (!ranked.some((entity) => String(entity.id) === String(state.selectedEntityId))) {
    state.selectedEntityId = ranked[0]?.id ?? null;
  }
  const max = Math.max(...ranked.map(entityPolicyCount), 1);
  elements.entityCloud.innerHTML = ranked.length ? ranked.map((entity, index) => {
    const count = entityPolicyCount(entity);
    const selected = String(entity.id) === String(state.selectedEntityId);
    return `
      <button class="entity-button ${selected ? "is-selected" : ""}" type="button" aria-pressed="${selected}" data-entity-id="${escapeHtml(entity.id)}" style="--entity-strength:${(count / max) * 100}%">
        <span><i>${String(index + 1).padStart(2, "0")}</i><strong>${escapeHtml(entity.name)}</strong></span><b>${formatNumber(count)} <small>actions</small></b>
      </button>`;
  }).join("") : '<div class="empty-state">No ranked entity is available for this policy.</div>';
  const selectedEntity = ranked.find((entity) => String(entity.id) === String(state.selectedEntityId));
  renderEntityDetail(selectedEntity);
  elements.entityCloud.querySelectorAll("[data-entity-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedEntityId = button.dataset.entityId;
      renderEntities();
    });
  });
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function populatePolicySelects() {
  const sampleIds = new Set(state.data.policies.map((policy) => policy.id));
  const catalogueOptions = policyCatalog.map((policy) => {
    const availability = sampleIds.has(policy.id) ? "" : " — catalogue only";
    return `<option value="${policy.id}">${escapeHtml(policy.shortName + availability)}</option>`;
  }).join("");
  const sampleOptions = state.data.policies
    .map((policy) => `<option value="${policy.id}">${escapeHtml(policy.shortName)}</option>`)
    .join("");
  elements.policyFilter.insertAdjacentHTML("beforeend", catalogueOptions);
  [elements.timelinePolicy, elements.entityPolicy].forEach((select) => select.insertAdjacentHTML("beforeend", sampleOptions));
}

function renderDatabaseSummary() {
  const newsCount = state.data.news.length;
  const actionCount = state.data.actions.length;
  const recordCount = newsCount + actionCount;
  elements.recordTotal.textContent = formatNumber(recordCount);
  elements.databaseNote.innerHTML = `
    <span class="database-pulse" aria-hidden="true"></span>
    <p><strong>Sanitized browser subset for exploration</strong><small>${formatNumber(newsCount)} News rows · ${formatNumber(actionCount)} Action rows · matching ActionFrames · ${formatNumber(state.data.policies.length)} Policies. Article bodies and raw model payloads are omitted.</small></p>`;
  elements.schemaSummary.textContent = state.data.schema.tables
    .filter((table) => ["News", "Action", "ActionFrame", "Policies"].includes(table.name))
    .map((table) => `${table.name} ${formatNumber(table.exportedRows)}/${formatNumber(table.databaseRows)}`)
    .join(" · ");
}

function attachExplorerEvents() {
  elements.recordList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-record-key]");
    if (!button) return;
    state.selectedRecordKey = button.dataset.recordKey;
    renderExplorer();
  });
  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value.trim();
    state.selectedRecordKey = null;
    renderExplorer();
  });
  elements.tableFilter.addEventListener("change", () => {
    state.table = elements.tableFilter.value;
    state.selectedRecordKey = null;
    renderExplorer();
  });
  elements.policyFilter.addEventListener("change", () => {
    state.policyId = elements.policyFilter.value;
    state.selectedRecordKey = null;
    renderExplorer();
  });
  elements.resetFilters.addEventListener("click", () => {
    state.table = "News";
    state.policyId = "all";
    state.query = "";
    state.selectedRecordKey = null;
    elements.tableFilter.value = "News";
    elements.policyFilter.value = "all";
    elements.searchInput.value = "";
    renderExplorer();
    elements.searchInput.focus();
  });
  elements.inspector.addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-open-table]");
    if (openButton) {
      openExplorer(openButton.dataset.openTable, openButton.dataset.openId);
      return;
    }
    const copyButton = event.target.closest("[data-copy-id]");
    if (copyButton) {
      await copyText(copyButton.dataset.copyId);
      copyButton.textContent = "Copied";
      window.setTimeout(() => { copyButton.textContent = "Copy row ID"; }, 1500);
      return;
    }
    const jsonButton = event.target.closest("[data-view-json]");
    if (!jsonButton || !state.selectedRecord) return;
    const existing = elements.inspector.querySelector(".json-preview");
    if (existing) {
      existing.remove();
      jsonButton.textContent = "View published JSON";
      return;
    }
    const pre = document.createElement("pre");
    pre.className = "json-preview";
    pre.textContent = JSON.stringify(state.selectedRecord, null, 2);
    jsonButton.closest(".inspector-actions").after(pre);
    jsonButton.textContent = "Hide published JSON";
  });
}

function attachInteractionEvents() {
  [elements.timelinePolicy, elements.timelineWindow, elements.showNews, elements.showActions].forEach((control) => {
    control.addEventListener("change", () => {
      state.timelinePolicy = elements.timelinePolicy.value;
      state.timelineWindow = elements.timelineWindow.value;
      state.selectedTimeline = null;
      renderTimeline();
    });
  });
  elements.timelineDetail.addEventListener("click", (event) => {
    if (!event.target.closest("[data-open-timeline]") || !state.selectedTimeline) return;
    openExplorer(state.selectedTimeline.kind, state.selectedTimeline.record.id, state.selectedTimeline.policy.id);
  });
  [elements.entityPolicy, elements.entityLimit].forEach((control) => {
    control.addEventListener("change", () => {
      state.entityPolicy = elements.entityPolicy.value;
      state.selectedEntityId = null;
      renderEntities();
    });
  });
  elements.entityDetail.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-table]");
    if (button) openExplorer(button.dataset.openTable, button.dataset.openId, state.entityPolicy);
  });
}

async function loadDataset() {
  if (!elements.recordList) return;
  const path = siteConfig.dataset?.publicSubsetPath || "data/public-dataset.json";
  try {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = validateDataset(await response.json());
    populatePolicySelects();
    loadUrlState();
    renderDatabaseSummary();
    attachExplorerEvents();
    attachInteractionEvents();
    renderExplorer();
    renderTimeline();
    renderEntities();
  } catch (error) {
    const message = `The public dataset subset could not be loaded (${error.message}). Run the site through a local web server and regenerate data/public-dataset.json if needed.`;
    elements.databaseNote.classList.add("is-error");
    elements.databaseNote.innerHTML = `<p><strong>Dataset unavailable</strong><small>${escapeHtml(message)}</small></p>`;
    elements.recordList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    elements.timelineChart.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    elements.entityCloud.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }
}

function activateResourceLinks() {
  const links = siteConfig.links ?? {};
  document.querySelectorAll("[data-resource]").forEach((element) => {
    const key = element.dataset.resource;
    const href = links[key];
    if (!href) return;
    element.href = href;
    element.classList.remove("is-pending");
    element.removeAttribute("aria-disabled");
    const isDownload = key === "paper" || key === "dataset";
    const status = element.querySelector("em");
    if (status) status.textContent = isDownload ? "Download" : "Open";
    if (key === "paper") element.setAttribute("download", "PAWS.pdf");
    else if (key === "dataset") element.setAttribute("download", "PAWS-public-dataset.json");
    else {
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
  });
}

function activateAnalytics() {
  const code = siteConfig.analytics?.goatCounterCode;
  if (!code) return;
  const script = document.createElement("script");
  script.async = true;
  script.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  script.src = "https://gc.zgo.at/count.js";
  document.head.append(script);
}

function activateFigureTabs() {
  const tabs = [...document.querySelectorAll("[data-figure]")];
  const activate = (button, moveFocus = false) => {
    const figure = figureData[button.dataset.figure];
    if (!figure) return;
    tabs.forEach((tab) => {
      const selected = tab === button;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    const panel = document.querySelector("#figure-panel");
    if (button.id) panel.setAttribute("aria-labelledby", button.id);
    const canvas = panel.querySelector(".figure-canvas");
    canvas.scrollTo({ top: 0, left: 0 });
    const image = document.querySelector("#figure-image");
    image.style.opacity = "0";
    window.setTimeout(() => {
      image.src = figure.src;
      image.alt = figure.alt;
      image.style.opacity = "1";
    }, 120);
    document.querySelector("#figure-number").textContent = figure.number;
    document.querySelector("#figure-title").textContent = figure.title;
    document.querySelector("#figure-caption").textContent = figure.caption;
    document.querySelector("#figure-full").href = figure.src;
    if (moveFocus) button.focus();
  };
  tabs.forEach((button, index) => {
    button.tabIndex = button.getAttribute("aria-selected") === "true" ? 0 : -1;
    button.addEventListener("click", () => activate(button));
    button.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (index + 1) % tabs.length;
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      activate(tabs[nextIndex], true);
    });
  });
}

document.querySelector("[data-copy-citation]")?.addEventListener("click", async (event) => {
  await copyText(document.querySelector("#citation-code").innerText);
  event.currentTarget.textContent = "Copied";
  document.querySelector(".citation-status").textContent = "Citation copied to clipboard.";
  window.setTimeout(() => {
    event.currentTarget.textContent = "Copy";
    document.querySelector(".citation-status").textContent = "";
  }, 1800);
});

activateResourceLinks();
activateAnalytics();
activateFigureTabs();
loadDataset();
