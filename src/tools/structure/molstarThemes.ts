/** Our own Mol* colour theme: pLDDT read from the B-factor column (bundled with the Mol* chunk). */
import { Bond, StructureElement, Unit } from 'molstar/lib/mol-model/structure';
import type { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ColorThemeCategory } from 'molstar/lib/mol-theme/color/categories';
import { Color } from 'molstar/lib/mol-util/color';
import { TableLegend } from 'molstar/lib/mol-util/legend';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PLDDT_BANDS, plddtColor } from './colour-scales';

export const PLDDT_THEME = 'bio-bench-plddt';

const Params = {
  /** B-factor × scale = pLDDT on 0–100 (100 for files that store 0–1). */
  scale: PD.Numeric(1, { min: 1, max: 100, step: 99 }),
};
type Props = PD.Values<typeof Params>;

const NO_SCORE = Color(0xaaaaaa);

function PlddtTheme(ctx: { structure?: unknown }, props: Props): ColorTheme<typeof Params> {
  const scale = props.scale;
  const atomColor = (unit: Unit, element: number) => (Unit.isAtomic(unit)
    ? Color(plddtColor(unit.model.atomicConformation.B_iso_or_equiv.value(element as never) * scale))
    : NO_SCORE);
  const color = (location: unknown) => {
    if (StructureElement.Location.is(location)) return atomColor(location.unit, location.element);
    if (Bond.isLocation(location)) return atomColor(location.aUnit, location.aUnit.elements[location.aIndex]!);
    return NO_SCORE;
  };
  return {
    factory: PlddtTheme,
    granularity: 'group',
    preferSmoothing: true,
    color,
    props,
    description: 'pLDDT from the B-factor column, in the AlphaFold confidence bands.',
    legend: TableLegend(PLDDT_BANDS.map(b => [b.label, Color(b.color)])),
  } as ColorTheme<typeof Params>;
}

export const PlddtThemeProvider: ColorTheme.Provider<typeof Params, typeof PLDDT_THEME> = {
  name: PLDDT_THEME,
  label: 'pLDDT (B-factor column)',
  category: ColorThemeCategory.Validation,
  factory: PlddtTheme as ColorTheme.Provider<typeof Params>['factory'],
  getParams: () => Params,
  defaultValues: PD.getDefaultValues(Params),
  isApplicable: () => true,
};
