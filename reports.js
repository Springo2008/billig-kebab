(function (root) {
  "use strict";

  const OSM_ID_PATTERN = /^(node|way|relation)\/\d+$/;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function readField(body, heading) {
    const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(`^### ${escapedHeading}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n### |$)`, "m"));
    return match ? match[1].trim() : "";
  }

  function isValidDate(value) {
    if (!DATE_PATTERN.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function parseVerifiedReport(issue) {
    if (!issue || issue.pull_request || issue.state !== "closed") {
      return null;
    }
    if (!Array.isArray(issue.labels) || !issue.labels.some((label) => label.name === "verified-price")) {
      return null;
    }

    const body = typeof issue.body === "string" ? issue.body : "";
    const osmId = readField(body, "OSM place ID");
    const name = readField(body, "Restaurant");
    const product = readField(body, "Kebabtype");
    const rawPrice = readField(body, "Pris (NOK)").replace(",", ".");
    const price = Number(rawPrice);
    const observedAt = readField(body, "Dato");

    if (
      !OSM_ID_PATTERN.test(osmId)
      || !name
      || !product
      || !Number.isFinite(price)
      || price <= 0
      || !isValidDate(observedAt)
      || !Number.isInteger(issue.number)
      || issue.number <= 0
    ) {
      return null;
    }

    return {
      osmId,
      name,
      product,
      price,
      observedAt,
      issueNumber: issue.number,
    };
  }

  function latestVerifiedReports(issues) {
    const reports = issues
      .map(parseVerifiedReport)
      .filter(Boolean)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.issueNumber - a.issueNumber);
    const latestByPlace = new Map();

    for (const report of reports) {
      if (!latestByPlace.has(report.osmId)) {
        latestByPlace.set(report.osmId, report);
      }
    }

    return latestByPlace;
  }

  const reports = { latestVerifiedReports, parseVerifiedReport };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = reports;
  } else {
    root.BilligKebabReports = reports;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
