import { toolsByCategory } from '@/tools/registry';

export function Home() {
  return (
    <section class="mx-auto max-w-6xl p-4">
      <input type="search" role="searchbox" placeholder="Search tools" class="w-full rounded-lg border p-2" />
      {toolsByCategory().map(g => <h2 key={g.category} class="mt-6 font-semibold">{g.label}</h2>)}
    </section>
  );
}
