"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { estimateTrip, findBestDeal } = require("../pricing.js");

test("estimates fuel for the round trip using the disclosed road multiplier", () => {
  const trip = estimateTrip(2, 2.5);
  assert.equal(trip.roundTripKm, 5.4);
  assert.equal(trip.fuelCost, 13.5);
});

test("chooses a farther shop only when its total meal and fuel cost is lower", () => {
  const shops = [
    { id: "near", name: "Nær", distanceKm: 1, price: 120 },
    { id: "far", name: "Langt unna", distanceKm: 3, price: 110 },
  ];

  assert.equal(findBestDeal(shops, 2.5).id, "near");
  assert.equal(findBestDeal(shops, 0.5).id, "far");
});

test("skips shops with unknown prices and rejects invalid fuel costs", () => {
  assert.equal(findBestDeal([{ id: "unknown", distanceKm: 1, price: null }], 2.5), null);
  assert.throws(() => estimateTrip(1, -1), RangeError);
});
