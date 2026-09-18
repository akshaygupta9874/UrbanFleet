import { describe, expect, it } from "vitest";
import { fareService } from "../../src/services/fare.service.js";

describe("fareService.calculateFareForDistance", () => {
  it("calculates a complete, internally balanced car fare", () => {
    const fare = fareService.calculateFareForDistance(10, "car");

    expect(fare.totalPaise).toBe(
      fare.baseFarePaise + fare.distanceFarePaise + fare.timeFarePaise + fare.surgePaise,
    );
    expect(fare.totalPaise).toBe(fare.platformCommissionPaise + fare.driverEarningPaise);
    expect(fare.totalPaise).toBeGreaterThan(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("never produces a negative fare for %p", (distance) => {
    const fare = fareService.calculateFareForDistance(distance);
    expect(fare.distanceFarePaise).toBe(0);
    expect(fare.totalPaise).toBeGreaterThan(0);
  });

  it("applies the selected vehicle multiplier", () => {
    expect(fareService.calculateFareForDistance(5, "bike").totalPaise)
      .toBeLessThan(fareService.calculateFareForDistance(5, "car").totalPaise);
  });
});
