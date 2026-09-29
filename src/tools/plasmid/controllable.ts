import { useState } from 'preact/hooks';

/** A boolean the parent may own (`value` + `onChange`); without them the component keeps its own state. */
export function useControllableFlag(value: boolean | undefined, onChange: ((next: boolean) => void) | undefined, initial: boolean): [boolean, () => void] {
  const [local, setLocal] = useState(initial);
  const current = value ?? local;
  return [current, () => { if (onChange) onChange(!current); else setLocal(!current); }];
}
