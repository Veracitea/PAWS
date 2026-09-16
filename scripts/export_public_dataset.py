"""Export a sanitized, static PAWS website subset from a local SQLite database.

The original database is intentionally not copied into the public website.
Article bodies, raw event-frame payloads, and classification rationales are
omitted. The generated JSON keeps row IDs and linkage fields so every visible
record can explain its provenance.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


POLICY_ALIASES = {
    5: "Short-selling ban",
    6: "TALF",
    7: "CPFF",
    8: "TAF",
    10: "Decimalization",
}

DEFAULT_POLICY_IDS = tuple(POLICY_ALIASES)
DEFAULT_VERIFIED_ACTION_IDS = (777, 962, 1053, 4388)
OBSERVED_WINDOW_GUARDRAIL_YEARS = 10
OBSERVED_WINDOW_QUANTILES = (0.05, 0.95)


def clean_text(value: object, limit: int | None = None) -> str:
    if value is None:
        return ""
    text = re.sub(r"\s+", " ", str(value)).strip().replace("\ufffd", "")
    if limit and len(text) > limit:
        return f"{text[: limit - 1].rstrip()}…"
    return text


def parse_int_list(value: object) -> list[int]:
    if value is None or value == "":
        return []
    if isinstance(value, int):
        return [value]
    try:
        parsed = json.loads(str(value))
    except (json.JSONDecodeError, TypeError):
        parsed = re.findall(r"\d+", str(value))
    if not isinstance(parsed, list):
        parsed = [parsed]
    result: list[int] = []
    for item in parsed:
        try:
            integer = int(item)
        except (TypeError, ValueError):
            continue
        if integer not in result:
            result.append(integer)
    return result


def iso_date(value: object) -> str:
    if value is None or value == "":
        return ""
    digits = re.sub(r"\D", "", str(value))
    if len(digits) >= 8:
        candidate = f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
        try:
            parsed = datetime.strptime(candidate, "%Y-%m-%d")
        except ValueError:
            return ""
        return candidate if 1800 <= parsed.year <= 2100 else ""
    if len(digits) == 4:
        year = int(digits)
        return digits if 1800 <= year <= 2100 else ""
    return ""


def domain_label(url: str) -> str:
    try:
        host = urlparse(url).netloc.removeprefix("www.")
    except ValueError:
        host = ""
    return host or "Source link"


def evenly_sample(rows: list[sqlite3.Row], limit: int) -> list[sqlite3.Row]:
    if limit <= 0 or len(rows) <= limit:
        return rows
    if limit == 1:
        return [rows[0]]
    indexes = {
        round(index * (len(rows) - 1) / (limit - 1)) for index in range(limit)
    }
    return [rows[index] for index in sorted(indexes)]


def table_count(connection: sqlite3.Connection, table: str) -> int:
    safe_table = table.replace('"', '""')
    return int(
        connection.execute(f'SELECT COUNT(*) FROM "{safe_table}"').fetchone()[0]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path, help="Source PAWS .db file")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/public-dataset.json"),
        help="Generated public JSON path",
    )
    parser.add_argument(
        "--policies",
        type=int,
        nargs="+",
        default=list(DEFAULT_POLICY_IDS),
        help="Policy IDs to publish",
    )
    parser.add_argument(
        "--max-actions-per-policy",
        type=int,
        default=250,
        help="Maximum timeline/search actions exported for each policy",
    )
    parser.add_argument(
        "--max-entities",
        type=int,
        default=36,
        help="Maximum ranked entity/organisation summaries to export",
    )
    parser.add_argument(
        "--include-actions",
        type=int,
        nargs="*",
        default=list(DEFAULT_VERIFIED_ACTION_IDS),
        help="Action IDs that are always included when present",
    )
    args = parser.parse_args()

    source = args.db.resolve()
    if not source.is_file():
        raise SystemExit(f"Database not found: {source}")

    selected_policy_ids = list(dict.fromkeys(args.policies))
    selected_policy_set = set(selected_policy_ids)
    placeholders = ",".join("?" for _ in selected_policy_ids)

    connection = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row

    required_tables = {"Policies", "News", "Action", "ActionFrame"}
    available_tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_schema WHERE type = 'table'"
        )
    }
    missing = required_tables - available_tables
    if missing:
        raise SystemExit(f"Database is missing required tables: {', '.join(sorted(missing))}")

    policy_rows = list(
        connection.execute(
            f"SELECT * FROM Policies WHERE policy_id IN ({placeholders}) "
            "ORDER BY policy_id",
            selected_policy_ids,
        )
    )
    found_policy_ids = {int(row["policy_id"]) for row in policy_rows}
    not_found = selected_policy_set - found_policy_ids
    if not_found:
        raise SystemExit(f"Unknown policy IDs: {', '.join(map(str, sorted(not_found)))}")

    policy_year_bounds: dict[int, tuple[int, int]] = {}
    for row in policy_rows:
        policy_id = int(row["policy_id"])
        years = [
            int(date[:4])
            for date in (iso_date(row["start_date"]), iso_date(row["end_date"]))
            if date
        ]
        if years:
            policy_year_bounds[policy_id] = (
                min(years) - OBSERVED_WINDOW_GUARDRAIL_YEARS,
                max(years) + OBSERVED_WINDOW_GUARDRAIL_YEARS,
            )

    news_rows = list(
        connection.execute(
            f"SELECT news_id, policy_id, date, headline, source, count FROM News "
            f"WHERE policy_id IN ({placeholders}) ORDER BY policy_id, date, news_id",
            selected_policy_ids,
        )
    )
    news_by_id = {int(row["news_id"]): row for row in news_rows}

    action_rows = list(
        connection.execute(
            "SELECT a.action_id, a.policy_ids, a.org_id, a.org_qid, a.entity, "
            "a.organisation, a.date, a.action, a.action_type, a.sentiment, "
            "a.news_ids, a.actor_hierarchy_code, a.actor_hierarchy_status, "
            "f.interaction_mode, f.financial_action_family, "
            "f.financial_action_subtype, f.modality, f.status, f.direction, "
            "f.actor_role, f.target_entity, f.target_sector, f.target_market, "
            "f.instrument_or_facility, f.confidence, f.schema_version, "
            "f.created_at, f.raw_event_frame_stage "
            "FROM Action a LEFT JOIN ActionFrame f ON f.action_id = a.action_id "
            "ORDER BY a.date, a.action_id"
        )
    )

    actions_by_policy: dict[int, list[sqlite3.Row]] = defaultdict(list)
    selected_full_actions: list[tuple[sqlite3.Row, list[int], list[int]]] = []
    observed_dates: dict[int, list[str]] = defaultdict(list)
    news_action_counts: Counter[int] = Counter()

    for row in news_rows:
        date = iso_date(row["date"])
        policy_id = int(row["policy_id"])
        bounds = policy_year_bounds.get(policy_id)
        if date and (not bounds or bounds[0] <= int(date[:4]) <= bounds[1]):
            observed_dates[policy_id].append(date)

    for row in action_rows:
        policy_ids = [
            policy_id
            for policy_id in parse_int_list(row["policy_ids"])
            if policy_id in selected_policy_set
        ]
        if not policy_ids:
            continue
        news_ids = parse_int_list(row["news_ids"])
        selected_full_actions.append((row, policy_ids, news_ids))
        for policy_id in policy_ids:
            actions_by_policy[policy_id].append(row)
            date = iso_date(row["date"])
            bounds = policy_year_bounds.get(policy_id)
            if date and (not bounds or bounds[0] <= int(date[:4]) <= bounds[1]):
                observed_dates[policy_id].append(date)
        for news_id in news_ids:
            if news_id in news_by_id:
                news_action_counts[news_id] += 1

    selected_action_ids: set[int] = set()
    forced_action_ids = set(args.include_actions)
    for policy_id in selected_policy_ids:
        rows = actions_by_policy[policy_id]
        sampled = evenly_sample(rows, args.max_actions_per_policy)
        selected_action_ids.update(int(row["action_id"]) for row in sampled)
        selected_action_ids.update(
            int(row["action_id"])
            for row in rows
            if int(row["action_id"]) in forced_action_ids
        )

    exported_action_rows = [
        (row, policy_ids, news_ids)
        for row, policy_ids, news_ids in selected_full_actions
        if int(row["action_id"]) in selected_action_ids
    ]

    linked_action_ids: dict[int, list[int]] = defaultdict(list)
    for row, _, news_ids in exported_action_rows:
        action_id = int(row["action_id"])
        for news_id in news_ids:
            if news_id in news_by_id:
                linked_action_ids[news_id].append(action_id)

    policies = []
    policy_name_by_id: dict[int, str] = {}
    for row in policy_rows:
        policy_id = int(row["policy_id"])
        policy_name = clean_text(row["policy_name"])
        policy_name_by_id[policy_id] = policy_name
        dates = sorted(date for date in observed_dates[policy_id] if date)
        if len(dates) >= 20:
            last_index = len(dates) - 1
            observed_start = dates[int(last_index * OBSERVED_WINDOW_QUANTILES[0])]
            observed_end = dates[int(last_index * OBSERVED_WINDOW_QUANTILES[1])]
        else:
            observed_start = dates[0] if dates else ""
            observed_end = dates[-1] if dates else ""
        policies.append(
            {
                "id": policy_id,
                "shortName": POLICY_ALIASES.get(policy_id, policy_name),
                "name": policy_name,
                "startDate": iso_date(row["start_date"]),
                "endDate": iso_date(row["end_date"]),
                "announcementDate": iso_date(row["announcement_date"]),
                "implementationDate": iso_date(row["implementation_date"]),
                "observedStart": observed_start,
                "observedEnd": observed_end,
                "intendedEffect": clean_text(row["intended_effect"], 500),
                "actualImpact": clean_text(row["actual_impact"], 500),
                "sourceUrl": clean_text(row["source_URL"]),
            }
        )

    news_records = []
    for row in news_rows:
        news_id = int(row["news_id"])
        source_url = clean_text(row["source"])
        news_records.append(
            {
                "recordId": f"NEWS-{news_id}",
                "id": news_id,
                "policyId": int(row["policy_id"]),
                "date": iso_date(row["date"]),
                "headline": clean_text(row["headline"], 280) or "Untitled source record",
                "sourceUrl": source_url,
                "sourceLabel": domain_label(source_url),
                "retrievalCount": int(row["count"] or 0),
                "linkedActionCount": int(news_action_counts[news_id]),
                "linkedActionIds": linked_action_ids[news_id][:30],
                "provenance": {
                    "sourceTable": "News",
                    "primaryKey": "news_id",
                    "primaryValue": news_id,
                    "policyKey": "policy_id",
                    "policyValue": int(row["policy_id"]),
                    "sourceField": "source",
                    "omittedFields": ["content"],
                },
            }
        )

    action_records = []
    for row, policy_ids, news_ids in exported_action_rows:
        action_id = int(row["action_id"])
        action_records.append(
            {
                "recordId": f"ACTION-{action_id}",
                "id": action_id,
                "policyIds": policy_ids,
                "date": iso_date(row["date"]),
                "entity": clean_text(row["entity"]),
                "organisation": clean_text(row["organisation"]),
                "organisationId": clean_text(row["org_id"]),
                "organisationQid": clean_text(row["org_qid"]),
                "action": clean_text(row["action"], 420),
                "actionType": clean_text(row["action_type"]),
                "sentiment": clean_text(row["sentiment"]),
                "actorHierarchyCode": clean_text(row["actor_hierarchy_code"]),
                "actorHierarchyStatus": clean_text(row["actor_hierarchy_status"]),
                "newsIds": [news_id for news_id in news_ids if news_id in news_by_id],
                "frame": {
                    "interactionMode": clean_text(row["interaction_mode"]),
                    "family": clean_text(row["financial_action_family"]),
                    "subtype": clean_text(row["financial_action_subtype"]),
                    "modality": clean_text(row["modality"]),
                    "status": clean_text(row["status"]),
                    "direction": clean_text(row["direction"]),
                    "actorRole": clean_text(row["actor_role"]),
                    "targetEntity": clean_text(row["target_entity"]),
                    "targetSector": clean_text(row["target_sector"]),
                    "targetMarket": clean_text(row["target_market"]),
                    "instrument": clean_text(row["instrument_or_facility"]),
                    "confidence": row["confidence"],
                    "schemaVersion": clean_text(row["schema_version"]),
                    "createdAt": clean_text(row["created_at"]),
                    "pipelineStage": clean_text(row["raw_event_frame_stage"]),
                },
                "provenance": {
                    "sourceTable": "Action",
                    "primaryKey": "action_id",
                    "primaryValue": action_id,
                    "policyField": "policy_ids",
                    "policyValues": policy_ids,
                    "newsField": "news_ids",
                    "newsValues": [news_id for news_id in news_ids if news_id in news_by_id],
                    "joinedTable": "ActionFrame",
                    "joinKey": "action_id",
                },
            }
        )

    entity_aggregates: dict[str, dict[str, object]] = {}
    exported_ids = {record["id"] for record in action_records}
    for row, policy_ids, news_ids in selected_full_actions:
        organisation = clean_text(row["organisation"])
        entity = clean_text(row["entity"])
        organisation_id = clean_text(row["org_id"])
        # Prefer a normalized organisation label when the row has one. Entity
        # mentions remain aliases, rather than replacing the organisation name.
        name = organisation or organisation_id or entity
        if not name:
            continue
        key = organisation_id.casefold() if organisation_id else name.casefold()
        aggregate = entity_aggregates.setdefault(
            key,
            {
                "id": organisation_id or name,
                "name": name,
                "aliases": set(),
                "actionCount": 0,
                "newsIds": set(),
                "policyNewsIds": defaultdict(set),
                "policyCounts": Counter(),
                "actionTypes": Counter(),
                "policyActionTypes": defaultdict(Counter),
                "families": Counter(),
                "policyFamilies": defaultdict(Counter),
                "sampleActionIds": [],
                "policySampleActionIds": defaultdict(list),
            },
        )
        if entity:
            aggregate["aliases"].add(entity)
        if organisation:
            aggregate["aliases"].add(organisation)
        if organisation_id:
            aggregate["aliases"].add(organisation_id)
        aggregate["actionCount"] += 1
        aggregate["newsIds"].update(
            news_id for news_id in news_ids if news_id in news_by_id
        )
        aggregate["policyCounts"].update(policy_ids)
        action_type = clean_text(row["action_type"])
        family = clean_text(row["financial_action_family"])
        for policy_id in policy_ids:
            aggregate["policyNewsIds"][policy_id].update(
                news_id for news_id in news_ids if news_id in news_by_id
            )
        if action_type:
            aggregate["actionTypes"].update([action_type])
            for policy_id in policy_ids:
                aggregate["policyActionTypes"][policy_id].update([action_type])
        if family:
            aggregate["families"].update([family])
            for policy_id in policy_ids:
                aggregate["policyFamilies"][policy_id].update([family])
        action_id = int(row["action_id"])
        if action_id in exported_ids and len(aggregate["sampleActionIds"]) < 8:
            aggregate["sampleActionIds"].append(action_id)
        if action_id in exported_ids:
            for policy_id in policy_ids:
                policy_samples = aggregate["policySampleActionIds"][policy_id]
                if len(policy_samples) < 6:
                    policy_samples.append(action_id)

    entities = []
    for aggregate in sorted(
        entity_aggregates.values(),
        key=lambda item: (-int(item["actionCount"]), str(item["name"])),
    )[: args.max_entities]:
        policy_counts: Counter[int] = aggregate["policyCounts"]
        entities.append(
            {
                "id": aggregate["id"],
                "name": aggregate["name"],
                "aliases": sorted(aggregate["aliases"])[:8],
                "actionCount": aggregate["actionCount"],
                "linkedNewsCount": len(aggregate["newsIds"]),
                "policies": [
                    {
                        "id": policy_id,
                        "name": policy_name_by_id[policy_id],
                        "shortName": POLICY_ALIASES.get(
                            policy_id, policy_name_by_id[policy_id]
                        ),
                        "actionCount": count,
                        "linkedNewsCount": len(
                            aggregate["policyNewsIds"][policy_id]
                        ),
                        "topActionTypes": [
                            {"name": name, "count": item_count}
                            for name, item_count in aggregate[
                                "policyActionTypes"
                            ][policy_id].most_common(6)
                        ],
                        "topFamilies": [
                            {"name": name, "count": item_count}
                            for name, item_count in aggregate["policyFamilies"][
                                policy_id
                            ].most_common(6)
                        ],
                        "sampleActionIds": aggregate["policySampleActionIds"][policy_id],
                    }
                    for policy_id, count in policy_counts.most_common()
                ],
                "topActionTypes": [
                    {"name": name, "count": count}
                    for name, count in aggregate["actionTypes"].most_common(6)
                ],
                "topFamilies": [
                    {"name": name, "count": count}
                    for name, count in aggregate["families"].most_common(6)
                ],
                "sampleActionIds": aggregate["sampleActionIds"],
                "provenance": {
                    "derivedFrom": ["Action", "ActionFrame"],
                    "groupingFields": ["org_id", "organisation", "entity"],
                    "policyField": "policy_ids",
                    "actionTypeField": "action_type",
                    "familyField": "financial_action_family",
                },
            }
        )

    table_totals = {
        table: table_count(connection, table)
        for table in ("Policies", "News", "Action", "ActionFrame")
    }
    connection.close()

    payload = {
        "meta": {
            "title": "PAWS public website subset",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceDatabaseName": source.name,
            "sourceDatabaseIncluded": False,
            "policyIds": selected_policy_ids,
            "scope": "Sanitized, static research preview derived from SQLite",
            "normalization": "Timeline positions are computed in-browser from each policy's observed evidence window or documented policy window.",
            "observedWindowGuardrailYears": OBSERVED_WINDOW_GUARDRAIL_YEARS,
            "observedWindowQuantiles": list(OBSERVED_WINDOW_QUANTILES),
            "omittedFields": [
                "News.content",
                "Action.event_frame",
                "ActionFrame.raw_event_frame",
                "ActionFrame.classification_rationale",
                "ActionFrame.evidence_span",
            ],
        },
        "schema": {
            "tables": [
                {
                    "name": "Policies",
                    "databaseRows": table_totals["Policies"],
                    "exportedRows": len(policies),
                    "primaryKey": "policy_id",
                },
                {
                    "name": "News",
                    "databaseRows": table_totals["News"],
                    "exportedRows": len(news_records),
                    "primaryKey": "news_id",
                },
                {
                    "name": "Action",
                    "databaseRows": table_totals["Action"],
                    "exportedRows": len(action_records),
                    "primaryKey": "action_id",
                },
                {
                    "name": "ActionFrame",
                    "databaseRows": table_totals["ActionFrame"],
                    "exportedRows": len(action_records),
                    "primaryKey": "action_id",
                    "joinedOn": "Action.action_id",
                },
                {
                    "name": "Entity summary",
                    "databaseRows": None,
                    "exportedRows": len(entities),
                    "derivedFrom": ["Action", "ActionFrame"],
                },
            ]
        },
        "policies": policies,
        "news": news_records,
        "actions": action_records,
        "entities": entities,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Exported {len(policies)} policies, {len(news_records)} news rows, "
        f"{len(action_records)} actions/frames, and {len(entities)} entities "
        f"to {args.output}"
    )


if __name__ == "__main__":
    main()
