import { describe, expect, it } from "vitest";
import { haversineDistance } from "@/lib/haversine";

/**
 * Expected miles are great-circle (haversine) distances for the given coordinates.
 * Driving distances differ; LA↔Boston is often misquoted vs spherical geometry.
 */
describe("haversineDistance", () => {
  it("returns a non-negative number", () => {
    const d = haversineDistance(0, 0, 10, 10);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(d)).toBe(true);
  });

  it("returns 0 for identical coordinates", () => {
    expect(haversineDistance(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it("returns 0 when both points are the same city (repeated args)", () => {
    const lat = 34.0522;
    const lon = -118.2437;
    expect(haversineDistance(lat, lon, lat, lon)).toBe(0);
  });

  it("Los Angeles → Boston ≈ 2,591 mi (±50)", () => {
    const miles = haversineDistance(34.0522, -118.2437, 42.3601, -71.0589);
    expect(miles).toBeGreaterThan(2540);
    expect(miles).toBeLessThan(2640);
  });

  it("New York → San Francisco ≈ 2,566 mi (±50)", () => {
    const miles = haversineDistance(40.7128, -74.006, 37.7749, -122.4194);
    expect(miles).toBeGreaterThan(2515);
    expect(miles).toBeLessThan(2615);
  });

  it("Dallas → Denver ≈ 663 mi (±50)", () => {
    const miles = haversineDistance(32.7767, -96.797, 39.7392, -104.9903);
    expect(miles).toBeGreaterThan(610);
    expect(miles).toBeLessThan(715);
  });

  it("is symmetric in argument order", () => {
    const a = haversineDistance(10, 20, 30, 40);
    const b = haversineDistance(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 5);
  });
});
