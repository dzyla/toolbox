/** Test stand-in for vite-plugin-pwa's `virtual:pwa-register/preact` (only the PWA build provides it). */
export function useRegisterSW(): never {
  throw new Error('virtual:pwa-register/preact is only available in the PWA build; mock it in the test');
}
