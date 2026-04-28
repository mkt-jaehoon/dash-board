# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials


BASE_DIR = Path(__file__).resolve().parent
TEST_DIR = BASE_DIR / "TEST"
CACHE_DIR = BASE_DIR / "cache"
CACHE_FILE = CACHE_DIR / "realtime-costs.json"
CACHE_HISTORY_DIR = CACHE_DIR / "history"
SERVICE_ACCOUNT_JSON = BASE_DIR / "service-account.json"

EXTERNAL_SPREADSHEET_ID = "1Sq7wH0vl_nX7GP25rFgxS8XgzwKIdeAbxzFdRmW9I-U"
WS_REALTIME_EXT = "실시간"
TIME_SLOT_HOURS = [10, 15, 17]

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

BIGCRAFT_MEDIA = [
    ("bigcraft_meta", "빅크래프트_메타", "메타"),
    ("bigcraft_kakao", "빅크래프트_카카오", "카카오"),
    ("bigcraft_google", "빅크래프트_구글", "구글"),
    ("bigcraft_daangn", "빅크래프트_당근", "당근"),
]

MEDIA_ORDER = [
    "google_search",
    "google_pmax",
    "naver_sa",
    "meta",
    "daangn",
    "toss",
    "kakao_moment",
]

BIGCRAFT_ORDER = [key for key, _label, _sheet_label in BIGCRAFT_MEDIA]


@dataclass
class CostItem:
    key: str
    label: str
    source: str
    amount: int | None
    status: str = "ok"
    error: str | None = None


def now_kst() -> datetime:
    return datetime.now(timezone(timedelta(hours=9)))


def resolve_time_slot_kst(now: datetime | None = None) -> str:
    current = now or now_kst()
    current_seconds = current.hour * 3600 + current.minute * 60 + current.second
    nearest_hour = min(TIME_SLOT_HOURS, key=lambda hour: abs(current_seconds - hour * 3600))
    return f"{nearest_hour}시"


def parse_amount(text: str) -> int:
    match = re.search(r"(\d[\d,]*)", str(text))
    if not match:
        raise ValueError(f"amount_not_found:{text[:120]}")
    return int(match.group(1).replace(",", ""))


def run_script(script_name: str, *args: str, timeout: int = 180) -> str:
    env = {
        **os.environ,
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
    }
    result = subprocess.run(
        [sys.executable, str(TEST_DIR / script_name), *args],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        stdin=subprocess.DEVNULL,
        timeout=timeout,
        env=env,
    )
    output = (result.stdout or "") + (result.stderr or "")
    if result.returncode != 0 and not output.strip():
        raise RuntimeError(f"{script_name} failed with exit code {result.returncode}")
    return output


def collect_google() -> list[CostItem]:
    output = run_script("google_ad_dashboard.py", timeout=60)
    data = json.loads(output.strip())
    return [
        CostItem("google_search", "구글", "direct", int(float(data.get("searchSpend", 0)))),
        CostItem("google_pmax", "구글_PMAX", "direct", int(float(data.get("performanceMaxSpend", 0)))),
    ]


def collect_naver() -> CostItem:
    output = run_script("naver_ad_dashboard.py", "--value-only", timeout=30)
    return CostItem("naver_sa", "네이버SA", "direct", parse_amount(output))


def collect_meta() -> CostItem:
    output = run_script("meta_ad_dashboard.py", "--today", timeout=60)
    json_match = re.search(r"\{.*\}", output, re.DOTALL)
    if not json_match:
        raise RuntimeError(f"meta_json_not_found:{output[:200]}")
    data = json.loads(json_match.group())
    return CostItem("meta", "메타", "direct", int(float(data.get("total_spend", 0))))


def collect_daangn() -> CostItem:
    output = run_script("daangn_ad_dashboard.py", "--value-only", timeout=180)
    match = re.search(r"오늘 총 소진 비용\(VAT 포함\):\s*([\d,]+)원", output)
    if not match:
        raise RuntimeError(f"daangn_amount_not_found:{output[:200]}")
    return CostItem("daangn", "당근", "direct", parse_amount(match.group(1)))


