"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { isValidDate, latestApprovedReports } = require("../reports.js");

function priceReport(id, date, price, extra = {}) {
  return {
    id,
    status: "approved",
    restaurantId: "node/123",
    restaurantName: "Kebab Corner",
    product: "Rullekebab",
    price,
    observedAt: date,
    createdAt: 0,
    ...extra,
  };
}

test("uses the newest approved report for each restaurant", () => {
  const reports = latestApprovedReports([
    priceReport("older", "2026-10-12", 125),
    priceReport("newer", "2026-11-01", 135),
  ]);

  assert.equal(reports.get("node/123").price, 135);
  assert.equal(reports.get("node/123").observedAt, "2026-11-01");
});

test("uses submission time to break ties on the same purchase date", () => {
  const reports = latestApprovedReports([
    priceReport("early", "2026-11-01", 125, { createdAt: 10 }),
    priceReport("late", "2026-11-01", 135, { createdAt: 20 }),
  ]);

  assert.equal(reports.get("node/123").price, 135);
});

test("ignores pending and malformed reports", () => {
  const pending = priceReport("pending", "2026-11-10", 90, { status: "pending" });
  const badDate = priceReport("bad-date", "2026-02-31", 80);
  const badPlace = priceReport("bad-place", "2026-11-12", 80, {
    restaurantId: "javascript:alert(1)",
  });
  const badPrice = priceReport("bad-price", "2026-11-12", -10);
  const excessivePrice = priceReport("excessive-price", "2026-11-12", 10000);

  assert.equal(latestApprovedReports([pending, badDate, badPlace, badPrice, excessivePrice]).size, 0);
});

test("validates real calendar dates, including leap days", () => {
  assert.equal(isValidDate("2024-02-29"), true);
  assert.equal(isValidDate("2026-02-29"), false);
  assert.equal(isValidDate("2026-13-01"), false);
  assert.equal(isValidDate(null), false);
});
