"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { latestVerifiedReports } = require("../reports.js");

function priceIssue(number, date, price, extra = {}) {
  return {
    number,
    state: "closed",
    labels: [{ name: "verified-price" }],
    body: `### Restaurant
Kebab Corner

### OSM place ID
node/123

### Kebabtype
Rullekebab

### Pris (NOK)
${price}

### Dato
${date}

### Kommentar
`,
    ...extra,
  };
}

test("uses the most recent verified report for each place", () => {
  const reports = latestVerifiedReports([
    priceIssue(4, "2026-10-12", "125"),
    priceIssue(5, "2026-11-01", "135"),
  ]);

  assert.equal(reports.get("node/123").price, 135);
  assert.equal(reports.get("node/123").observedAt, "2026-11-01");
});

test("ignores unverified, pull-request, malformed, and future place records", () => {
  const unverified = priceIssue(6, "2026-11-10", "90", {
    labels: [{ name: "price-report" }],
  });
  const pullRequest = priceIssue(7, "2026-11-11", "80", {
    pull_request: { url: "https://api.github.com/repos/example/example/pulls/7" },
  });
  const badDate = priceIssue(8, "2026-02-31", "80");
  const badPlace = priceIssue(9, "2026-11-12", "80", {
    body: priceIssue(9, "2026-11-12", "80").body.replace("node/123", "javascript:alert(1)"),
  });

  assert.equal(latestVerifiedReports([unverified, pullRequest, badDate, badPlace]).size, 0);
});