def collect_toss() -> CostItem:
    output = run_script("toss_ad_dashboard.py", timeout=300)
    match = re.search(r'"spendValue":\s*(\d+)', output)
    if not match:
        raise RuntimeError(f"toss_amount_not_found:{output[:200]}")
    return CostItem("toss", "토스", "direct", int(match.group(1)))


def collect_kakao() -> CostItem:
    output = run_script("kakao_moment_dashboard.py", "--value-only", timeout=180)
    match = re.search(r"오늘 소진 비용:\s*([\d,]+)원", output)
    if not match:
        raise RuntimeError(f"kakao_amount_not_found:{output[:200]}")
    return CostItem("kakao_moment", "카카오모먼트", "direct", parse_amount(match.group(1)))


def get_gspread_client() -> gspread.Client:
    credentials = Credentials.from_service_account_file(
        SERVICE_ACCOUNT_JSON,
        scopes=SCOPES,
    )
    return gspread.authorize(credentials)


def normalize_ext_date(value: str) -> str:
    parts = [part.strip() for part in re.split(r"\.", value.strip()) if part.strip()]
    if len(parts) == 3:
        year, month, day = parts
        return f"{year}-{int(month):02d}-{int(day):02d}"
    return value.strip().replace(".", "-")


def collect_bigcraft(date_value: str, time_slot: str) -> list[CostItem]:
    client = get_gspread_client()
    worksheet = client.open_by_key(EXTERNAL_SPREADSHEET_ID).worksheet(WS_REALTIME_EXT)
    values = worksheet.get("A:D")

    current_date = ""
    current_time = ""
    amounts_by_media: dict[str, int] = {}
    media_by_sheet_label = {sheet_label: (key, label) for key, label, sheet_label in BIGCRAFT_MEDIA}

    for row in values:
        col_a = str(row[0]).strip() if len(row) > 0 else ""
        col_b = str(row[1]).strip() if len(row) > 1 else ""
        col_c = str(row[2]).strip() if len(row) > 2 else ""
        col_d = str(row[3]).strip() if len(row) > 3 else ""

        if col_a:
            current_date = normalize_ext_date(col_a)
        if col_b:
            current_time = col_b

        if current_date == date_value and current_time == time_slot and col_c in media_by_sheet_label:
            key, _label = media_by_sheet_label[col_c]
            amounts_by_media[key] = parse_amount(col_d)

    items: list[CostItem] = []
    for key, label, _sheet_label in BIGCRAFT_MEDIA:
        if key in amounts_by_media:
            items.append(CostItem(key, label, "bigcraft", amounts_by_media[key]))
        else:
            items.append(CostItem(key, label, "bigcraft", None, "pending", "업데이트 중"))
    return items


def safe_collect(fn: Callable[[], CostItem | list[CostItem]], fallback_key: str, label: str) -> list[CostItem]:
    try:
        result = fn()
        return result if isinstance(result, list) else [result]
    except Exception as exc:
        return [CostItem(fallback_key, label, "direct", None, "error", str(exc)[:300])]


def collect_direct_media() -> list[CostItem]:
    api_collectors: list[tuple[Callable[[], CostItem | list[CostItem]], str, str]] = [
        (collect_google, "google_search", "구글"),
        (collect_naver, "naver_sa", "네이버SA"),
        (collect_meta, "meta", "메타"),
    ]
    browser_collectors: list[tuple[Callable[[], CostItem | list[CostItem]], str, str]] = [
        (collect_daangn, "daangn", "당근"),
        (collect_toss, "toss", "토스"),
        (collect_kakao, "kakao_moment", "카카오모먼트"),
    ]

    items: list[CostItem] = []
    with ThreadPoolExecutor(max_workers=len(api_collectors)) as executor:
        futures = {
            executor.submit(safe_collect, fn, fallback_key, label): fallback_key
            for fn, fallback_key, label in api_collectors
        }
        for future in as_completed(futures):
            items.extend(future.result())

    # Browser-based collectors use Playwright/Chrome and can spike memory on a 4GB host.
    # Run them sequentially so the dashboard can share the existing automation server.
    for fn, fallback_key, label in browser_collectors:
        items.extend(safe_collect(fn, fallback_key, label))

    order_index = {key: idx for idx, key in enumerate(MEDIA_ORDER)}
    return sorted(
        items,
        key=lambda item: (
            item.amount is None,
            -(item.amount or 0),
            order_index.get(item.key, 999),
        ),
    )


