/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

// Plotly partial bundle (scatter + scattergl); typed through PlotlyApi in src/tools/sec/plotly-runtime.ts.
declare module 'plotly.js-gl2d-dist-min' {
  const Plotly: unknown;
  export default Plotly;
}
