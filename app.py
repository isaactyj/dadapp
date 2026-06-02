from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from statistics import mean
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen
import json
import math
import os
import re
import time
import webbrowser


HOST = os.getenv("OWS_BIND_HOST", "0.0.0.0")
PUBLIC_HOST = os.getenv("OWS_PUBLIC_HOST", "127.0.0.1")
PORT = int(os.getenv("OWS_PORT", "8890"))
APP_FILE = "index.html"
ROOT = Path(__file__).resolve().parent
PRESETS_FILE = ROOT / "universe.json"
PRICE_CACHE_SECONDS = 300
EARNINGS_CACHE_SECONDS = 21600
MAX_WORKERS = 8

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    )
}

PRICE_CACHE: dict[str, dict] = {}
SUMMARY_CACHE: dict[str, dict] = {}
EARNINGS_SITE_CACHE: dict[str, dict] = {}

FALLBACK_PRESETS = {
    "presets": [
        {
            "id": "blended",
            "name": "Oil + Defense Core",
            "description": "A blended preset for oil, defense, and war-tech names.",
            "symbols": ["PLTR", "LMT", "NOC", "RTX", "XOM", "CVX", "COP", "SLB"],
        }
    ]
}


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _safe_mean(values: list[float]) -> float | None:
    if not values:
        return None
    return mean(values)


