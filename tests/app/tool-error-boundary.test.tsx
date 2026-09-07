import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { ToolErrorBoundary } from '@/app/components/ToolErrorBoundary';

function BrokenTool(): never {
  throw new Error('deliberate test failure');
}

describe('ToolErrorBoundary', () => {
  it('keeps a recovery action available when a tool throws during rendering', async () => {
    const onReturnToTools = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ToolErrorBoundary resetKey="broken-tool" onReturnToTools={onReturnToTools}>
        <BrokenTool />
      </ToolErrorBoundary>,
    );

    expect((await screen.findByRole('alert')).textContent).toContain('This tool could not be displayed.');
    fireEvent.click(screen.getByRole('button', { name: 'Return to tools' }));
    expect(onReturnToTools).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
