import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/preact';
// Select change events must come from the DOM helper (preact/compat remaps them to input).
import { fireEvent as domFire } from '@testing-library/dom';
import { route } from '@/app/router';
import BuffersView from '@/tools/buffers/View';

const results = () => screen.getByTestId('buffer-results').textContent ?? '';

beforeEach(() => { route.value = { name: 'tool', toolId: 'buffers' }; });

describe('buffer rows', () => {
  it('turns the first row into a Tris buffer made to pH 8: weigh the base, add HCl', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    expect(screen.getByLabelText('Buffer system')).toBeTruthy();
    expect(results()).toMatch(/Tris base/);
    expect(results()).toMatch(/605\.7 mg/);
    expect(results()).toMatch(/HCl 1 M/);
    expect(screen.getByTestId('ph-check').textContent).toMatch(/pH 8 at 25 °C/);
  });

  it('a premade pH-adjusted stock is just a dilution', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Premade stock' }));
    expect(results()).toMatch(/Tris \(1 M, pH 8\)/);
    expect(results()).toMatch(/(?:^|[^\d.])5(?:\.0+)? mL/);
    expect(results()).not.toMatch(/HCl|NaOH/);
  });

  it('warns when the pH was set at 25 °C but the working temperature is 4 °C, and offers to adjust at 4 °C', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    fireEvent.input(screen.getByLabelText('Working temperature (°C)'), { target: { value: '4' } });
    fireEvent.input(screen.getByLabelText('pH measured at (°C)'), { target: { value: '25' } });
    const check = screen.getByTestId('ph-check');
    expect(check.textContent).toMatch(/pH 8 at 25 °C → pH 8\.5[89] at 4 °C/);
    fireEvent.click(within(check).getByRole('button', { name: /Adjust at 4 °C instead/ }));
    expect(screen.getByTestId('ph-check').textContent).toMatch(/pH 8 at 4 °C/);
    expect(screen.getByTestId('ph-check').textContent).not.toMatch(/→/);
  });

  it('switches to mixing the acid and base forms for phosphate', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    domFire.change(screen.getByLabelText('Buffer system'), { target: { value: 'phosphate' } });
    domFire.change(screen.getByLabelText('Method'), { target: { value: 'mix-forms' } });
    expect(results()).toMatch(/NaH₂PO₄/);
    expect(results()).toMatch(/Na₂HPO₄/);
    expect(results()).not.toMatch(/HCl|NaOH/);
  });

  it('shows a message, not a crash, when the pH field is cleared (review focus 1)', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    fireEvent.input(screen.getByLabelText('Target pH'), { target: { value: '' } });
    expect(screen.getByRole('alert').textContent).toMatch(/pH and temperature must be numbers/);
    fireEvent.input(screen.getByLabelText('Target pH'), { target: { value: '8' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns, in the sheet and on the row, when the pH is far from every pKa', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    fireEvent.input(screen.getByLabelText('Target pH'), { target: { value: '3' } });
    expect(screen.getByLabelText('Warnings').textContent).toMatch(/barely buffers/);
    expect(screen.getByTestId('ph-check').textContent).toMatch(/barely buffers|useful range/);
  });

  it('shows where the pKa came from, and follows the buffer system select', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    expect(document.body.textContent).toMatch(/pKa source.*Good et al\. 1966/);
    domFire.change(screen.getByLabelText('Buffer system'), { target: { value: 'caps' } });
    expect(document.body.textContent).toMatch(/pKa source.*Supplier buffer reference tables/);
    // The row's own aria-labels still resolve uniquely.
    expect(screen.getByLabelText('Buffer system')).toBeTruthy();
    expect(screen.getByLabelText('Target pH')).toBeTruthy();
  });

  it('says plainly that CAPS has no published temperature coefficient instead of reporting a ~0 drift', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    domFire.change(screen.getByLabelText('Buffer system'), { target: { value: 'caps' } });
    fireEvent.input(screen.getByLabelText('Working temperature (°C)'), { target: { value: '4' } });
    fireEvent.input(screen.getByLabelText('pH measured at (°C)'), { target: { value: '25' } });
    const check = () => screen.getByTestId('ph-check').textContent ?? '';
    expect(check()).toMatch(/no published temperature coefficient/);
    expect(check()).toMatch(/not corrected for temperature/);
    // Tris has one, so the notice is specific to buffers whose coefficient is missing.
    domFire.change(screen.getByLabelText('Buffer system'), { target: { value: 'tris' } });
    fireEvent.input(screen.getByLabelText('pH measured at (°C)'), { target: { value: '25' } });
    expect(check()).not.toMatch(/no published temperature coefficient/);
  });

  it('keeps unique checkbox state for the two lines a buffer row produces (review focus 5)', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    // The ionic-strength toggle is also a checkbox, so look only inside the weigh-out list.
    const list = () => within(screen.getByLabelText('Weigh-out list')).getAllByRole('checkbox') as HTMLInputElement[];
    expect(list()).toHaveLength(2);
    fireEvent.click(list()[0]!);
    expect(list()[0]!.checked).toBe(true);
    expect(list()[1]!.checked).toBe(false);
  });
});

describe('ionic strength in the sheet', () => {
  it('names what is left out instead of claiming "about 0 M", and reports a number once a buffer row exists', () => {
    render(<BuffersView />);
    // The default row is a plain Tris-base solid, which the ionic-strength model does not cover.
    expect(screen.getByTestId('ionic-strength').textContent)
      .toMatch(/Ionic strength is not estimated: none of these components is in the ionic-strength model \(Tris-base\)\./);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    expect(screen.getByTestId('ionic-strength').textContent).toMatch(/Ionic strength about 0\.0\d+ M\./);
    expect(screen.getByTestId('ionic-strength').textContent).not.toMatch(/excludes|not estimated/);
  });
});

describe('Set pH… on a matching solid row', () => {
  it('converts the default Tris-base row to a buffer with the Tris-base form and the same concentration', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: /Set pH/ }));
    expect(screen.getByLabelText('Buffer system')).toBeTruthy();
    expect((screen.getByLabelText('Target concentration') as HTMLInputElement).value).toBe('10');
    expect(results()).toMatch(/Tris base/);
  });

  it('is not offered for a non-buffer chemical', () => {
    render(<BuffersView />);
    fireEvent.input(screen.getByLabelText('Chemical search'), { target: { value: 'Sodium Chloride' } });
    fireEvent.click(screen.getByRole('button', { name: /Sodium Chloride \(NaCl\)/ }));
    expect(screen.queryByRole('button', { name: /Set pH/ })).toBeNull();
  });
});