def _round_or_none(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _pct_change(current: float | None, reference: float | None) -> float | None:
    if current in (None, 0) or reference in (None, 0):
        return None
    return ((float(current) / float(reference)) - 1.0) * 100.0


def _normalize_symbols(symbols: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for symbol in symbols:
        normalized = symbol.strip().upper()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(normalized)
    return cleaned


def _unwrap_raw(value):
    if isinstance(value, dict):
        return value.get("raw")
    return value


def _load_presets() -> dict:
    try:
        payload = json.loads(PRESETS_FILE.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("presets"), list):
            return payload
    except Exception:
        pass
    return FALLBACK_PRESETS


def _request_json(url: str) -> dict:
    request = Request(url, headers=REQUEST_HEADERS)
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def _request_text(url: str) -> str:
    request = Request(url, headers=REQUEST_HEADERS)
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="ignore")


def _build_records(result: dict) -> list[dict]:
    timestamps = result.get("timestamp") or []
    quote_sets = result.get("indicators", {}).get("quote", [])
    if not quote_sets:
        return []

    quotes = quote_sets[0]
    opens = quotes.get("open", [])
    highs = quotes.get("high", [])
    lows = quotes.get("low", [])
    closes = quotes.get("close", [])
    volumes = quotes.get("volume", [])
    records: list[dict] = []

    for index, timestamp in enumerate(timestamps):
        close = closes[index] if index < len(closes) else None
        if close is None:
            continue
        records.append(
            {
                "timestamp": int(timestamp),
                "date": datetime.fromtimestamp(int(timestamp), tz=timezone.utc).strftime("%Y-%m-%d"),
                "open": opens[index] if index < len(opens) else None,
                "high": highs[index] if index < len(highs) else close,
                "low": lows[index] if index < len(lows) else close,
                "close": close,
                "volume": volumes[index] if index < len(volumes) else None,
            }
        )
    return records


def _fetch_chart(symbol: str, range_value: str = "18mo", force_refresh: bool = False) -> dict:
    symbol = symbol.upper()
    cache_key = f"{symbol}:{range_value}"
    cached = PRICE_CACHE.get(cache_key)
    now = time.time()
    if cached and not force_refresh and now < cached["expires_at"]:
        return cached["value"]

    payload = None
    last_error: Exception | None = None
    base_urls = [
        "https://query1.finance.yahoo.com/v8/finance/chart",
        "https://query2.finance.yahoo.com/v8/finance/chart",
    ]

    for base_url in base_urls:
        try:
            url = (
                f"{base_url}/{quote(symbol)}"
                f"?interval=1d&range={range_value}&includePrePost=false&events=div%2Csplits"
            )
            payload = _request_json(url)
            break
        except HTTPError as exc:
            last_error = exc
            if exc.code != 404:
                raise
        except URLError as exc:
            last_error = exc

    if payload is None:
        raise RuntimeError(f"No chart data returned for {symbol}: {last_error}")

    result = payload.get("chart", {}).get("result", [])
    if not result:
        error = payload.get("chart", {}).get("error")
        raise RuntimeError(f"No chart result for {symbol}: {error}")

    primary = result[0]
    meta = primary.get("meta", {})
    records = _build_records(primary)
    if not records:
        raise RuntimeError(f"No pricing history found for {symbol}")

    value = {"meta": meta, "records": records}
    PRICE_CACHE[cache_key] = {"expires_at": now + PRICE_CACHE_SECONDS, "value": value}
    return value


def _fetch_summary_modules(symbol: str, force_refresh: bool = False) -> dict:
    symbol = symbol.upper()
    cached = SUMMARY_CACHE.get(symbol)
    now = time.time()
    if cached and not force_refresh and now < cached["expires_at"]:
        return cached["value"]

    payload = None
    last_error: Exception | None = None
    base_urls = [
        "https://query1.finance.yahoo.com/v10/finance/quoteSummary",
        "https://query2.finance.yahoo.com/v10/finance/quoteSummary",
    ]

    for base_url in base_urls:
        try:
            url = (
                f"{base_url}/{quote(symbol)}"
                "?modules=price,calendarEvents,earningsHistory&formatted=false"
            )
            payload = _request_json(url)
            break
        except HTTPError as exc:
            last_error = exc
            if exc.code != 404:
                raise
        except URLError as exc:
            last_error = exc

    if payload is None:
        raise RuntimeError(f"No summary data returned for {symbol}: {last_error}")

    result = payload.get("quoteSummary", {}).get("result", [])
    if not result:
        error = payload.get("quoteSummary", {}).get("error")
        raise RuntimeError(f"No quoteSummary result for {symbol}: {error}")

    value = result[0]
    SUMMARY_CACHE[symbol] = {"expires_at": now + EARNINGS_CACHE_SECONDS, "value": value}
    return value


def _estimate_next_earnings_date(history_dates: list[datetime]) -> str | None:
    if not history_dates:
        return None
    if len(history_dates) == 1:
        estimated = history_dates[0].timestamp() + 90 * 86400
        return "~" + datetime.fromtimestamp(estimated, tz=timezone.utc).strftime("%Y-%m-%d")

    gaps = []
    for current, previous in zip(history_dates, history_dates[1:]):
        gaps.append((current - previous).days)
    avg_gap = round(sum(gaps[:4]) / len(gaps[:4])) if gaps else 90
    estimated = history_dates[0].timestamp() + avg_gap * 86400
    return "~" + datetime.fromtimestamp(estimated, tz=timezone.utc).strftime("%Y-%m-%d")


def _parse_mdy_date(value: str) -> datetime | None:
    try:
        return datetime.strptime(value.strip(), "%m/%d/%Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _fetch_historical_earnings_site(symbol: str, force_refresh: bool = False) -> dict:
    symbol = symbol.upper()
    cached = EARNINGS_SITE_CACHE.get(symbol)
    now = time.time()
    if cached and not force_refresh and now < cached["expires_at"]:
        return cached["value"]

    candidate_urls = [
        f"https://www.historicalearnings.com/{symbol.lower()}.html",
        f"https://www.historicalearnings.com/{symbol.lower()}-historical-earnings.html",
    ]

    html = None
    last_error: Exception | None = None
    for url in candidate_urls:
        try:
            html = _request_text(url)
            break
        except Exception as exc:
            last_error = exc

    if html is None:
        raise RuntimeError(f"Could not load historical earnings page for {symbol}: {last_error}")

    marker = "Historical Earnings EPS"
    marker_index = html.find(marker)
    if marker_index == -1:
        marker = "Historical Earnings</td>"
        marker_index = html.find(marker)
    if marker_index == -1:
        raise RuntimeError(f"Historical earnings table not found for {symbol}")

    table_start = html.find("<table", marker_index)
    table_end = html.find("</table>", table_start)
    if table_start == -1 or table_end == -1:
        raise RuntimeError(f"Historical earnings rows not found for {symbol}")

    table_html = html[table_start:table_end]
    row_matches = re.findall(
        r"<tr><td[^>]*>([^<]+)</td><td[^>]*>([^<]+)</td><td[^>]*>([^<]+)</td></tr>",
        table_html,
        flags=re.IGNORECASE,
    )

    rows = []
    for period, earnings_date, value in row_matches:
        parsed_date = _parse_mdy_date(earnings_date)
        if not parsed_date:
            continue
        rows.append(
            {
                "period": period.strip(),
                "earnings_date": parsed_date.strftime("%Y-%m-%d"),
                "timestamp": int(parsed_date.timestamp()),
                "eps": value.strip(),
            }
        )

    if not rows:
        raise RuntimeError(f"No historical earnings rows parsed for {symbol}")

    history_dates = [
        datetime.fromtimestamp(int(row["timestamp"]), tz=timezone.utc)
        for row in rows
    ]
    value = {
        "history": rows,
        "next_earnings_date": _estimate_next_earnings_date(history_dates),
        "source": "historicalearnings.com",
    }
    EARNINGS_SITE_CACHE[symbol] = {"expires_at": now + EARNINGS_CACHE_SECONDS, "value": value}
    return value


def _moving_average(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    return _safe_mean(values[-window:])


def _find_pivots(records: list[dict], field: str, radius: int, mode: str) -> list[float]:
    prices: list[float] = []
    for index in range(radius, len(records) - radius):
        center = records[index].get(field)
        if center is None:
            continue
        neighbors = [records[neighbor].get(field) for neighbor in range(index - radius, index + radius + 1) if neighbor != index]
        neighbors = [float(value) for value in neighbors if value is not None]
        if not neighbors:
            continue
        center_value = float(center)
        if mode == "low" and all(center_value <= value for value in neighbors):
            prices.append(center_value)
        if mode == "high" and all(center_value >= value for value in neighbors):
            prices.append(center_value)
    return prices


def _cluster_levels(levels: list[float], tolerance_pct: float = 0.03) -> list[float]:
    if not levels:
        return []
    sorted_levels = sorted(float(level) for level in levels if level is not None and level > 0)
    clusters: list[list[float]] = [[sorted_levels[0]]]
    for level in sorted_levels[1:]:
        anchor = _safe_mean(clusters[-1]) or clusters[-1][-1]
        if abs(level - anchor) / anchor <= tolerance_pct:
            clusters[-1].append(level)
        else:
            clusters.append([level])
    return [round(_safe_mean(cluster) or cluster[-1], 4) for cluster in clusters]


def _pick_nearest_below(current_price: float, levels: list[float], skip: set[float] | None = None) -> float | None:
    blocked = skip or set()
    candidates = [level for level in levels if level < current_price and level not in blocked]
    return max(candidates) if candidates else None


def _pick_nearest_above(current_price: float, levels: list[float], skip: set[float] | None = None) -> float | None:
    blocked = skip or set()
    candidates = [level for level in levels if level > current_price and level not in blocked]
    return min(candidates) if candidates else None


def _build_thesis_check(symbol: str, support_level: float, take_profit_level: float, thesis: dict | None) -> dict | None:
    if not thesis:
        return None
    thesis_symbol = (thesis.get("symbol") or "").upper()
    if thesis_symbol != symbol:
        return None

    support_guess = thesis.get("support")
    take_profit_guess = thesis.get("take_profit")
    if support_guess in (None, 0) or take_profit_guess in (None, 0):
        return None

    support_gap = _pct_change(support_guess, support_level)
    target_gap = _pct_change(take_profit_guess, take_profit_level)
    support_match = abs((support_guess - support_level) / support_level) * 100.0 <= 6.0 if support_level else False
    target_match = abs((take_profit_guess - take_profit_level) / take_profit_level) * 100.0 <= 6.0 if take_profit_level else False

    return {
        "symbol": thesis_symbol,
        "support_guess": _round_or_none(support_guess),
        "take_profit_guess": _round_or_none(take_profit_guess),
        "support_gap_pct": _round_or_none(support_gap),
        "target_gap_pct": _round_or_none(target_gap),
        "support_matches_model": support_match,
        "target_matches_model": target_match,
    }


def _compute_levels(symbol: str, chart: dict, thesis: dict | None = None) -> dict:
    meta = chart["meta"]
    records = chart["records"]
    closes = [float(record["close"]) for record in records if record["close"] is not None]
    highs = [float(record["high"]) for record in records if record["high"] is not None]
    lows = [float(record["low"]) for record in records if record["low"] is not None]
    volumes = [float(record["volume"]) for record in records if record["volume"] not in (None, 0)]

    current_price = meta.get("regularMarketPrice")
    if current_price is None:
        current_price = closes[-1]
    current_price = float(current_price)

    sma20 = _moving_average(closes, 20)
    sma50 = _moving_average(closes, 50)
    sma200 = _moving_average(closes, 200)

    pivot_lows = _find_pivots(records[-180:], "low", radius=3, mode="low")
    pivot_highs = _find_pivots(records[-180:], "high", radius=3, mode="high")

    rolling_supports = [
        min(lows[-20:]) if len(lows) >= 20 else None,
        min(lows[-60:]) if len(lows) >= 60 else None,
        min(lows[-120:]) if len(lows) >= 120 else None,
        sma20,
        sma50,
        sma200,
    ]
    rolling_resistances = [
        max(highs[-20:]) if len(highs) >= 20 else None,
        max(highs[-60:]) if len(highs) >= 60 else None,
        max(highs[-120:]) if len(highs) >= 120 else None,
        max(highs[-252:]) if len(highs) >= 252 else max(highs),
    ]

    support_candidates = _cluster_levels([*pivot_lows, *[value for value in rolling_supports if value is not None]])
    resistance_candidates = _cluster_levels([*pivot_highs, *[value for value in rolling_resistances if value is not None]])

    support_level = _pick_nearest_below(current_price, support_candidates) or current_price * 0.93
    deep_support = _pick_nearest_below(current_price, support_candidates, skip={support_level}) or support_level * 0.93
    take_profit_level = _pick_nearest_above(current_price, resistance_candidates) or max(current_price * 1.1, current_price + (current_price - deep_support))
    stretch_target = _pick_nearest_above(current_price, resistance_candidates, skip={take_profit_level}) or max(
        current_price * 1.18,
        current_price + 2.0 * max(current_price - support_level, 0.01),
    )

    risk_pct = _pct_change(current_price, support_level)
    reward_pct = _pct_change(take_profit_level, current_price)
    reward_to_risk = None
    if risk_pct not in (None, 0) and reward_pct is not None:
        risk_abs = abs(risk_pct)
        if risk_abs > 0:
            reward_to_risk = reward_pct / risk_abs

    volume_ratio = None
    if len(volumes) >= 21:
        trailing = volumes[-21:-1]
        trailing_mean = _safe_mean(trailing)
        if trailing_mean not in (None, 0):
            volume_ratio = volumes[-1] / trailing_mean

    thesis_check = _build_thesis_check(symbol, support_level, take_profit_level, thesis)

    return {
        "symbol": symbol,
        "name": meta.get("shortName") or meta.get("longName") or symbol,
        "price": _round_or_none(current_price),
        "currency": meta.get("currency") or "USD",
        "support_level": _round_or_none(support_level),
        "deep_support": _round_or_none(deep_support),
        "take_profit_level": _round_or_none(take_profit_level),
        "stretch_target": _round_or_none(stretch_target),
        "sma20": _round_or_none(sma20),
        "sma50": _round_or_none(sma50),
        "sma200": _round_or_none(sma200),
        "risk_to_support_pct": _round_or_none(risk_pct),
        "reward_to_tp_pct": _round_or_none(reward_pct),
        "reward_risk_ratio": _round_or_none(reward_to_risk),
        "volume_ratio": _round_or_none(volume_ratio),
        "thesis_check": thesis_check,
        "last_close_date": records[-1]["date"],
    }


def _nearest_record_index_on_or_before(records: list[dict], event_timestamp: int) -> int | None:
    chosen = None
    for index, record in enumerate(records):
        if int(record["timestamp"]) <= event_timestamp + 86400:
            chosen = index
        else:
            break
    return chosen


def _build_earnings_cycle(
    records: list[dict],
    event_timestamp: int,
    pre_days: int,
    post_days: int,
    mode: str,
) -> dict | None:
    event_index = _nearest_record_index_on_or_before(records, event_timestamp)
    if event_index is None or event_index < 10 or event_index >= len(records) - 2:
        return None

    pre_slice = records[max(0, event_index - pre_days + 1): event_index + 1]
    post_slice = records[event_index + 1: min(len(records), event_index + 1 + post_days)]
    minimum_post_days = max(1, min(3, post_days))
    if len(pre_slice) < min(12, pre_days // 2) or len(post_slice) < minimum_post_days:
        return None

    pre_low = min(float(record["low"]) for record in pre_slice if record["low"] is not None)
    pre_anchor_close = float(pre_slice[0]["close"])
    pre_close = float(pre_slice[-1]["close"])
    post_high = max(float(record["high"]) for record in post_slice if record["high"] is not None)
    post_close = float(post_slice[-1]["close"])

    low_gap = _pct_change(pre_close, pre_low)
    pre_to_event = _pct_change(pre_close, pre_anchor_close)
    bounce_high = _pct_change(post_high, pre_close)
    bounce_close = _pct_change(post_close, pre_close)
    pre_to_post_high = _pct_change(post_high, pre_anchor_close)
    pre_to_post_close = _pct_change(post_close, pre_anchor_close)
    if low_gap is None or bounce_high is None or bounce_close is None:
        return None

    qualified = pre_to_post_close is not None

    return {
        "earnings_date": datetime.fromtimestamp(event_timestamp, tz=timezone.utc).strftime("%Y-%m-%d"),
        "pre_anchor_close": _round_or_none(pre_anchor_close),
        "event_close": _round_or_none(pre_close),
        "two_month_low": _round_or_none(pre_low),
        "distance_from_two_month_low_pct": _round_or_none(low_gap),
        "pre_to_event_return_pct": _round_or_none(pre_to_event),
        "post_high_return_pct": _round_or_none(bounce_high),
        "post_close_return_pct": _round_or_none(bounce_close),
        "pre_to_post_high_return_pct": _round_or_none(pre_to_post_high),
        "pre_to_post_close_return_pct": _round_or_none(pre_to_post_close),
        "qualified": qualified,
    }


def _scan_earnings_pattern(
    symbol: str,
    pre_days: int,
    post_days: int,
    mode: str,
    force_refresh: bool = False,
) -> dict:
    chart = _fetch_chart(symbol, range_value="2y", force_refresh=force_refresh)
    meta = chart["meta"]
    records = chart["records"]

    next_earnings_date = None
    history: list[dict] = []
    history_source = "unknown"
    summary_error = None
    try:
        summary = _fetch_summary_modules(symbol, force_refresh=force_refresh)
        history = summary.get("earningsHistory", {}).get("history", [])
        history_source = "Yahoo Finance"
        earnings_dates = summary.get("calendarEvents", {}).get("earnings", {}).get("earningsDate", [])
        if earnings_dates:
            next_earnings_date = earnings_dates[0].get("fmt") or datetime.fromtimestamp(
                int(_unwrap_raw(earnings_dates[0])), tz=timezone.utc
            ).strftime("%Y-%m-%d")
    except Exception as exc:
        summary_error = str(exc)

    if not history:
        fallback = _fetch_historical_earnings_site(symbol, force_refresh=force_refresh)
        history = fallback.get("history", [])
        next_earnings_date = next_earnings_date or fallback.get("next_earnings_date")
        history_source = fallback.get("source", "historicalearnings.com")

    cycles: list[dict] = []
    for item in history:
        event_timestamp = (
            _unwrap_raw(item.get("quarter"))
            or _unwrap_raw(item.get("date"))
            or item.get("timestamp")
        )
        if not isinstance(event_timestamp, (int, float)):
            continue
        cycle = _build_earnings_cycle(records, int(event_timestamp), pre_days, post_days, mode)
        if cycle:
            cycles.append(cycle)

    cycles.sort(key=lambda cycle: cycle["earnings_date"], reverse=True)
    qualified_cycles = [cycle for cycle in cycles if cycle["qualified"]]
    hit_rate = (len(qualified_cycles) / len(cycles)) * 100.0 if cycles else 0.0
    if mode == "prepost":
        avg_bounce = _safe_mean(
            [float(cycle["pre_to_post_high_return_pct"]) for cycle in cycles if cycle["pre_to_post_high_return_pct"] is not None]
        )
        avg_close = _safe_mean(
            [float(cycle["pre_to_post_close_return_pct"]) for cycle in cycles if cycle["pre_to_post_close_return_pct"] is not None]
        )
    else:
        avg_bounce = _safe_mean([float(cycle["post_high_return_pct"]) for cycle in cycles if cycle["post_high_return_pct"] is not None])
        avg_close = _safe_mean([float(cycle["post_close_return_pct"]) for cycle in cycles if cycle["post_close_return_pct"] is not None])

    current_price = meta.get("regularMarketPrice")
    if current_price is None and records:
        current_price = records[-1]["close"]

    return {
        "symbol": symbol,
        "name": meta.get("shortName") or meta.get("longName") or symbol,
        "price": _round_or_none(current_price),
        "currency": meta.get("currency") or "USD",
        "next_earnings_date": next_earnings_date,
        "events_tested": len(cycles),
        "pattern_hits": len(qualified_cycles),
        "hit_rate_pct": _round_or_none(hit_rate),
        "avg_post_high_return_pct": _round_or_none(avg_bounce),
        "avg_post_close_return_pct": _round_or_none(avg_close),
        "latest_cycle": cycles[0] if cycles else None,
        "qualifying_cycles": qualified_cycles[:4],
        "score": _round_or_none((hit_rate / 100.0) * (avg_bounce or 0) * math.sqrt(max(len(cycles), 1)), 4),
        "history_source": history_source,
        "history_source_warning": summary_error,
        "scan_mode": mode,
    }


def get_levels_payload(symbols: list[str], thesis: dict | None = None, force_refresh: bool = False) -> dict:
    requested = _normalize_symbols(symbols)
    if not requested:
        preset_symbols = _load_presets().get("presets", [{}])[0].get("symbols", [])
        requested = _normalize_symbols(preset_symbols)

    results: list[dict] = []
    errors: list[dict] = []
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(requested) or 1)) as executor:
        futures = {executor.submit(_fetch_chart, symbol, "18mo", force_refresh): symbol for symbol in requested}
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                chart = future.result()
                results.append(_compute_levels(symbol, chart, thesis))
            except Exception as exc:
                errors.append({"symbol": symbol, "error": str(exc)})

    results.sort(key=lambda item: (item.get("reward_risk_ratio") or -99), reverse=True)
    return {
        "mode": "levels",
        "symbols": requested,
        "results": results,
        "errors": errors,
        "last_updated": _now_iso(),
        "refresh_seconds": PRICE_CACHE_SECONDS,
    }


def get_earnings_payload(
    symbols: list[str],
    pre_days: int,
    post_days: int,
    mode: str,
    force_refresh: bool = False,
) -> dict:
    requested = _normalize_symbols(symbols)
    if not requested:
        preset_symbols = _load_presets().get("presets", [{}])[0].get("symbols", [])
        requested = _normalize_symbols(preset_symbols)

    scans: list[dict] = []
    errors: list[dict] = []
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(requested) or 1)) as executor:
        futures = {
            executor.submit(
                _scan_earnings_pattern,
                symbol,
                pre_days,
                post_days,
                mode,
                force_refresh,
            ): symbol
            for symbol in requested
        }
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                scans.append(future.result())
            except Exception as exc:
                errors.append({"symbol": symbol, "error": str(exc)})

    scans = [scan for scan in scans if scan.get("events_tested", 0) > 0]
    scans.sort(
        key=lambda item: (
            item.get("pattern_hits", 0),
            item.get("hit_rate_pct", 0) or 0,
            item.get("avg_post_high_return_pct", 0) or 0,
        ),
        reverse=True,
    )
    return {
        "mode": "earnings-pattern",
        "symbols": requested,
        "results": scans,
        "errors": errors,
        "filters": {
            "pre_days": pre_days,
            "post_days": post_days,
            "mode": mode,
        },
        "last_updated": _now_iso(),
        "refresh_seconds": PRICE_CACHE_SECONDS,
    }


class OilWarStocksHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/config":
            self.handle_config_api()
            return
        if parsed.path == "/api/levels":
            self.handle_levels_api(parsed)
            return
        if parsed.path == "/api/earnings-pattern":
            self.handle_earnings_api(parsed)
            return
        if parsed.path == "/":
            self.path = f"/{APP_FILE}"
        super().do_GET()

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_config_api(self) -> None:
        self._send_json(
            200,
            {
                "presets": _load_presets().get("presets", []),
                "last_updated": _now_iso(),
            },
        )

    def handle_levels_api(self, parsed) -> None:
        params = parse_qs(parsed.query)
        symbols = [part for part in params.get("symbols", [""])[0].split(",") if part.strip()]
        force_refresh = params.get("refresh", ["0"])[0] == "1"
        thesis_symbol = params.get("thesis_symbol", [""])[0].strip().upper()

        thesis = None
        if thesis_symbol:
            try:
                thesis = {
                    "symbol": thesis_symbol,
                    "support": float(params.get("thesis_support", [""])[0]),
                    "take_profit": float(params.get("thesis_take_profit", [""])[0]),
                }
            except ValueError:
                thesis = {"symbol": thesis_symbol, "support": None, "take_profit": None}

        try:
            self._send_json(200, get_levels_payload(symbols, thesis=thesis, force_refresh=force_refresh))
        except Exception as exc:
            self._send_json(
                502,
                {
                    "error": str(exc),
                    "last_updated": _now_iso(),
                },
            )

    def handle_earnings_api(self, parsed) -> None:
        params = parse_qs(parsed.query)
        symbols = [part for part in params.get("symbols", [""])[0].split(",") if part.strip()]
        force_refresh = params.get("refresh", ["0"])[0] == "1"
        mode = "prepost"

        def _int_param(name: str, default: int) -> int:
            try:
                return int(params.get(name, [str(default)])[0])
            except ValueError:
                return default

        def _float_param(name: str, default: float) -> float:
            try:
                return float(params.get(name, [str(default)])[0])
            except ValueError:
                return default

        try:
            payload = get_earnings_payload(
                symbols,
                pre_days=max(20, _int_param("pre_days", 42)),
                post_days=max(1, _int_param("post_days", 20)),
                mode=mode,
                force_refresh=force_refresh,
            )
            self._send_json(200, payload)
        except Exception as exc:
            self._send_json(
                502,
                {
                    "error": str(exc),
                    "last_updated": _now_iso(),
                },
            )


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def main() -> None:
    os.chdir(ROOT)
    local_url = f"http://127.0.0.1:{PORT}/{APP_FILE}"
    public_url = f"http://{PUBLIC_HOST}:{PORT}/{APP_FILE}"
    auto_open_browser = os.getenv("OWS_OPEN_BROWSER", "1") == "1"

    if auto_open_browser:
        try:
            webbrowser.open(local_url)
        except Exception:
            pass

    print(f"Serving {APP_FILE} on {HOST}:{PORT}")
    print(f"Local URL:  {local_url}")
    print(f"Public URL: {public_url}")
    print("Levels view uses price structure from Yahoo chart data.")
    print("Earnings pattern view approximates pre-earnings lows and post-earnings bounces from Yahoo earningsHistory.")

    server = ReusableThreadingHTTPServer((HOST, PORT), OilWarStocksHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
