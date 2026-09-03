import { describe, it, expect } from 'vitest';
import { calculateCfu } from '@/core/counting';
import {
  generateEmptyPlate,
  plateToMatrixCsv,
  plateToListCsv,
  DEFAULT_SAMPLE_GROUPS,
} from '@/core/plates/layout';
import {
  distanceBetween,
  angleBetweenPoints,
  polygonArea,
  applyCalibration,
} from '@/core/measure';
import { parseMarkdownProtocol, BUNDLED_PROTOCOLS } from '@/core/protocols';

describe('Colony CFU Counting', () => {
  it('calculates CFU/mL from dilution and plated volume', () => {
    // 150 colonies from 100 uL (0.1 mL) of 1:10,000 (1e4) dilution
    // CFU/mL = (150 / 0.1) * 10,000 = 15,000,000 = 1.5e7 CFU/mL
    const res = calculateCfu({
      coloniesCounted: 150,
      volumePlatedMl: 0.1,
      dilutionFactor: 10_000,
    });
    expect(res.cfuPerMl).toBe(15_000_000);
    expect(res.totalCfuPlated).toBe(150);
  });
});

describe('Plate Layout', () => {
  it('generates a 96-well grid and formats CSV output', () => {
    const wells = generateEmptyPlate(96);
    expect(Object.keys(wells).length).toBe(96);
    expect(wells['A1']?.id).toBe('A1');
    expect(wells['H12']?.id).toBe('H12');

    // Assign sample to A1 and A2
    wells['A1']!.sampleGroupId = 'sample-1';
    wells['A1']!.sampleName = 'Drug A';
    wells['A1']!.replicateIndex = 1;
    wells['A1']!.value = 10;
    wells['A1']!.unit = 'µM';

    const matrix = plateToMatrixCsv(96, wells);
    expect(matrix).toContain('Row,1,2,3');
    expect(matrix).toContain('"Drug A"');

    const list = plateToListCsv(wells, DEFAULT_SAMPLE_GROUPS);
    expect(list).toContain('A1,A,1,"Sample 1",sample,"Drug A",1,10,µM');
  });
});

describe('Image Measurements and Calibration', () => {
  it('measures distance and calibrates units', () => {
    const p1 = { x: 10, y: 10 };
    const p2 = { x: 40, y: 50 };
    const distPx = distanceBetween(p1, p2); // sqrt(30^2 + 40^2) = 50 px
    expect(distPx).toBe(50);

    // Scale: 100 pixels = 25 µm (0.25 µm/px)
    const scale = { pixels: 100, realLength: 25, unit: 'µm' as const };
    const cal = applyCalibration(distPx, 'line', scale);
    expect(cal.value).toBe(12.5);
    expect(cal.unit).toBe('µm');
  });

  it('measures angles and polygon areas', () => {
    // 90 degree angle: (1, 0) - (0, 0) - (0, 1)
    const angle = angleBetweenPoints({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 });
    expect(angle).toBeCloseTo(90, 1);

    // Square 10x10 -> area = 100 px^2
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(polygonArea(square)).toBe(100);
  });
});

describe('Protocols Core', () => {
  it('parses markdown checklists and detects timers', () => {
    const md = `# My Protocol\n- [ ] Step 1: Add buffer\n- [ ] Step 2: Incubate for 15 min [timer: 15 min]\n- [x] Step 3: Spin down`;
    const protocol = parseMarkdownProtocol(md);
    expect(protocol.title).toBe('My Protocol');
    expect(protocol.steps.length).toBe(3);
    expect(protocol.steps[1]!.timerMinutes).toBe(15);
    expect(protocol.steps[2]!.completed).toBe(true);
  });

  it('loads bundled protocols with complete steps', () => {
    expect(BUNDLED_PROTOCOLS.length).toBeGreaterThanOrEqual(4);
    const miniprep = BUNDLED_PROTOCOLS.find(p => p.id === 'miniprep');
    expect(miniprep).toBeTruthy();
    expect(miniprep!.steps.length).toBeGreaterThan(5);
  });
});
