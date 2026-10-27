/**
 * The one Mol* plugin behind MolstarViewer. Everything that touches Mol* lives here, so the
 * component only pulls it in with a dynamic import (it lands next to the lazily loaded Mol* chunk).
 *
 * One plugin per mounted viewer: structures are swapped in with `load`, layout changes go through
 * `plugin.layout.setProps`, and the React (preact/compat) root Mol* renders into is unmounted on
 * dispose. Not unmounting that root was the cause of the old "does not load a new structure" bug.
 */
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { DefaultPluginUISpec, type PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import {
  PresetStructureRepresentations,
  StructureRepresentationPresetProvider,
  presetStaticComponent,
} from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { StateObjectRef } from 'molstar/lib/mol-state';
import { StructureElement, StructureProperties, StructureSelection, type Structure } from 'molstar/lib/mol-model/structure';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { Script } from 'molstar/lib/mol-script/script';
import type { Loci } from 'molstar/lib/mol-model/loci';
import { Color } from 'molstar/lib/mol-util/color';
// Same module Mol*'s own `react-dom/client` import resolves to (preset-vite aliases react-dom to
// preact/compat), so the root created here is the one Mol* renders through, and it can be unmounted.
import { createRoot } from 'preact/compat/client';
import 'molstar/build/viewer/molstar.css';
import type { ResidueRef, StructureFormat } from '@/core/structure';
import { BFACTOR_COLORS } from './colour-scales';
import type { MolstarHandle, Representation } from './MolstarViewer';
import { PLDDT_THEME, PlddtThemeProvider } from './molstarThemes';
import { createViewerQueue, type ViewerStyle } from './viewer-queue';

export interface EngineOptions {
  showControls: boolean;
  onResidueClick(r: ResidueRef | null): void;
  onResidueHover(r: ResidueRef | null): void;
}

export interface MolstarEngine {
  handle: MolstarHandle;
  setShowControls(show: boolean): void;
  resize(): void;
  dispose(): void;
}

/** Above this many atoms ambient occlusion and outlines are switched off (interaction stays smooth). */
const BIG_STRUCTURE_ATOMS = 100_000;

/** Every component in spacefill: Mol* has no built-in preset for that. */
const SpacefillPreset = StructureRepresentationPresetProvider({
  id: 'bio-bench-spacefill',
  display: { name: 'Spacefill', description: 'All atoms as van der Waals spheres.' },
  params: () => StructureRepresentationPresetProvider.CommonParams,
  async apply(ref, params, plugin) {
    const cell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
    if (!cell?.obj) return {};
    const all = await presetStaticComponent(plugin, cell, 'all');
    const { update, builder, typeParams, color } = StructureRepresentationPresetProvider.reprBuilder(plugin, params, cell.obj.data);
    const representations = {
      all: builder.buildRepresentation(update, all, { type: 'spacefill', typeParams, color }, { tag: 'all' }),
    };
    await update.commit({ revertOnError: true });
    return { components: { all }, representations };
  },
});

type CommonPresetParams = StructureRepresentationPresetProvider.CommonParams;

function presetFor(r: Representation): StructureRepresentationPresetProvider<CommonPresetParams> {
  switch (r) {
    case 'auto': return PresetStructureRepresentations.auto;  // Mol* picks by size (cartoon, or coarse surface for huge entries)
    case 'cartoon': return PresetStructureRepresentations['polymer-and-ligand'];
    case 'surface': return PresetStructureRepresentations['molecular-surface'];
    case 'ball-and-stick': return PresetStructureRepresentations['atomic-detail'];
    case 'spacefill': return SpacefillPreset;
  }
}

/** Atom-group query matching residues by auth identifiers, so PDB and mmCIF input behave the same. */
function residueQuery(residues: ResidueRef[]) {
  const byChain = new Map<string, ResidueRef[]>();
  for (const r of residues) {
    const list = byChain.get(r.authAsymId);
    if (list) list.push(r); else byChain.set(r.authAsymId, [r]);
  }
  const P = MS.struct.atomProperty.macromolecular;
  const chainTests = [...byChain].map(([asym, list]) => MS.core.logic.and([
    MS.core.rel.eq([P.auth_asym_id(), asym]),
    MS.core.logic.or(list.map(r => MS.core.logic.and([
      MS.core.rel.eq([P.auth_seq_id(), r.authSeqId]),
      MS.core.rel.eq([P.pdbx_PDB_ins_code(), r.insCode]),
    ]))),
  ]));
  return MS.struct.generator.atomGroups({ 'residue-test': MS.core.logic.or(chainTests) });
}

function toResidueRef(loci: Loci): ResidueRef | null {
  if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) return null;
  const loc = StructureElement.Loci.getFirstLocation(loci);
  if (!loc) return null;
  return {
    authAsymId: StructureProperties.chain.auth_asym_id(loc),
    authSeqId: StructureProperties.residue.auth_seq_id(loc),
    insCode: StructureProperties.residue.pdbx_PDB_ins_code(loc) ?? '',
  };
}

