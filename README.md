# Oil & War Stocks Lab

A standalone Python + HTML webapp for two separate workflows:

1. Estimate support and take-profit levels for oil, defense, and war-tech stocks.
2. Screen a ticker universe for names that were weak into earnings, then traded higher after earnings.

## Run it

```powershell
cd C:\Users\USER\OneDrive\Desktop\oil-war-stocks-lab
python app.py
```

The app serves at `http://127.0.0.1:8890/index.html` by default.

## What the app does

### Levels tab

- Pulls daily price history from Yahoo chart endpoints.
- Clusters recent pivot lows, rolling lows, and moving averages to estimate support.
- Clusters recent highs to estimate take-profit and stretch targets.
- Lets you compare a custom thesis like `PLTR 130 -> 160` against model-derived levels.

### Earnings Pattern tab

- Pulls price history plus Yahoo `earningsHistory` and `calendarEvents`.
- For each earnings event, checks whether the stock closed near its prior two-month low.
- Measures whether the stock then traded higher during a configurable post-earnings window.
- Ranks symbols by hit count, hit rate, and average post-earnings bounce.

## Important caveats

- This is a screening tool, not financial advice.
- The earnings study is approximate because free Yahoo earnings-history data does not expose a full institutional-grade event timeline.
- Scanning a very large universe may hit rate limits. Start with 10 to 40 symbols, then expand.

