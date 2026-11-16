# Billig kebab

Billig kebab compares nearby kebab shops using OpenStreetMap, your own prices, verified community price reports, and estimated round-trip fuel costs. It is a static site: there is no build step, paid service, or API key.

## Run locally

Serve this folder over localhost or HTTPS so the browser can request your location. For example:

```powershell
python -m http.server 8765
```

Then open `http://localhost:8765`.

## Submit and approve prices

Choose **Logg en pris for andre** on a shop card to prepare a public GitHub issue with the restaurant, OpenStreetMap place ID, kebab type, price, and purchase date. Submitting the issue requires a GitHub account. The report is public, but does not appear in the app until a maintainer checks it, closes the issue, and adds the `verified-price` label. Unverified reports are never used in price comparisons.

The app reads up to 100 approved reports from this repository's public GitHub Issues API. Reports are matched by OpenStreetMap element ID, and the newest report for each place is used. Visitors can still enter their own price when no approved report is available. Reports can cover different kebab types, so compare like with like.

## Publish

The `Deploy static site to GitHub Pages` workflow publishes the site on pushes to `main`. Enable GitHub Pages with **GitHub Actions** as the source in the repository settings if it is not already enabled.

The app uses browser geolocation, the public Overpass API, and this repository's public GitHub Issues API. Location is not stored by the app. Driving costs are estimates based on straight-line distance, a 1.35 road-distance multiplier, and the fuel cost you enter.
