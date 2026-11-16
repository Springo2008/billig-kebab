import "./pricing.js";
import "./reports.js";
import {
  auth,
  createUserWithEmailAndPassword,
  getApprovedPriceReports,
  onAuthStateChanged,
  savePriceReport,
  signInWithEmailAndPassword,
  signOut,
} from "./firebase.js";

const BilligKebabPricing = window.BilligKebabPricing;
const BilligKebabReports = window.BilligKebabReports;

(function () {
  "use strict";

  const OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://ovp.dresel.systems/api/interpreter",
  ];
  const elements = {
    authClose: document.getElementById("auth-close-button"),
    authError: document.getElementById("auth-error"),
    authForm: document.getElementById("auth-form"),
    authLogout: document.getElementById("auth-logout-button"),
    authOpen: document.getElementById("auth-open-button"),
    authPanel: document.getElementById("auth-panel"),
    authSubmit: document.getElementById("auth-submit-button"),
    authTitle: document.getElementById("auth-title"),
    authToggle: document.getElementById("auth-toggle-button"),
    authUser: document.getElementById("auth-user"),
    comparison: document.getElementById("comparison"),
    emptyState: document.getElementById("empty-state"),
    findButton: document.getElementById("find-button"),
    fuelCost: document.getElementById("fuel-cost"),
    map: document.getElementById("shop-map"),
    mapSection: document.getElementById("map-section"),
    mapStatus: document.getElementById("map-status"),
    radius: document.getElementById("radius-select"),
    shopList: document.getElementById("shop-list"),
    status: document.getElementById("status-message"),
  };

  let shops = [];
  const shopPrices = new Map();
  let communityPrices = new Map();
  let communityPricesLoaded = false;
  let communityPricesPromise = null;
  let currentPosition = null;
  let currentUser = null;
  let isRegistering = false;
  let mapInstance = null;
  let mapMarkers = null;
  let activeSearchId = 0;
  let requestController = null;

  function setStatus(message, kind) {
    elements.status.textContent = message;
    if (kind) {
      elements.status.dataset.kind = kind;
    } else {
      delete elements.status.dataset.kind;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: "NOK",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function formatDistance(distanceKm) {
    return new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }).format(distanceKm);
  }

  function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const deltaLat = radians(lat2 - lat1);
    const deltaLon = radians(lon2 - lon1);
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getElementCoordinates(element) {
    if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      return { lat: element.lat, lon: element.lon };
    }
    if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
      return element.center;
    }
    return null;
  }

  function getAddress(tags) {
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const city = tags["addr:city"];
    return cleanLine([street, city].filter(Boolean).join(", ")).slice(0, 200) || "Adresse ikke registrert";
  }

  function getManualPrice(shopId) {
    const rawPrice = shopPrices.get(shopId);
    if (rawPrice === undefined || rawPrice.trim() === "") {
      return null;
    }
    const price = Number(rawPrice);
    return Number.isInteger(price) && price >= 0 && price <= 9999 ? price : null;
  }

  function getPrice(shopId) {
    const manualPrice = getManualPrice(shopId);
    if (manualPrice !== null) {
      return manualPrice;
    }
    const report = communityPrices.get(shopId);
    return report ? report.price : null;
  }

  function loadCommunityPrices() {
    if (communityPricesLoaded) {
      return Promise.resolve();
    }
    if (!communityPricesPromise) {
      communityPricesPromise = getApprovedPriceReports()
        .then((reports) => {
          communityPrices = BilligKebabReports.latestApprovedReports(reports);
          communityPricesLoaded = true;
        })
        .catch((error) => {
          communityPricesPromise = null;
          throw error;
        });
    }
    return communityPricesPromise;
  }

  function localDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatReportDate(value) {
    return new Intl.DateTimeFormat("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00.000Z`));
  }

  function cleanLine(value) {
    return String(value).replace(/[\r\n\u0000-\u001f]+/g, " ").trim();
  }

  function getFuelCost() {
    if (elements.fuelCost.value.trim() === "") {
      return null;
    }
    const value = Number(elements.fuelCost.value);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  }

  function makeOverpassQuery(position, radius) {
    const { latitude, longitude } = position.coords;
    const area = `(around:${radius},${latitude},${longitude})`;
    return `[out:json][timeout:25];(nwr${area}["cuisine"~"kebab|kebap|doner|döner|shawarma",i];nwr${area}["name"~"kebab|kebap|doner|döner|shawarma",i];);out center tags;`;
  }

  async function requestOverpass(query, signal) {
    let lastError = null;

    for (const endpoint of OVERPASS_URLS) {
      if (signal.aborted) {
        throw new DOMException("Søket ble avbrutt.", "AbortError");
      }

      const requestController = new AbortController();
      const cancelRequest = () => requestController.abort();
      const timeoutId = setTimeout(cancelRequest, 12000);
      signal.addEventListener("abort", cancelRequest, { once: true });

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: `data=${encodeURIComponent(query)}`,
          signal: requestController.signal,
        });
        if (!response.ok) {
          throw new Error(`${endpoint} svarte med ${response.status}.`);
        }

        const data = await response.json();
        if (!Array.isArray(data.elements)) {
          throw new Error("Karttjenesten returnerte et ugyldig svar.");
        }
        return data;
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
        lastError = error;
      } finally {
        clearTimeout(timeoutId);
        signal.removeEventListener("abort", cancelRequest);
      }
    }

    const reason = lastError && lastError.name === "AbortError"
      ? "forespørselen tok for lang tid"
      : lastError && lastError.message;
    throw new Error(`Begge OpenStreetMap-karttjenestene feilet${reason ? `: ${reason}` : "."}`);
  }

  function normalizeShops(elementsFromApi, position) {
    const uniqueShops = new Map();

    for (const element of elementsFromApi) {
      if (
        !element
        || typeof element !== "object"
        || !["node", "way", "relation"].includes(element.type)
        || !Number.isSafeInteger(element.id)
        || element.id <= 0
      ) {
        continue;
      }

      const tags = element.tags && typeof element.tags === "object" ? element.tags : {};
      const coordinates = getElementCoordinates(element);
      if (
        !coordinates
        || coordinates.lat < -90
        || coordinates.lat > 90
        || coordinates.lon < -180
        || coordinates.lon > 180
      ) {
        continue;
      }

      const id = `${element.type}/${element.id}`;
      const rawName = [tags.name, tags["name:nb"]].find((name) => typeof name === "string" && name.trim());
      const distanceKm = haversineDistanceKm(
        position.coords.latitude,
        position.coords.longitude,
        coordinates.lat,
        coordinates.lon,
      );
      uniqueShops.set(id, {
        id,
        name: cleanLine(rawName || "Kebabsted uten navn").slice(0, 120),
        address: getAddress(tags),
        cuisine: typeof tags.cuisine === "string" ? cleanLine(tags.cuisine).slice(0, 100) : "",
        distanceKm,
        lat: coordinates.lat,
        lon: coordinates.lon,
      });
    }

    return [...uniqueShops.values()].sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async function searchNearby(position) {
    if (requestController) {
      requestController.abort();
    }
    requestController = new AbortController();
    const { signal } = requestController;
    const searchId = ++activeSearchId;
    const query = makeOverpassQuery(position, Number(elements.radius.value));
    const communityPromise = loadCommunityPrices().then(() => null).catch((error) => error);

    shops = [];
    elements.findButton.disabled = true;
    elements.findButton.querySelector("span").textContent = "Søker …";
    setStatus("Søker etter kebabsteder i OpenStreetMap …");
    elements.comparison.hidden = true;
    elements.shopList.replaceChildren();
    elements.emptyState.hidden = true;
    elements.mapSection.hidden = true;

    try {
      const data = await requestOverpass(query, signal);
      shops = normalizeShops(data.elements, position);
      renderResults();

      if (shops.length === 0) {
        setStatus("Fant ingen kebabsteder i området. Prøv en større søkeavstand.", "error");
        elements.emptyState.hidden = false;
        elements.emptyState.querySelector("strong").textContent = "Ingen steder funnet i dette området.";
        elements.emptyState.querySelector("span").textContent = "Prøv å utvide søkeavstanden eller søk igjen senere.";
      } else {
        setStatus(`Fant ${shops.length} ${shops.length === 1 ? "sted" : "steder"} — henter godkjente prisrapporter …`, "success");
        communityPromise.then((error) => {
          if (signal.aborted || searchId !== activeSearchId || shops.length === 0) {
            return;
          }
          if (error) {
            const message = error.code === "permission-denied"
              ? "Firestore-reglene mangler tilgang til godkjente prisrapporter. Se oppsettet i README."
              : `Firebase-feil: ${error.code || error.message || "ukjent feil"}.`;
            setStatus(`${message} Du kan fortsatt sammenligne manuelt.`, "error");
            return;
          }

          updateCommunityReportNotes();
          updateRenderedCosts();
          const matchingReports = shops.filter((shop) => communityPrices.has(shop.id)).length;
          const reportStatus = matchingReports
            ? ` ${matchingReports} ${matchingReports === 1 ? "sted har" : "steder har"} godkjent pris.`
            : "";
          setStatus(`Fant ${shops.length} ${shops.length === 1 ? "sted" : "steder"}.${reportStatus} Legg inn eller logg priser for å sammenligne.`, "success");
        });
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      shops = [];
      renderResults();
      elements.emptyState.hidden = false;
      elements.emptyState.querySelector("strong").textContent = "Kunne ikke hente steder akkurat nå.";
      elements.emptyState.querySelector("span").textContent = "Sjekk internettforbindelsen og prøv igjen.";
      setStatus(error.message || "Noe gikk galt da stedene skulle hentes.", "error");
    } finally {
      if (!signal.aborted) {
        elements.findButton.disabled = false;
        elements.findButton.querySelector("span").textContent = "Finn steder";
        requestController = null;
      }
    }
  }

  function renderComparison() {
    const fuelCost = getFuelCost();
    const nearest = shops[0] || null;
    if (!nearest) {
      elements.comparison.hidden = true;
      elements.comparison.replaceChildren();
      return;
    }

    const pricedShops = shops
      .map((shop) => ({ ...shop, price: getPrice(shop.id) }))
      .filter((shop) => shop.price !== null);
    const best = fuelCost === null ? null : BilligKebabPricing.findBestDeal(pricedShops, fuelCost);
    let heading;
    let detail;
    if (fuelCost === null) {
      heading = "Skriv inn drivstoffkostnad per kilometer.";
      detail = "Bruk et tall fra 0 til 100 kr/km for å regne ut turen.";
    } else if (!best) {
      heading = "Legg inn kebabprisene for å sammenligne.";
      detail = "Start med prisen på det nærmeste stedet — så ser du om en kjøretur lønner seg.";
    } else {
      const nearestPrice = getPrice(nearest.id);
      const nearestTrip = BilligKebabPricing.estimateTrip(nearest.distanceKm, fuelCost);
      const nearestTotal = nearestPrice === null ? null : nearestPrice + nearestTrip.fuelCost;
      const saving = nearestTotal === null ? null : Math.max(0, nearestTotal - best.totalCost);

      heading = best.id === nearest.id
        ? `${best.name} lønner seg best — og er nærmest.`
        : `${best.name} er billigst når kjøreturen er med.`;
      detail = saving === null
        ? `Fyll inn prisen hos ${nearest.name} for å se hvor mye du sparer mot nærmeste.`
        : saving > 0
          ? `Du sparer ca. ${formatMoney(saving)} mot nærmeste, inkludert drivstoff tur-retur.`
          : `Nærmeste alternativ koster omtrent ${formatMoney(best.totalCost)} totalt, inkludert drivstoff tur-retur.`;
    }

    elements.comparison.innerHTML = `
      <span class="comparison-icon" aria-hidden="true">✓</span>
      <span class="comparison-copy">
        <strong>${escapeHtml(heading)}</strong>
        <span>${escapeHtml(detail)}</span>
      </span>`;
    elements.comparison.hidden = false;
  }

  function updateRenderedCosts() {
    const fuelCost = getFuelCost();
    const pricedShops = shops
      .map((shop) => ({ ...shop, price: getPrice(shop.id) }))
      .filter((shop) => shop.price !== null);
    const best = fuelCost === null ? null : BilligKebabPricing.findBestDeal(pricedShops, fuelCost);
    const nearestId = shops[0] && shops[0].id;

    for (const card of elements.shopList.querySelectorAll(".shop-card")) {
      const shop = shops.find((item) => item.id === card.dataset.shopId);
      if (!shop) {
        continue;
      }

      const price = getPrice(shop.id);
      const trip = fuelCost === null ? null : BilligKebabPricing.estimateTrip(shop.distanceKm, fuelCost);
      const total = price !== null && trip ? price + trip.fuelCost : null;
      const isBest = best && best.id === shop.id;
      card.classList.toggle("is-best", Boolean(isBest));
      card.querySelector('[data-badge="nearest"]').hidden = shop.id !== nearestId;
      card.querySelector('[data-badge="best"]').hidden = !isBest || shop.id === nearestId;
      card.querySelector(".total-cost span").textContent = trip
        ? `${formatDistance(trip.roundTripKm)} km t/r · ${formatMoney(trip.fuelCost)} drivstoff`
        : "Totalpris inkl. kjøretur";
      const totalLabel = card.querySelector(".total-cost strong");
      totalLabel.textContent = total === null ? "Legg inn pris" : formatMoney(total);
      totalLabel.classList.toggle("is-pending", total === null);
    }

    renderComparison();
  }

  function updateCommunityReportNotes() {
    for (const card of elements.shopList.querySelectorAll(".shop-card")) {
      const report = communityPrices.get(card.dataset.shopId);
      const note = card.querySelector("[data-community-price]");
      if (!report || !note) {
        continue;
      }

      note.textContent = `Sist godkjent: ${report.product} · ${formatMoney(report.price)} · ${formatReportDate(report.observedAt)}`;
      note.hidden = false;
    }
  }

  function renderMap() {
    elements.mapSection.hidden = shops.length === 0;
    if (shops.length === 0) {
      if (mapMarkers) {
        mapMarkers.clearLayers();
      }
      return;
    }

    if (!window.L) {
      elements.map.hidden = true;
      elements.mapStatus.textContent = "Kartet kunne ikke lastes. Stedene vises fortsatt i listen.";
      elements.mapStatus.hidden = false;
      return;
    }

    elements.map.hidden = false;
    elements.mapStatus.hidden = true;
    if (!mapInstance) {
      const { latitude, longitude } = currentPosition.coords;
      mapInstance = window.L.map(elements.map, { scrollWheelZoom: false });
      window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap-bidragsytere</a>',
      }).addTo(mapInstance);
      window.L.control.scale({ metric: true, imperial: false }).addTo(mapInstance);
      mapMarkers = window.L.layerGroup().addTo(mapInstance);
      mapInstance.setView([latitude, longitude], 13);
    }

    mapMarkers.clearLayers();
    const bounds = [];
    for (const shop of shops) {
      const point = [shop.lat, shop.lon];
      bounds.push(point);
      window.L.circleMarker(point, {
        color: "#fffefa",
        fillColor: "#355d3d",
        fillOpacity: 1,
        radius: 8,
        weight: 2,
      })
        .bindPopup(`<strong>${escapeHtml(shop.name)}</strong><br>${formatDistance(shop.distanceKm)} km unna`)
        .addTo(mapMarkers);
    }

    const { latitude, longitude } = currentPosition.coords;
    const userPoint = [latitude, longitude];
    bounds.push(userPoint);
    window.L.circleMarker(userPoint, {
      color: "#fffefa",
      fillColor: "#3678c8",
      fillOpacity: 1,
      radius: 7,
      weight: 2,
    })
      .bindPopup("<strong>Du er her</strong>")
      .addTo(mapMarkers);

    mapInstance.fitBounds(window.L.latLngBounds(bounds).pad(0.15), { maxZoom: 14 });
    requestAnimationFrame(() => mapInstance.invalidateSize());
  }

  function renderResults() {
    const fuelCost = getFuelCost();
    const pricedShops = shops
      .map((shop) => ({ ...shop, price: getPrice(shop.id) }))
      .filter((shop) => shop.price !== null);
    const best = fuelCost === null
      ? null
      : BilligKebabPricing.findBestDeal(pricedShops, fuelCost);
    const nearestId = shops[0] && shops[0].id;

    elements.shopList.innerHTML = shops.map((shop) => {
      const price = getPrice(shop.id);
      const trip = fuelCost === null ? null : BilligKebabPricing.estimateTrip(shop.distanceKm, fuelCost);
      const total = price !== null && trip ? price + trip.fuelCost : null;
      const isBest = best && best.id === shop.id;
      const manualPrice = getManualPrice(shop.id);
      const communityReport = communityPrices.get(shop.id);
      const mapUrl = `https://www.openstreetmap.org/?mlat=${shop.lat}&mlon=${shop.lon}#map=17/${shop.lat}/${shop.lon}`;
      const cuisine = shop.cuisine ? `<span>${escapeHtml(shop.cuisine)}</span>` : "";
      const communityReportText = communityReport
        ? `Sist godkjent: ${escapeHtml(communityReport.product)} · ${formatMoney(communityReport.price)} · ${formatReportDate(communityReport.observedAt)}`
        : "";

      return `
        <article class="shop-card${isBest ? " is-best" : ""}" data-shop-id="${escapeHtml(shop.id)}">
          <div class="shop-info">
            <div class="shop-title-row">
              <strong class="shop-title">${escapeHtml(shop.name)}</strong>
              <span class="shop-badge" data-badge="nearest"${shop.id === nearestId ? "" : " hidden"}>Nærmest</span>
              <span class="shop-badge" data-badge="best"${isBest && shop.id !== nearestId ? "" : " hidden"}>Billigst totalt</span>
            </div>
            <div class="shop-meta">
              <span>${escapeHtml(shop.address)}</span>
              ${cuisine}
              <span>${formatDistance(shop.distanceKm)} km unna</span>
              <a href="${mapUrl}" target="_blank" rel="noreferrer">Vis kart ↗</a>
              <span class="community-price" data-community-price${communityReport ? "" : " hidden"}>${communityReportText}</span>
            </div>
          </div>
          <div class="shop-math">
            <label class="price-field">
              <span>Din pris</span>
              <span class="price-input-wrap"><input class="price-input" type="number" min="0" max="9999" step="1" inputmode="numeric" data-shop-id="${escapeHtml(shop.id)}" aria-label="Din kebabpris hos ${escapeHtml(shop.name)} i kroner" value="${manualPrice === null ? "" : manualPrice}"><span>kr</span></span>
            </label>
            <div class="total-cost">
              <span>${trip ? `${formatDistance(trip.roundTripKm)} km t/r · ${formatMoney(trip.fuelCost)} drivstoff` : "Totalpris inkl. kjøretur"}</span>
              <strong class="${total === null ? "is-pending" : ""}">${total === null ? "Legg inn pris" : formatMoney(total)}</strong>
            </div>
          </div>
          <details class="report-details">
            <summary>Logg en pris for andre</summary>
            <form class="price-report-form" data-shop-id="${escapeHtml(shop.id)}">
              <div class="report-fields">
                <label>Kebabtype<input name="product" type="text" maxlength="70" value="Kebab" required></label>
                <label>Pris i kroner<input name="report-price" type="number" min="1" max="9999" step="1" inputmode="numeric" value="${manualPrice === null ? "" : manualPrice}" required></label>
                <label>Dato kjøpt<input name="observed-at" type="date" max="${localDate()}" value="${localDate()}" required></label>
              </div>
              <label class="report-note">Kommentar (valgfritt)<input name="note" type="text" maxlength="200" placeholder="For eksempel størrelse eller menyvalg"></label>
              <button class="report-submit" type="submit">Send inn pris</button>
              <p class="report-help">Du må logge inn. Prisen vises først etter at den er godkjent.</p>
            </form>
          </details>
        </article>`;
    }).join("");

    elements.emptyState.hidden = shops.length > 0;
    renderMap();
    if (shops.length === 0 && currentPosition) {
      elements.emptyState.querySelector("strong").textContent = "Ingen steder funnet i dette området.";
      elements.emptyState.querySelector("span").textContent = "Prøv å utvide søkeavstanden eller søk igjen senere.";
    }
    updateRenderedCosts();
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setStatus("Nettleseren din støtter ikke posisjonstjenester.", "error");
      return;
    }

    elements.findButton.disabled = true;
    elements.findButton.querySelector("span").textContent = "Henter posisjon …";
    setStatus("Venter på posisjonen din …");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentPosition = position;
        searchNearby(position);
      },
      (error) => {
        elements.findButton.disabled = false;
        elements.findButton.querySelector("span").textContent = "Finn steder";
        const messages = {
          1: "Posisjonstilgang ble avslått. Tillat posisjon i nettleseren og prøv igjen.",
          2: "Fant ikke posisjonen din. Sjekk posisjonsinnstillingene og prøv igjen.",
          3: "Det tok for lang tid å hente posisjonen. Prøv igjen.",
        };
        setStatus(messages[error.code] || "Kunne ikke hente posisjonen din.", "error");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  }

  elements.findButton.addEventListener("click", requestLocation);
  elements.radius.addEventListener("change", () => {
    if (currentPosition) {
      searchNearby(currentPosition);
    }
  });
  elements.fuelCost.addEventListener("input", updateRenderedCosts);
  elements.shopList.addEventListener("input", (event) => {
    const input = event.target.closest(".price-input");
    if (!input) {
      return;
    }
    shopPrices.set(input.dataset.shopId, input.value);
    updateRenderedCosts();
  });
  elements.shopList.addEventListener("submit", async (event) => {
    const form = event.target.closest(".price-report-form");
    if (!form) {
      return;
    }
    event.preventDefault();

    if (!currentUser) {
      elements.authPanel.hidden = false;
      elements.authError.textContent = "";
      elements.authForm.elements.email.focus();
      setStatus("Logg inn eller opprett en konto for å sende inn en pris.", "error");
      return;
    }

    const shop = shops.find((item) => item.id === form.dataset.shopId);
    if (!shop) {
      setStatus("Fant ikke restauranten for prisrapporten. Søk etter steder på nytt.", "error");
      return;
    }

    const product = cleanLine(form.elements.product.value);
    const price = Number(form.elements["report-price"].value);
    const observedAt = form.elements["observed-at"].value;
    const note = cleanLine(form.elements.note.value) || "Ingen kommentar";
    if (
      !product
      || !Number.isInteger(price)
      || price <= 0
      || price > 9999
      || !BilligKebabReports.isValidDate(observedAt)
      || observedAt > localDate()
    ) {
      setStatus("Sjekk kebabtype, pris og dato før du sender inn.", "error");
      return;
    }

    const submitButton = form.querySelector(".report-submit");
    submitButton.disabled = true;
    submitButton.textContent = "Sender …";
    try {
      await savePriceReport({
        restaurantId: shop.id,
        restaurantName: cleanLine(shop.name),
        address: cleanLine(shop.address),
        lat: shop.lat,
        lon: shop.lon,
        product,
        price,
        observedAt,
        note,
      });
      form.closest("details").open = false;
      setStatus("Takk! Prisen er sendt inn og venter på godkjenning.", "success");
    } catch (error) {
      setStatus(`Kunne ikke lagre prisen i Firebase (${error.code || error.message || "ukjent feil"}).`, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send inn pris";
    }
  });

  function setAuthMode(registering) {
    isRegistering = registering;
    elements.authTitle.textContent = registering ? "Opprett konto" : "Logg inn";
    elements.authSubmit.textContent = registering ? "Opprett konto" : "Logg inn";
    elements.authToggle.textContent = registering ? "Har du allerede konto? Logg inn" : "Ny her? Opprett konto";
    elements.authForm.elements.password.autocomplete = registering ? "new-password" : "current-password";
    elements.authError.textContent = "";
  }

  elements.authOpen.addEventListener("click", () => {
    setAuthMode(false);
    elements.authPanel.hidden = false;
    elements.authForm.elements.email.focus();
  });
  elements.authClose.addEventListener("click", () => {
    elements.authPanel.hidden = true;
  });
  elements.authPanel.addEventListener("click", (event) => {
    if (event.target === elements.authPanel) {
      elements.authPanel.hidden = true;
    }
  });
  elements.authToggle.addEventListener("click", () => setAuthMode(!isRegistering));
  elements.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.authError.textContent = "";
    const email = elements.authForm.elements.email.value.trim();
    const password = elements.authForm.elements.password.value;

    elements.authSubmit.disabled = true;
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      const messages = {
        "auth/email-already-in-use": "E-postadressen har allerede en konto.",
        "auth/invalid-credential": "Ugyldig e-post eller passord.",
        "auth/invalid-email": "Skriv inn en gyldig e-postadresse.",
        "auth/operation-not-allowed": "E-postinnlogging må aktiveres i Firebase Console.",
        "auth/too-many-requests": "For mange forsøk. Vent litt og prøv igjen.",
        "auth/weak-password": "Passordet må være minst 6 tegn.",
      };
      elements.authError.textContent = messages[error.code] || `Kunne ikke logge inn (${error.code || error.message || "ukjent feil"}).`;
    } finally {
      elements.authSubmit.disabled = false;
    }
  });
  elements.authLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
      setStatus("Du er logget ut.", "success");
    } catch (error) {
      setStatus(`Kunne ikke logge ut (${error.code || error.message || "ukjent feil"}).`, "error");
    }
  });
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    elements.authOpen.hidden = Boolean(user);
    elements.authLogout.hidden = !user;
    elements.authUser.hidden = !user;
    elements.authUser.textContent = user ? user.email : "";
    if (user) {
      elements.authPanel.hidden = true;
    }
  });
})();
