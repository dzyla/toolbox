import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import GelView, { computeTargetBandClusters, findTargetBandInLane } from '@/tools/gel/View';
import { route } from '@/app/router';

describe('Gel Western Blot Target Band Matching & Margin of Detection', () => {
  beforeEach(() => {
    window.alert = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clusters target bands and matches them across experimental wells with variable band counts', () => {
    // Lane 1 (Ladder): 5 bands [250, 150, 100, 50, 25] kDa
    // Lane 2 (Sample A): 1 band [52 kDa] (band #1)
    // Lane 3 (Sample B): 2 bands [50 kDa, 24 kDa] (bands #1, #2)
    const mockAnalysis = [
      {
        lane: { id: 'l1', x: 20, y0: 10, y1: 210, width: 20, tilt: 0 },
        laneIdx: 0,
        totalLaneSignal: 5000,
        metrics: [
          { bandId: 'b-1', number: 1, peakY: 20, net: 1000, raw: 1200, share: 20, sizeEst: 250, massEst: 50 },
          { bandId: 'b-2', number: 2, peakY: 50, net: 1000, raw: 1200, share: 20, sizeEst: 150, massEst: 50 },
          { bandId: 'b-3', number: 3, peakY: 90, net: 1000, raw: 1200, share: 20, sizeEst: 100, massEst: 50 },
          { bandId: 'b-4', number: 4, peakY: 130, net: 1000, raw: 1200, share: 20, sizeEst: 50, massEst: 50 },
          { bandId: 'b-5', number: 5, peakY: 180, net: 1000, raw: 1200, share: 20, sizeEst: 25, massEst: 50 },
        ],
      },
      {
        lane: { id: 'l2', x: 60, y0: 10, y1: 210, width: 20, tilt: 0 },
        laneIdx: 1,
        totalLaneSignal: 2500,
        metrics: [
          { bandId: 'b-l2-1', number: 1, peakY: 128, net: 2500, raw: 2800, share: 100, sizeEst: 52, massEst: 125 },
        ],
      },
      {
        lane: { id: 'l3', x: 100, y0: 10, y1: 210, width: 20, tilt: 0 },
        laneIdx: 2,
        totalLaneSignal: 3000,
        metrics: [
          { bandId: 'b-l3-1', number: 1, peakY: 131, net: 1800, raw: 2000, share: 60, sizeEst: 50, massEst: 90 },
          { bandId: 'b-l3-2', number: 2, peakY: 182, net: 1200, raw: 1400, share: 40, sizeEst: 24, massEst: 60 },
        ],
      },
      {
        lane: { id: 'l4', x: 140, y0: 10, y1: 210, width: 20, tilt: 0 },
        laneIdx: 3,
        totalLaneSignal: 200,
        metrics: [],
      },
    ] as unknown as Parameters<typeof computeTargetBandClusters>[0];

    // With 15% margin of detection, the 50 kDa ladder band and 52 kDa sample band cluster together (~51 kDa)
    const clusters15 = computeTargetBandClusters(mockAnalysis, 15, 'protein', [250, 150, 100, 50, 25]);
    const target50 = clusters15.find(c => c.avgSize && Math.abs(c.avgSize - 50) <= 5);
    expect(target50).toBeTruthy();
    expect(target50?.matchingLanesCount).toBe(3); // found in Lane 1, Lane 2, Lane 3!

    // Find the matching band in Lane 2 (where band is #1 at index 0, not index 3)
    const matchLane2 = findTargetBandInLane(mockAnalysis[1]!, 50, null, 15);
    expect(matchLane2).toBeTruthy();
    expect(matchLane2?.bandId).toBe('b-l2-1');
    expect(matchLane2?.sizeEst).toBe(52);

    // Find matching band in Lane 3
    const matchLane3 = findTargetBandInLane(mockAnalysis[2]!, 50, null, 15);
    expect(matchLane3).toBeTruthy();
    expect(matchLane3?.bandId).toBe('b-l3-1');
    expect(matchLane3?.sizeEst).toBe(50);

    // In Lane 4 (negative control), correctly returns null instead of throwing
    const matchLane4 = findTargetBandInLane(mockAnalysis[3]!, 50, null, 15);
    expect(matchLane4).toBeNull();

    // With very strict margin (2%), the 52 kDa band in Lane 2 will NOT match a 50 kDa target (4% diff > 2%)
    const matchLane2Strict = findTargetBandInLane(mockAnalysis[1]!, 50, null, 2);
    expect(matchLane2Strict).toBeNull();
  });

  it('renders Western blot UI with target selector, margin dropdown, and ref lane selector', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Switch to Tab 3 (Band Quantification)
    const quantTab = screen.getByRole('button', { name: /Band Quantification & Amounts/i });
    fireEvent.click(quantTab);

    // Click "Per Target Mass (WB Mode)"
    const wbModeBtn = screen.getByRole('button', { name: /Per Target Mass \(WB Mode\)/i });
    fireEvent.click(wbModeBtn);

    // Ensure Target selector is present
    expect(screen.getByText('Target:')).toBeTruthy();
    const targetSelect = screen.getByTitle(/Target band to compare across all wells/i) as HTMLSelectElement;
    expect(targetSelect).toBeTruthy();
    expect(targetSelect.options.length).toBeGreaterThan(0);

    // Ensure Margin selector is present with options
    expect(screen.getByText('Margin:')).toBeTruthy();
    const marginSelect = screen.getByTitle(/Margin of detection/i) as HTMLSelectElement;
    expect(marginSelect).toBeTruthy();
    expect(marginSelect.value).toBe('15');

    // Change margin to ±25%
    fireEvent.change(marginSelect, { target: { value: '25' } });
    expect(marginSelect.value).toBe('25');

    // Ensure Ref lane selector is present
    expect(screen.getByText('Ref:')).toBeTruthy();
    const refSelect = screen.getByTitle(/Reference lane for relative fold change/i) as HTMLSelectElement;
    expect(refSelect).toBeTruthy();

    // Verify Western Blot publication preview section is visible
    expect(screen.getByText(/Western Blot Mode/i)).toBeTruthy();
    expect(screen.getByText(/Horizontally Aligned Center Line/i)).toBeTruthy();
  });
});
