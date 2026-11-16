# Billigkebab

Billigkebab finds nearby kebab shops, compares submitted prices plus estimated round-trip fuel costs, and lets people share restaurant prices. The frontend is static and uses Firebase for accounts and reports.

## Run locally

Serve this folder over localhost or HTTPS so the browser can request your location. For example:

```powershell
python -m http.server 8765
```

Then open `http://localhost:8765`.

## Firebase setup

The app uses the Firebase project configuration supplied by the project owner in `firebase.js`.

1. Enable **Email/Password** under Firebase Authentication sign-in providers.
2. Create the default Cloud Firestore database.
3. In **Firestore Database → Rules**, add the block from `firestore-price-reports.rules` inside your existing `match /databases/{database}/documents` rules, then publish the merged rules.
4. Add `springo2008.github.io` and `localhost` to Authentication's authorized domains.
5. In **Firestore Database → Indexes**, create a collection-scope composite index for `priceReports`: `status` ascending and `createdAt` descending (as listed in `firestore.indexes.json`).
6. The first submitted price creates the `priceReports` collection automatically.

This Firebase project is also used by the Whiteboard app. Merge the price-report rules block into the existing rules; do not replace the full ruleset or the Whiteboard's permissions will be removed. Without that block, Firebase returns `permission-denied` and reports cannot be read or submitted. The Firebase web API key is included in the public frontend by design; it is not a password and does not grant database access by itself. Restrict it in Google Cloud Console to the HTTP referrers of every frontend using this Firebase project (including Whiteboard) and only the required Firebase APIs. Never publish a service-account key. Firebase usage is subject to the project's quotas and billing settings.

## Submit and approve prices

Log in or create an account, then choose **Logg en pris for andre** on a shop card. Reports are saved as `pending` in Firestore and are not used in comparisons until an administrator changes their `status` to `approved` in the Firebase console. Client-side rules prevent users from approving or editing reports. The app reads the 200 most recently submitted approved reports and uses the newest purchase date per OpenStreetMap place ID.

Reports include the kebab type, so compare like with like. Users can always enter their own temporary price in the comparison input.

## Map data and deployment

Nearby places come from OpenStreetMap's public Overpass API. If the primary instance fails, the app tries a public fallback instance. The interactive map uses Leaflet and OpenStreetMap map tiles and needs no API key; OpenStreetMap attribution is shown on the map. The app does not store geolocation. Driving costs are estimates based on straight-line distance, a 1.35 road-distance multiplier, and the fuel cost you enter.

The `Deploy static site to GitHub Pages` workflow publishes the site on pushes to `main`.