def serialize_payload(direct_items: list[CostItem], bigcraft_items: list[CostItem], date_value: str, time_slot: str) -> dict:
    direct_total = sum(item.amount or 0 for item in direct_items)
    bigcraft_total = sum(item.amount or 0 for item in bigcraft_items)
    return {
        "collectedAt": now_kst().isoformat(timespec="seconds"),
        "date": date_value,
        "timeSlot": time_slot,
        "totals": {
            "direct": direct_total,
            "bigcraft": bigcraft_total,
            "all": direct_total + bigcraft_total,
        },
        "direct": [asdict(item) for item in direct_items],
        "bigcraft": [asdict(item) for item in bigcraft_items],
    }


def write_cache(payload: dict) -> None:
    payload = normalize_payload_order(payload)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    temp_file = CACHE_FILE.with_suffix(".tmp")
    temp_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_file.replace(CACHE_FILE)

    CACHE_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    history_file = CACHE_HISTORY_DIR / f"realtime-costs-{payload['date']}.json"
    temp_history_file = history_file.with_suffix(".tmp")
    temp_history_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_history_file.replace(history_file)


def normalize_payload_order(payload: dict) -> dict:
    direct_order_index = {key: idx for idx, key in enumerate(MEDIA_ORDER)}
    bigcraft_order_index = {key: idx for idx, key in enumerate(BIGCRAFT_ORDER)}

    payload["direct"] = sorted(
        payload.get("direct", []),
        key=lambda item: (
            item.get("amount") is None,
            -(item.get("amount") or 0),
            direct_order_index.get(item.get("key"), 999),
        ),
    )
    payload["bigcraft"] = sorted(
        payload.get("bigcraft", []),
        key=lambda item: bigcraft_order_index.get(item.get("key"), 999),
    )
    return payload


def read_cache(date_value: str | None = None) -> dict | None:
    if date_value:
        history_file = CACHE_HISTORY_DIR / f"realtime-costs-{date_value}.json"
        if not history_file.exists():
            return None
        return normalize_payload_order(json.loads(history_file.read_text(encoding="utf-8")))
    if not CACHE_FILE.exists():
        return None
    return normalize_payload_order(json.loads(CACHE_FILE.read_text(encoding="utf-8")))


def collect_realtime_costs(time_slot: str | None = None) -> dict:
    load_dotenv(TEST_DIR / ".env")
    date_value = now_kst().date().isoformat()
    resolved_time_slot = time_slot or resolve_time_slot_kst()

    direct_items = collect_direct_media()
    bigcraft_items = collect_bigcraft(date_value, resolved_time_slot)
    payload = serialize_payload(direct_items, bigcraft_items, date_value, resolved_time_slot)
    write_cache(payload)
    return payload


def print_payload(payload: dict) -> None:
    print(f"date={payload['date']} timeSlot={payload['timeSlot']} collectedAt={payload['collectedAt']}")
    print("[실시간 매체]")
    for item in payload["direct"]:
        amount = f"{item['amount']:,}원" if item["amount"] is not None else item["status"]
        print(f"{item['label']}: {amount}")
    print("[빅크래프트]")
    for item in payload["bigcraft"]:
        amount = f"{item['amount']:,}원" if item["amount"] is not None else item["status"]
        print(f"{item['label']}: {amount}")
    print(f"합계: {payload['totals']['all']:,}원")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--time-slot", choices=["10시", "15시", "17시"], default=None)
    parser.add_argument("--cache", action="store_true", help="Print the latest cache instead of collecting.")
    args = parser.parse_args()

    payload = read_cache() if args.cache else collect_realtime_costs(args.time_slot)
    if payload is None:
        raise SystemExit("cache file not found")
    print_payload(payload)


if __name__ == "__main__":
    main()
