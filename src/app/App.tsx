import { useEffect } from 'preact/hooks';
import { lazy, Suspense } from 'preact/compat';
import { route } from './router';
import { initTheme } from './theme';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { ToolPage } from './pages/ToolPage';
import { NotFound } from './pages/NotFound';

const UpdateToast = lazy(() => import('./components/UpdateToast').then(m => ({ default: m.UpdateToast })));

export function App() {
  useEffect(() => { initTheme(); }, []);
  const r = route.value;
  return (
    <div class="flex min-h-screen flex-col w-full max-w-full overflow-x-hidden">
      <Nav />
      <main class="flex-1 w-full max-w-full overflow-x-hidden">
        {r.name === 'home' && <Home />}
        {r.name === 'tool' && <ToolPage toolId={r.toolId} projectId={r.projectId} />}
        {r.name === 'notfound' && <NotFound />}
      </main>
      <Footer />
      {import.meta.env.PROD && <Suspense fallback={null}><UpdateToast /></Suspense>}
    </div>
  );
}
