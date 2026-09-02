import { useEffect } from 'preact/hooks';
import { route } from './router';
import { initTheme } from './theme';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { ToolPage } from './pages/ToolPage';
import { NotFound } from './pages/NotFound';

export function App() {
  useEffect(() => { initTheme(); }, []);
  const r = route.value;
  return (
    <div class="flex min-h-screen flex-col">
      <Nav />
      <main class="flex-1">
        {r.name === 'home' && <Home />}
        {r.name === 'tool' && <ToolPage toolId={r.toolId} projectId={r.projectId} />}
        {r.name === 'notfound' && <NotFound />}
      </main>
      <Footer />
    </div>
  );
}
