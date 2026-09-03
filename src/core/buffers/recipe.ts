export type RecipeUnit = 'M' | 'mM' | '%' | 'x';
export interface RecipeTarget { value: number; unit: RecipeUnit }
export interface SolidComponent { name: string; kind: 'solid'; mw?: number; waters?: number; target: RecipeTarget }
export interface StockComponent { name: string; kind: 'stock'; stockConc: number; stockUnit: RecipeUnit; target: RecipeTarget; density?: number }
export type RecipeComponent = SolidComponent | StockComponent;
export interface RecipeRow { name: string; amount: number; unit: 'g' | 'mL'; mass_g?: number }
export class BufferRecipeError extends Error {}

const WATER_MW = 18.01528;
const hydrateName = (name: string) => /hydrate|anhydrous|[·.]\s*\d*\s*h[₂2]o/i.test(name);
const positive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new BufferRecipeError(`${label} must be a positive number`);
};

function molarValue(value: number, unit: RecipeUnit): number {
  if (unit === 'M') return value;
  if (unit === 'mM') return value / 1000;
  throw new BufferRecipeError(`Unit ${unit} is not a molar concentration`);
}

/** Resolve a recipe into grams for solids and millilitres for liquid stocks. */
export function solveRecipe(components: RecipeComponent[], finalVolume_L: number): RecipeRow[] {
  positive(finalVolume_L, 'Final volume');
  return components.map(component => {
    positive(component.target.value, `${component.name} target`);
    if (component.kind === 'solid') {
      if (component.target.unit === '%') {
        return { name: component.name, amount: component.target.value * finalVolume_L * 10, unit: 'g' };
      }
      if (component.target.unit === 'x') throw new BufferRecipeError(`${component.name}: an x target requires a liquid x stock`);
      positive(component.mw ?? NaN, `${component.name} molecular weight`);
      if (component.waters !== undefined && (!Number.isInteger(component.waters) || component.waters < 0)) {
        throw new BufferRecipeError(`${component.name} waters must be a non-negative integer`);
      }
      const extraWaters = hydrateName(component.name) ? 0 : (component.waters ?? 0);
      const effectiveMw = component.mw! + extraWaters * WATER_MW;
      return { name: component.name, amount: molarValue(component.target.value, component.target.unit) * finalVolume_L * effectiveMw, unit: 'g' };
    }

    positive(component.stockConc, `${component.name} stock concentration`);
    const molarPair = (component.stockUnit === 'M' || component.stockUnit === 'mM')
      && (component.target.unit === 'M' || component.target.unit === 'mM');
    const sameSpecialUnit = (component.stockUnit === '%' && component.target.unit === '%')
      || (component.stockUnit === 'x' && component.target.unit === 'x');
    if (!molarPair && !sameSpecialUnit) {
      throw new BufferRecipeError(`${component.name}: stock unit ${component.stockUnit} is incompatible with target unit ${component.target.unit}`);
    }
    const stock = molarPair ? molarValue(component.stockConc, component.stockUnit) : component.stockConc;
    const target = molarPair ? molarValue(component.target.value, component.target.unit) : component.target.value;
    if (target > stock) throw new BufferRecipeError(`${component.name}: target concentration cannot exceed the stock`);
    const amount = target / stock * finalVolume_L * 1000;
    const row: RecipeRow = { name: component.name, amount, unit: 'mL' };
    if (component.density !== undefined) {
      positive(component.density, `${component.name} density`);
      row.mass_g = amount * component.density;
    }
    return row;
  });
}
