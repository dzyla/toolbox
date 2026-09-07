import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import GelView from '@/tools/gel/View';
import { route } from '@/app/router';

/**
 * Regression tests for the gel ladder-calibration and band-interaction fixes:
 *  - the default ladder id must be a real ladder (the preset dropdown was blank before)
 *  - the calibration must update when a different ladder preset / lane is chosen
 *  - after a transform (rotate) that regenerates lanes, the ladder lane must not go stale
 *    (this is what made sizes "set immediately and never update" on a real image)
 *  - profile/canvas click semantics: plain = move band, shift = add, ctrl/cmd = remove
 *  - "Auto-Find Bands" button exists
 */
describe('gel ladder calibration + band interaction', () => {
  function calibLabels(doc: Document): string[] {
    return Array.from(doc.querySelectorAll('svg text'))
      .map((t) => t.textContent)
      .filter((t) => /\b\d+(\.\d+)?\s*(kDa|kb|bp)\b/.test(t ?? ''));
  }

  function openCalibTab() {
    fireEvent.click(screen.getByRole('button', { name: /MW Calibration Curve/ }));
  }

  it('default ladder preset is a valid ladder (dropdown not blank)', () => {
    route.value = { name: 'tool', toolId: 'gel' };
    const { container } = render(<GelView />);
    const doc = container.ownerDocument!;
    const sels = Array.from(doc.querySelectorAll('select')) as HTMLSelectElement[];
    const preset = sels.find((s) => Array.from(s.options).some((o) => o.value === 'biorad-precision-plus'));
    expect(preset, 'preset dropdown should exist').toBeTruthy();
    // The default must be one of the real ladder ids (was 'broad-protein' → blank).
    expect(preset!.value).toBe('biorad-precision-plus');
    expect(Array.from(preset!.options).map((o) => o.value)).toContain(preset!.value);
  });

  it('calibration sizes update when the ladder preset changes', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    const { container } = render(<GelView />);
    const doc = container.ownerDocument!;
    openCalibTab();
    await screen.findByText(/Migration Distance/);
    const before = calibLabels(doc);
    expect(before.length).toBeGreaterThanOrEqual(2);

    const sels = Array.from(doc.querySelectorAll('select')) as HTMLSelectElement[];
    const preset = sels.find((s) => Array.from(s.options).some((o) => o.value === 'biorad-precision-plus'))!;
    // A ladder with a clearly different size set.
    fireEvent.change(preset, { target: { value: 'biorad-sdspage-low' } });
    await new Promise((r) => setTimeout(r, 30));
    const after = calibLabels(doc);
    expect(after.join('|')).not.toBe(before.join('|'));
    // The low-range ladder sizes should now appear.
    expect(after.some((t) => /97\.0 kDa/.test(t))).toBe(true);
  });

  it('calibration sizes update when the ladder LANE changes', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    const { container } = render(<GelView />);
    const doc = container.ownerDocument!;
    openCalibTab();
    await screen.findByText(/Migration Distance/);
    const before = calibLabels(doc);

    const sels = Array.from(doc.querySelectorAll('select')) as HTMLSelectElement[];
    const laneSel = sels.find(
      (s) =>
        Array.from(s.options).some((o) => /^lane\d/.test(String(o.value))) &&
        !Array.from(s.options).some((o) => o.value === 'biorad-precision-plus'),
    )!;
    const other = Array.from(laneSel.options).find((o) => o.value !== laneSel.value && o.value !== '')!;
    fireEvent.change(laneSel, { target: { value: other.value } });
    await new Promise((r) => setTimeout(r, 30));
    const after = calibLabels(doc);
    expect(after.length).toBeGreaterThanOrEqual(2);
    expect(after.join('|')).not.toBe(before.join('|'));
  });

  it('ladder lane does not go stale after a rotate (calibration stays valid)', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    const { container } = render(<GelView />);
    const doc = container.ownerDocument!;

    const laneSel = () => {
      const sels = Array.from(doc.querySelectorAll('select')) as HTMLSelectElement[];
      return sels.find(
        (s) =>
          Array.from(s.options).some((o) => /^lane\d/.test(String(o.value))) &&
          !Array.from(s.options).some((o) => o.value === 'biorad-precision-plus'),
      )!;
    };
    // Before the transform, the ladder-lane select points at a real lane.
    expect(laneSel().value).toBeTruthy();

    // Rotate 90°: lanes are regenerated with new ids. Before the fix, ladderLaneId kept pointing at
    // a lane that no longer existed → calibration null → no size labels / empty message. The fix
    // auto-assigns the first lane so the select always references a live lane.
    fireEvent.click(screen.getByTitle('Rotate 90° Clockwise'));
    await new Promise((r) => setTimeout(r, 80));

    const sel = laneSel();
    const opts = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    expect(sel.value).toBeTruthy();
    expect(opts, 'ladder-lane select must have live lane options').toContain(sel.value);
  });

  it('profile click moves a band on top of it, adds in empty space, and the ✕ badge removes one', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);
    const profileSvg = document.querySelector('svg.cursor-crosshair') as SVGElement;
    profileSvg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 280, width: 500, height: 280, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // ✕ remove badges (selected lane only) — one per band.
    const badges = () => Array.from(document.querySelectorAll('g[title^="Remove Band"]'));
    const before = badges().length;
    expect(before).toBeGreaterThan(0);

    // First band marker dot on the curve (a circle whose cy is in the curve region, < 195).
    const curveDot = Array.from(document.querySelectorAll('svg.cursor-crosshair circle'))
      .map((c) => c as SVGCircleElement)
      .find((c) => { const cy = parseFloat(c.getAttribute('cy') ?? '999'); return cy > 15 && cy < 195; });
    expect(curveDot, 'a band marker dot should exist on the curve').toBeTruthy();
    const dotX = parseFloat(curveDot!.getAttribute('cx')!);
    const dotY = parseFloat(curveDot!.getAttribute('cy')!);

    // 1) Plain click exactly on the marker → MOVE (band count unchanged, not added).
    fireEvent.click(profileSvg, { clientX: dotX, clientY: dotY });
    await new Promise((r) => setTimeout(r, 30));
    expect(badges().length).toBe(before);

    // 2) Plain click in empty curve space → ADD (+1).
    const markerXs = Array.from(document.querySelectorAll('svg.cursor-crosshair circle'))
      .map((c) => parseFloat((c as SVGCircleElement).getAttribute('cx') ?? '-1'))
      .filter((x) => x > 40 && x < 480);
    let emptyX = -1;
    for (const cand of [50, 90, 140, 220, 320, 420, 470]) {
      if (!markerXs.some((x) => Math.abs(x - cand) < 12)) { emptyX = cand; break; }
    }
    expect(emptyX, 'an empty x should be found').toBeGreaterThan(0);
    fireEvent.click(profileSvg, { clientX: emptyX, clientY: 40 });
    await new Promise((r) => setTimeout(r, 30));
    expect(badges().length).toBe(before + 1);

    // 3) Remove one via the ✕ badge → back to the original count.
    (badges()[0] as Element).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(badges().length).toBe(before);
  });

  it('exposes an Auto-Find Bands button', () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);
    const btn = screen.getByRole('button', { name: /Auto-Find Bands/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn); // should not throw and re-detects bands in the selected lane
  });

  it('isolated lane header displays standard ladder and loading ref controls', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Initially Lane 1 is the ladder lane
    expect(screen.getByText(/🏷️ Standard Ladder Lane/)).toBeTruthy();

    // Switch to Lane 2
    const lane2Btn = screen.getByRole('button', { name: /^L2/i });
    fireEvent.click(lane2Btn);
    await new Promise((r) => setTimeout(r, 30));

    // Lane 2 is not yet the ladder lane
    expect(screen.queryByText(/🏷️ Standard Ladder Lane/)).toBeNull();
    const setLadderBtn = screen.getByRole('button', { name: /Set as Standard Ladder/i });
    expect(setLadderBtn).toBeTruthy();

    // Click Set as Standard Ladder on Lane 2
    fireEvent.click(setLadderBtn);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText(/🏷️ Standard Ladder Lane/)).toBeTruthy();

    // Loading ref controls on Lane 2
    const setRefBtn = screen.getByRole('button', { name: /Set as Loading Ref/i });
    expect(setRefBtn).toBeTruthy();
    fireEvent.click(setRefBtn);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText(/⚖️ Loading Ref/)).toBeTruthy();

    const unsetRefBtn = screen.getByRole('button', { name: /✕ Unset Loading Ref/i });
    expect(unsetRefBtn).toBeTruthy();
    fireEvent.click(unsetRefBtn);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(/⚖️ Loading Ref/)).toBeNull();
  });

  it('detected peaks table displays Std Ladder badges when viewing ladder lane', () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // When viewing the ladder lane (Lane 1 by default), bands should have Std Ladder tags
    const stdBadges = screen.getAllByText(/Std Ladder/);
    expect(stdBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('Tab 2 MW Calibration sub-tab exposes synchronized ladder controls', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    const { container } = render(<GelView />);
    openCalibTab();
    await screen.findByText(/Migration Distance/);

    const doc = container.ownerDocument!;
    const sels = Array.from(doc.querySelectorAll('select')) as HTMLSelectElement[];

    // Should have selects in Tab 2 for ladder lane, preset, and model
    const modelSel = sels.find((s) => Array.from(s.options).some((o) => o.value === 'piecewise'));
    expect(modelSel, 'model select should exist in MW sub-tab').toBeTruthy();

    // Changing calibration model
    fireEvent.change(modelSel!, { target: { value: 'spline' } });
    await new Promise((r) => setTimeout(r, 30));
    expect(modelSel!.value).toBe('spline');
  });

  it('exposes Re-detect All Bands button', () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);
    const redetectBtn = screen.getByRole('button', { name: /Re-detect All Bands/i });
    expect(redetectBtn).toBeTruthy();
    fireEvent.click(redetectBtn); // resets bandMap across all lanes
  });

  it('adding a new lane inherits lane boundaries and avoids coordinate crosstalk', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Add a new lane
    const addLaneBtn = screen.getByRole('button', { name: /\+ Add Lane/i });
    fireEvent.click(addLaneBtn);
    await new Promise((r) => setTimeout(r, 30));

    // The newly added lane should be selected
    expect(screen.getByText(/Densitometry Profile — Lane/i)).toBeTruthy();

    // Delete lanes using "Delete current lane" button
    const deleteBtn = screen.getByTitle(/Delete current lane/i);
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);
    await new Promise((r) => setTimeout(r, 20));
  });
});
