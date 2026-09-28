import { h, type ComponentChildren, type ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/**
 * Code-split a component without preact/compat: the module is fetched the first time the
 * returned component renders and cached for later renders. Tool modules stay compat-free.
 */
export function lazyView<P>(
  load: () => Promise<{ default: (props: P) => ComponentChildren }>,
  fallback: ComponentChildren,
): (props: NonNullable<P>) => ComponentChildren {
  type Loaded = ComponentType<NonNullable<P>>;
  let loaded: Loaded | null = null;
  let pending: Promise<Loaded> | null = null;
  const get = () => (pending ??= load().then(m => (loaded = m.default as unknown as Loaded)));
  return function LazyView(props: NonNullable<P>) {
    const [Comp, setComp] = useState<Loaded | null>(() => loaded);
    const [error, setError] = useState('');
    useEffect(() => {
      if (Comp) return;
      let alive = true;
      get().then(
        c => { if (alive) setComp(() => c); },
        e => { pending = null; if (alive) setError(e instanceof Error ? e.message : String(e)); },
      );
      return () => { alive = false; };
    }, [Comp]);
    if (error) return <p role="alert" class="p-6 text-sm text-rose-700 dark:text-rose-300">Could not load this view: {error}</p>;
    return Comp ? h(Comp, props) : <>{fallback}</>;
  };
}
