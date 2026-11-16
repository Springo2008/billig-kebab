(function (root) {
  "use strict";

  const OSM_ID_PATTERN = /^(node|way|relation)\/\d+$/;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function isValidDate(value) {
    if (!DATE_PATTERN.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function parseApprovedReport(report) {
    if (!report || report.status !== "approved") {
      return null;
    }

    const osmId = report.restaurantId;
    const name = report.restaurantName;
    const product = report.product;
    const price = report.price;
    const observedAt = report.observedAt;
    const createdAt = report.createdAt && typeof report.createdAt.toMillis === "function"
      ? report.createdAt.toMillis()
      : Number(report.createdAt) || 0;

    if (
      !OSM_ID_PATTERN.test(osmId)
      || !name
      || !product
      || !Number.isFinite(price)
      || price <= 0
      || !isValidDate(observedAt)
    ) {
      return null;
    }

    return {
      osmId,
      name,
      product,
      price,
      observedAt,
      createdAt,
    };
  }

  function latestApprovedReports(reports) {
    const approvedReports = reports
      .map(parseApprovedReport)
      .filter(Boolean)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.createdAt - a.createdAt);
    const latestByPlace = new Map();

    for (const report of approvedReports) {
      if (!latestByPlace.has(report.osmId)) {
        latestByPlace.set(report.osmId, report);
      }
    }

    return latestByPlace;
  }

  const reports = { latestApprovedReports, parseApprovedReport };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = reports;
  } else {
    root.BilligKebabReports = reports;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