const refKey = (r: ResidueRef | null) => (r ? `${r.authAsymId}:${r.authSeqId}${r.insCode}` : '');

function dataUriToBlob(uri: string): Blob {
  const [head, body = ''] = uri.split(',', 2);
  const type = /data:([^;,]+)/.exec(head ?? '')?.[1] ?? 'image/png';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function createMolstarEngine(host: HTMLElement, options: EngineOptions): Promise<MolstarEngine> {
  // Mol* renders into its own child element, which preact never diffs.
  const target = document.createElement('div');
  target.style.cssText = 'position:absolute;inset:0;';
  host.appendChild(target);
  host.setAttribute('data-load-count', '0');

  // Mol* draws its logo link without a text alternative; name it as soon as it appears.
  const nameLogo = () => host.querySelectorAll('a.msp-logo').forEach(a => {
    if (!a.getAttribute('aria-label')) a.setAttribute('aria-label', 'Mol* website (molstar.org)');
  });
  const logoObserver = new MutationObserver(nameLogo);
  logoObserver.observe(host, { childList: true, subtree: true });

  const base = DefaultPluginUISpec();
  const spec: PluginUISpec = {
    ...base,
    layout: {
      initial: {
        isExpanded: false,
        showControls: options.showControls,
        controlsDisplay: 'reactive',
        regionState: { left: 'full', right: 'full', top: 'full', bottom: 'hidden' },
      },
    },
    components: {
      ...base.components,
      controls: { ...base.components?.controls, bottom: 'none' },
      remoteState: 'none',
      // Dropped files go to the tool's own loader, not straight into Mol*.
      disableDragOverlay: true,
    },
  };

  const mount: { root?: ReturnType<typeof createRoot> } = {};
  let plugin: PluginUIContext;
  try {
    plugin = await createPluginUI({
      target,
      spec,
      render: (element, container) => {
        mount.root = createRoot(container);
        mount.root.render(element);
      },
    });
  } catch (err) {
    mount.root?.unmount();
    target.remove();
    logoObserver.disconnect();
    throw err;
  }
  plugin.representation.structure.themes.colorThemeRegistry.add(PlddtThemeProvider);
  const defaultPostprocessing = plugin.canvas3d ? { ...plugin.canvas3d.props.postprocessing } : null;

  let disposed = false;
  let loadCount = 0;

  // Number of elements in Mol*'s current selection, for tests and assistive state.
  host.setAttribute('data-selection-count', '0');
  const selectionSub = plugin.managers.structure.selection.events.changed.subscribe(() => {
    host.setAttribute('data-selection-count', String(plugin.managers.structure.selection.elementCount()));
  });
  // Atoms drawn as focus sticks (0 when none), likewise.
  host.setAttribute('data-focus-count', '0');
  const focusSub = plugin.managers.structure.focus.behaviors.current.subscribe(entry => {
    host.setAttribute('data-focus-count', String(entry ? StructureElement.Loci.size(entry.loci) : 0));
  });

  const currentStructure = (): Structure | undefined =>
    plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;

  const lociFor = (residues: ResidueRef[]): Loci | null => {
    const structure = currentStructure();
    if (!structure || residues.length === 0) return null;
    const selection = Script.getStructureSelection(residueQuery(residues), structure);
    const loci = StructureSelection.toLociWithSourceUnits(selection);
    return StructureElement.Loci.isEmpty(loci) ? null : loci;
  };

  /** Mol* theme name and parameters for the chosen colouring (null: the preset's own). */
  const theme = (style: ViewerStyle): { name: string; params: Record<string, unknown> } | null => {
    switch (style.coloring) {
      case null: return null;
      case 'uncertainty': return {
        name: 'uncertainty',
        // Mol*'s uncertainty theme reverses its list (high values get the first colour), so ours
        // (low → high) goes in back to front.
        params: { domain: style.colorScale.domain ?? [0, 100], list: { kind: 'interpolate', colors: [...BFACTOR_COLORS].reverse().map(c => Color(c)) } },
      };
      case 'plddt': return { name: PLDDT_THEME, params: { scale: style.colorScale.plddtScale ?? 1 } };
      default: return { name: style.coloring, params: {} };
    }
  };
  const presetParams = (style: ViewerStyle): CommonPresetParams => {
    const t = theme(style);
    // Our own theme name is not in Mol*'s built-in list; the registry knows it.
    return t ? { theme: { globalName: t.name as 'uncertainty', globalColorParams: t.params } } : {};
  };

  const setPostprocessingFor = (atoms: number) => {
    if (!plugin.canvas3d || !defaultPostprocessing) return;
    plugin.canvas3d.setProps({
      postprocessing: atoms > BIG_STRUCTURE_ATOMS
        ? { occlusion: { name: 'off', params: {} }, outline: { name: 'off', params: {} } }
        : { occlusion: defaultPostprocessing.occlusion, outline: defaultPostprocessing.outline },
    });
  };

  async function runLoad(isCurrent: () => boolean, data: string, format: StructureFormat, label: string, modelIndex: number, style: ViewerStyle) {
    const superseded = () => !isCurrent();
    await plugin.clear();
    if (superseded()) return;
    const raw = await plugin.builders.data.rawData({ data, label });
    if (superseded()) return;
    const trajectory = await plugin.builders.structure.parseTrajectory(raw, format);
    if (superseded()) return;
    const model = await plugin.builders.structure.createModel(trajectory, { modelIndex });
    if (superseded()) return;
    // The deposited model (not an assembly), so Mol* shows the same chains our tables describe.
    const structure = await plugin.builders.structure.createStructure(model, { name: 'model', params: {} });
    if (superseded()) return;
    setPostprocessingFor(structure.cell?.obj?.data.elementCount ?? 0);
    await plugin.builders.structure.representation.applyPreset(structure, presetFor(style.representation), presetParams(style));
    if (superseded()) return;
    const loaded = plugin.state.data.cells.get(raw.ref)?.obj?.label;
    host.setAttribute('data-loaded-label', loaded ?? '');
    loadCount += 1;
    host.setAttribute('data-load-count', String(loadCount));
  }

  // Loads and style changes share one queue (viewer-queue.ts): a load superseded before its turn is
  // skipped, one superseded mid-way stops at its next step and never sets the label or count (the
  // newer load clears whatever it built), and style changes apply between loads, never during one.
  const queue = createViewerQueue({
    isDisposed: () => disposed,
    load: runLoad,
    async applyRepresentation(style) {
      const structures = plugin.managers.structure.hierarchy.current.structures;
      if (structures.length === 0) return;
      await plugin.managers.structure.component.applyPreset(structures, presetFor(style.representation), presetParams(style));
    },
    async applyColoring(style) {
      const structures = plugin.managers.structure.hierarchy.current.structures;
      if (structures.length === 0) return;
      // Back to "Default": re-apply the representation preset, which brings its own colouring.
      const t = theme(style);
      if (!t) {
        await plugin.managers.structure.component.applyPreset(structures, presetFor(style.representation), presetParams(style));
        return;
      }
      const components = structures.flatMap(s => s.components);
      await plugin.managers.structure.component.updateRepresentationsTheme(components, { color: t.name as 'uncertainty', colorParams: t.params });
    },
    async applyHydrogens(style) {
      const manager = plugin.managers.structure.component;
      // Stored in the manager's options, so later loads (and the focus sticks) follow it too.
      await manager.setOptions({ ...manager.state.options, hydrogens: style.hydrogens ? 'all' : 'hide-all' });
    },
  });

  const handle: MolstarHandle = {
    load: queue.load,
    setRepresentation: queue.setRepresentation,
    setColoring: queue.setColoring,
    setHydrogens: queue.setHydrogens,
    highlight(residues) {
      if (disposed) return;
      const loci = lociFor(residues);
      if (loci) plugin.managers.interactivity.lociHighlights.highlightOnly({ loci }, false);
      else plugin.managers.interactivity.lociHighlights.clearHighlights();
    },
    select(residues) {
      if (disposed) return;
      const loci = lociFor(residues);
      if (loci) plugin.managers.interactivity.lociSelects.selectOnly({ loci }, false);
      else plugin.managers.interactivity.lociSelects.deselectAll();
    },
    focus(residues, opts) {
      if (disposed) return;
      const loci = lociFor(residues);
      if (!loci) {
        plugin.managers.structure.focus.clear();
        return;
      }
      // What a click in Mol* does: the residues and their 5 Å surroundings as sticks, with contacts.
      if (opts?.sticks === false) plugin.managers.structure.focus.clear();
      else plugin.managers.structure.focus.setFromLoci(loci);
      plugin.managers.camera.focusLoci(loci);
    },
    async snapshot() {
      const helper = plugin.helpers.viewportScreenshot;
      if (!helper) throw new Error('The 3D viewer has no canvas to capture');
      return dataUriToBlob(await helper.getImageDataUri());
    },
  };

  // BehaviorSubjects emit their current value on subscribe; skip that one.
  let primed = false;
  const clickSub = plugin.behaviors.interaction.click.subscribe(e => {
    if (primed) options.onResidueClick(toResidueRef(e.current.loci));
  });
  let lastHover = '';
  const hoverSub = plugin.behaviors.interaction.hover.subscribe(e => {
    if (!primed) return;
    const r = toResidueRef(e.current.loci);
    const key = refKey(r);
    if (key === lastHover) return;
    lastHover = key;
    options.onResidueHover(r);
  });
  primed = true;

  return {
    handle,
    setShowControls(show) {
      if (disposed || plugin.layout.state.showControls === show) return;
      plugin.layout.setProps({ showControls: show });
      // setProps only stores the state; the layout component (and the canvas resize) listen here.
      plugin.layout.events.updated.next(void 0);
    },
    resize() {
      if (!disposed) plugin.canvas3d?.handleResize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clickSub.unsubscribe();
      hoverSub.unsubscribe();
      logoObserver.disconnect();
      selectionSub.unsubscribe();
      focusSub.unsubscribe();
      plugin.dispose();
      mount.root?.unmount();
      target.remove();
    },
  };
}
