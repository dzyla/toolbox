import { navigate } from '../router';

export function NotFound({ what = 'Page' }: { what?: string }) {
  return (
    <section class="mx-auto max-w-xl p-6">
      <h1 class="text-2xl font-bold">{what} not found</h1>
      <button type="button" class="mt-4 underline" onClick={() => navigate({ name: 'home' })}>Back to Home</button>
    </section>
  );
}
