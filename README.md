# Dad App

This repo now includes:

1. A Python + HTML web app.
2. A cross-platform Expo mobile app for Android and iPhone.

Both versions cover the same two workflows:

1. Estimate support and take-profit levels for oil, defense, and war-tech stocks.
2. Scan earnings behavior with either:
   - `Near low then bounce`
   - `Compare pre vs post`

## Web App

```powershell
cd C:\Users\USER\OneDrive\Documents\GitHub\dadapp
python app.py
```

The web app serves at `http://127.0.0.1:8890/index.html`.

## Mobile App

```powershell
cd C:\Users\USER\OneDrive\Documents\GitHub\dadapp\mobile
npm start
```

From there you can:

- Press `a` to open Android if you have an emulator/device ready.
- Open the Expo Go app on iPhone and scan the QR code.
- Use Expo/EAS later if you want installable store-style builds.

## Mobile Notes

- The mobile app is in [mobile/App.tsx](C:/Users/USER/OneDrive/Documents/GitHub/dadapp/mobile/App.tsx:1).
- It uses one Expo codebase for both Android and iPhone.
- Levels and earnings logic were ported into TypeScript under [mobile/src/services/analysis.ts](C:/Users/USER/OneDrive/Documents/GitHub/dadapp/mobile/src/services/analysis.ts:1).
- Historical earnings on mobile use `historicalearnings.com` directly rather than the blocked Yahoo earnings endpoint.

## Important caveats

- This is a screening tool, not financial advice.
- The earnings study is approximate and should be treated as a pattern filter, not a perfect event-study engine.
- Large symbol universes can still hit free-data limits, so smaller focused watchlists will feel better on mobile.
