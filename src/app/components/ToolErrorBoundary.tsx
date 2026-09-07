import { Component, type ComponentChildren } from 'preact';

interface Props {
  children: ComponentChildren;
  resetKey: string;
  onReturnToTools: () => void;
}

interface State {
  hasError: boolean;
}

/** Keeps the app shell available when an individual tool fails to render. */
export class ToolErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static override getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidUpdate(previousProps: Props) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override render({ children, onReturnToTools }: Props, { hasError }: State) {
    if (!hasError) return children;

    return (
      <section role="alert" class="mx-auto my-6 max-w-xl rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
        <h1 class="text-lg font-semibold">This tool could not be displayed.</h1>
        <p class="mt-1 text-sm text-red-800 dark:text-red-200">Your other tools and saved work are still available.</p>
        <button
          type="button"
          onClick={onReturnToTools}
          class="mt-4 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 dark:focus:ring-offset-red-950"
        >
          Return to tools
        </button>
      </section>
    );
  }
}
