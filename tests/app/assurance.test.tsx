import { describe, expect, it } from 'vitest';
import { ASSURANCE, assuranceFor, assuranceSummary } from '@/tools/assurance';
import { TOOLS } from '@/tools/registry';
import { render, screen, waitFor } from '@testing-library/preact';
// App imports compat; the Preact fireEvent helper then incorrectly remaps select change to input.
import { fireEvent } from '@testing-library/dom';
import { Assurance } from '@/app/pages/Assurance';
import { App } from '@/app/App';
import { parseRoute, route, toHash } from '@/app/router';

describe('scientific assurance registry', () => {
  it('assigns one honest assurance record to every registered tool', () => {
    expect(TOOLS).toHaveLength(38);
    expect(Object.keys(ASSURANCE).sort()).toEqual(TOOLS.map(tool => tool.id).sort());
    expect(Object.values(ASSURANCE).every(record => record.scope.length > 20 && record.verification.length > 12)).toBe(true);
    expect(assuranceSummary()['reference-tested']).toBeGreaterThan(0);
  });

  it('rejects assurance lookups for unregistered tools', () => {
    expect(() => assuranceFor('not-a-registered-tool')).toThrow('No assurance record is registered');
  });
});

describe('methods and assurance navigation', () => {
  it('shows the complete inventory and honest methods links', () => {
    render(<Assurance />);
    expect(screen.getByRole('heading', { name: 'Methods & Assurance' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /^Open .* tool$/ })).toHaveLength(TOOLS.length);
    expect(screen.getAllByText('Methods available inside the tool')).toHaveLength(TOOLS.length);
    expect(screen.getByRole('link', { name: 'Open Centrifuge tool' }).getAttribute('href')).toBe('#/tool/centrifuge?methods=1');
    expect(screen.queryByText(/wet-lab certified/i)).toBeNull();
  });

  it('combines labelled category and assurance filters and handles empty results', async () => {
    render(<Assurance />);
    const status = screen.getByLabelText('Assurance status');
    const category = screen.getByLabelText('Category');
    fireEvent.change(status, { target: { value: 'reference-tested' } });
    await waitFor(() => expect(screen.getAllByRole('link', { name: /^Open .* tool$/ })).toHaveLength(7));
    expect(screen.queryByRole('link', { name: 'Open Molarity & Dilution tool' })).toBeNull();
    fireEvent.change(category, { target: { value: 'calculators' } });
    await waitFor(() => expect(screen.getAllByRole('link', { name: /^Open .* tool$/ })).toHaveLength(3));
    expect(screen.getByRole('link', { name: 'Open Centrifuge tool' })).toBeTruthy();
    fireEvent.change(category, { target: { value: 'counting' } });
    await waitFor(() => expect(screen.queryByRole('link', { name: /^Open .* tool$/ })).toBeNull());
    expect(screen.getByRole('status').textContent).toContain(`0 of ${TOOLS.length}`);
    expect(screen.getByText(/No tools match/)).toBeTruthy();
    fireEvent.change(status, { target: { value: 'all' } });
    await waitFor(() => expect(screen.getAllByRole('link', { name: /^Open .* tool$/ })).toHaveLength(3));
  });

  it('parses assurance and preserves methods intent together with saved tool state', () => {
    expect(parseRoute('#/assurance')).toEqual({ name: 'assurance' });
    expect(toHash({ name: 'assurance' })).toBe('#/assurance');
    const expected = { name: 'tool', toolId: 'centrifuge', projectId: 'p1', state: 'AB', methods: true } as const;
    expect(parseRoute('#/tool/centrifuge/p/p1?s=AB&methods=1')).toEqual(expected);
    expect(parseRoute(toHash(expected))).toEqual(expected);
    expect(parseRoute('#/t/centrifuge?methods=0')).toEqual({ name: 'tool', toolId: 'centrifuge' });
  });

  it('renders the assurance route through the app navigation', () => {
    route.value = parseRoute('#/assurance');
    try {
      render(<App />);
      expect(screen.getByRole('heading', { name: 'Methods & Assurance' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Methods & Assurance' }).getAttribute('aria-current')).toBe('page');
    } finally {
      route.value = { name: 'home' };
    }
  });
});
