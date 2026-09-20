import type { Config, Data, Layout, PlotlyHTMLElement } from 'plotly.js';

export interface PlotlyApi {
  newPlot: (
    root: HTMLElement,
    data: Data[],
    layout?: Partial<Layout>,
    config?: Partial<Config>,
  ) => Promise<PlotlyHTMLElement>;
  react: (
    root: HTMLElement,
    data: Data[],
    layout?: Partial<Layout>,
    config?: Partial<Config>,
  ) => Promise<PlotlyHTMLElement>;
  restyle: (
    root: HTMLElement,
    update: Record<string, unknown>,
    traces?: number | number[],
  ) => Promise<PlotlyHTMLElement>;
  relayout: (
    root: HTMLElement,
    update: Record<string, unknown>,
  ) => Promise<PlotlyHTMLElement>;
  purge: (root: HTMLElement) => void;
}

export async function loadPlotly(): Promise<PlotlyApi> {
  const module = await import('plotly.js-dist-min');
  return module.default as unknown as PlotlyApi;
}
