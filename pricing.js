(function (root) {
  "use strict";

  const ROAD_DISTANCE_MULTIPLIER = 1.35;

  function estimateTrip(distanceKm, fuelCostPerKm) {
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      throw new RangeError("Avstanden må være et gyldig, positivt tall.");
    }

    if (!Number.isFinite(fuelCostPerKm) || fuelCostPerKm < 0) {
      throw new RangeError("Drivstoffkostnaden må være et gyldig, positivt tall.");
    }

    const roundTripKm = distanceKm * ROAD_DISTANCE_MULTIPLIER * 2;
    return {
      roundTripKm,
      fuelCost: roundTripKm * fuelCostPerKm,
    };
  }

  function findBestDeal(shops, fuelCostPerKm) {
    const pricedOptions = shops
      .filter((shop) => Number.isFinite(shop.price) && shop.price >= 0)
      .map((shop) => {
        const trip = estimateTrip(shop.distanceKm, fuelCostPerKm);
        return {
          ...shop,
          ...trip,
          totalCost: shop.price + trip.fuelCost,
        };
      });

    pricedOptions.sort((a, b) => a.totalCost - b.totalCost || a.distanceKm - b.distanceKm);
    return pricedOptions[0] || null;
  }

  const pricing = { estimateTrip, findBestDeal };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = pricing;
  } else {
    root.BilligKebabPricing = pricing;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
