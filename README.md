# Dad App — Oil & War Stocks Lab

A personal stock screening tool for oil, defense, and war-tech names. Estimates support floors and take-profit targets, and scans historical earnings behaviour. Includes a Python web app and an Expo mobile app.

---

## Quick Start

### Web App

```powershell
cd C:\Users\isaac\OneDrive\Documents\GitHub\dadapp
python app.py
```

Opens automatically at `http://127.0.0.1:8890/index.html`.

### Access on Phone (same Wi-Fi)

Find your PC's local IP:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' }
```

Then open `http://<your-ip>:8890/index.html` in your phone's browser.

> **Note:** Phone and PC must be on the same Wi-Fi network. If your phone is the hotspot, this won't work — connect both to a router instead.

### Mobile App (Expo)

```powershell
cd C:\Users\isaac\OneDrive\Documents\GitHub\dadapp\mobile
npm start
```

- Press `a` for Android emulator / connected device
- Scan the QR code with Expo Go on iPhone

---

## Features

### Tab 1 — Price Levels

Enter a list of stock tickers and press **Run Analysis**. Each stock gets a card showing:

| Field | What it means |
|---|---|
| **Support Floor** | The nearest price level below current price where buyers have historically stepped in |
| **Deeper Floor** | A second safety net below the main floor — watch this if the first breaks |
| **First Profit Target** | The nearest resistance level above current price — a good place to consider taking profits |
| **Stretch Target** | A more ambitious target if momentum stays strong |
| **Reward / Risk** | Potential gain ÷ potential loss. 3:1 means you could make $3 for every $1 risked |

**Price Bar** — the horizontal bar on each card shows where today's price sits between the support floor (left) and profit target (right). The green shaded region on the left is the buy zone.

**Traffic Light Verdict**
- Green — Good Setup (Reward/Risk ≥ 2:1)
- Yellow — OK Setup (1:1 – 2:1)
- Red — Risky (below 1:1)

**Buy Zone Alert** — if any stock is trading within 2% of its support floor, a banner appears at the top with those stocks highlighted. Cards also pulse with a green border. You can enable browser notifications so a popup fires automatically each time you run a scan and stocks are in the buy zone.

**Compare My Targets** — optional fields to test your own support and profit guesses against the model. Fill in the stock ticker, your support price, and your profit target to see how close your estimates are.

---

### Tab 2 — Earnings History

Scans a list of stocks to see how they have historically moved in the weeks before and after earnings reports.

| Field | What it means |
|---|---|
| **Hit Rate** | % of earnings events where the stock closed higher after reporting than at the start of the pre-earnings window |
| **Avg Post-Earnings High** | Average peak gain in the days after reporting |
| **Avg Post-Earnings Close** | Average close gain in the days after reporting |
| **Next Earnings** | Estimated next earnings date. Shown in red if within 7 days, amber if within 21 days |
| **Latest Cycle** | The most recent earnings event and how the stock moved |

Hit rate colour coding: green ≥ 60%, yellow ≥ 40%, red below 40%.

> **Important:** This uses Yahoo Finance historical data as an approximation. Useful for screening ideas — not a perfect event-study engine. Always double-check before acting.

---

## Customising the Stock Universe

Edit `universe.json` to change the preset stock groups that appear in the dropdowns.

```json
{
  "presets": [
    {
      "id": "blended",
      "name": "Oil + Defense Core",
      "symbols": ["PLTR", "LMT", "XOM", "CVX"]
    }
  ]
}
```

The `id` field is used internally. The `name` is what appears in the dropdown. You can add as many presets as you like.

---

## How Support & Take-Profit Are Calculated

**Support Floor**
1. Finds local pivot lows (bounce points) from the last 180 days
2. Adds rolling lows over 20, 60, and 120-day windows
3. Adds the 20, 50, and 200-day moving averages
4. Clusters all these levels together into zones
5. Picks the nearest zone below the current price
6. Falls back to 7% below current price if nothing is found

**Take-Profit Target**
1. Same process but looking upward — pivot highs and rolling highs
2. Picks the nearest resistance zone above current price
3. Falls back to a measured-move formula: `current + (current − deep support)`

**Reward / Risk**
`(% gain to take-profit target) ÷ (% drop to support floor)`

---

## Server Configuration

The server can be configured with environment variables:

| Variable | Default | Description |
|---|---|---|
| `OWS_PORT` | `8890` | Port to serve on |
| `OWS_BIND_HOST` | `0.0.0.0` | Network interface to bind to |
| `OWS_PUBLIC_HOST` | `127.0.0.1` | Host shown in the console URL |

Example — run on a different port:

```powershell
$env:OWS_PORT = "9000"; python app.py
```

---

## Project Structure

```
dadapp/
├── app.py           # Python backend — serves the app and all API endpoints
├── index.html       # Web app HTML structure
├── styles.css       # All styling (light + dark mode, responsive)
├── app.js           # All frontend logic — rendering, API calls, theme, alerts
├── universe.json    # Stock preset groups shown in the dropdowns
└── mobile/          # Expo React Native app (Android + iOS)
    ├── App.tsx
    └── src/
        ├── services/analysis.ts   # Levels + earnings logic in TypeScript
        ├── data/presets.ts        # Mobile preset definitions
        └── types.ts
```

---

## Version History

| Tag | What changed |
|---|---|
| `v1` | Full redesign — light/dark mode, buy zone alerts, price bar, traffic light verdict, sort by R:R |
| `v2` | Buy zone threshold tightened to 2%, mobile earnings cards, SU/PBR removed from presets |
| `v3` | Split into `index.html`, `styles.css`, `app.js` for easier maintenance |

To switch to any version: `git checkout v1` (or v2/v3). To return to latest: `git checkout main`.

---

## Caveats

- This is a **screening tool**, not financial advice.
- Support and resistance levels are model estimates based on historical price data — they are not guarantees.
- The earnings study is an approximation. Use it to filter ideas, not as a definitive signal.
- Free data sources (Yahoo Finance) can be rate-limited with large symbol lists. Keep watchlists focused for best results.
