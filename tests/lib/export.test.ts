import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText, toCsv } from '@/lib/export';

describe('toCsv', () => {
  it('quotes fields containing commas, quotes, and line breaks (RFC 4180)', () => {
    expect(toCsv([['Sample, A', 'say "hi"', 'line\nbreak', 'cr\rhere', 3.5]])).toBe(
      '"Sample, A","say ""hi""","line\nbreak","cr\rhere",3.5',
    );
  });

  it('leaves plain fields unquoted and keeps empty rows', () => {
    expect(toCsv([['a', 1], [], ['b', '']])).toBe('a,1\n\nb,');
  });
});

describe('downloadText', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('revokes the object URL only after the click has been dispatched', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadText('x', 'file.txt');
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
