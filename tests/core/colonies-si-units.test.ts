import { describe, it, expect } from 'vitest';
import {
  calculateColonyPhysicalMetrics,
  calculatePlatePhysicalSummary,
  computeSizeDistribution,
  PETRI_DISH_PRESETS,
  calculateCfu,
} from '@/core/counting';

describe('Colony Counting Physical SI Units & Spatial Calibration', () => {
  it('calculates physical SI metrics (mm, mm², center distance) for individual colonies', () => {
    // 500x500 plate, center at (250, 250), dish inner radius = 215 px
    // For 90 mm standard petri dish:
    // radiusMm = 45 mm -> mmPerPixel = 45 / 215 ~= 0.2093 mm/px
    const dishCenter = { cx: 250, cy: 250 };
    const mmPerPixel = 45 / 215;

    // Colony with radius 10 px at (250, 200) -> distance from center = 50 px
    const metrics = calculateColonyPhysicalMetrics(10, 250, 200, dishCenter, mmPerPixel);

    expect(metrics.radiusMm).toBeCloseTo(10 * mmPerPixel, 4);
    expect(metrics.diameterMm).toBeCloseTo(20 * mmPerPixel, 4);
    expect(metrics.diameterMm).toBeCloseTo(4.186, 2);
    expect(metrics.areaMm2).toBeCloseTo(Math.PI * Math.pow(metrics.radiusMm, 2), 4);
    expect(metrics.distanceFromCenterMm).toBeCloseTo(50 * mmPerPixel, 4);
    expect(metrics.distanceFromCenterMm).toBeCloseTo(10.465, 2);
  });

  it('calculates plate physical summary and colony plating density (CFU/cm²)', () => {
    // Standard 90 mm petri dish:
    // radius = 4.5 cm -> area = pi * 4.5^2 = 63.617 cm^2
    const summary = calculatePlatePhysicalSummary(120, 8, 90, 215);

    expect(summary.dishDiameterMm).toBe(90);
    expect(summary.dishAreaCm2).toBeCloseTo(63.617, 2);
    expect(summary.platingDensityCfuPerCm2).toBeCloseTo(120 / 63.617, 2);
    expect(summary.platingDensityCfuPerCm2).toBeCloseTo(1.886, 2);
    expect(summary.densityStatus).toBe('optimal'); // 30-300 CFU is optimal countable range

    // Test sparse status (< 30 colonies)
    const sparse = calculatePlatePhysicalSummary(15, 8, 90, 215);
    expect(sparse.densityStatus).toBe('sparse');

    // Test dense status (> 300 colonies)
    const dense = calculatePlatePhysicalSummary(450, 8, 90, 215);
    expect(dense.densityStatus).toBe('dense');

    // Test confluent (> 600 colonies)
    const confluent = calculatePlatePhysicalSummary(800, 8, 90, 215);
    expect(confluent.densityStatus).toBe('confluent');
  });

  it('provides standard Petri dish presets', () => {
    expect(PETRI_DISH_PRESETS.length).toBeGreaterThanOrEqual(4);
    const p90 = PETRI_DISH_PRESETS.find(p => p.diameterMm === 90);
    expect(p90).toBeDefined();
    expect(p90?.label).toContain('90 mm');

    const p150 = PETRI_DISH_PRESETS.find(p => p.diameterMm === 150);
    expect(p150).toBeDefined();
    expect(p150?.label).toContain('150 mm');
  });

  it('computes size distribution with physical mm bin labels when mmPerPixel is supplied', () => {
    const colonies = [
      { id: '1', x: 200, y: 200, radius: 5, category: 'cat-1' },
      { id: '2', x: 220, y: 220, radius: 8, category: 'cat-1' },
      { id: '3', x: 260, y: 240, radius: 12, category: 'cat-1' },
    ];
    const mmPerPixel = 0.2; // 1 px = 0.2 mm
    const stats = computeSizeDistribution(colonies, mmPerPixel);

    expect(stats.meanRadius).toBe((5 + 8 + 12) / 3);
    expect(stats.meanRadiusMm).toBeCloseTo(((5 + 8 + 12) / 3) * 0.2, 4);
    expect(stats.meanDiameterMm).toBeCloseTo(stats.meanRadiusMm! * 2, 4);
    expect(stats.bins[0]?.binLabelMm).toContain('mm');
  });
});
