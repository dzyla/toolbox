import { describe, it, expect, beforeEach } from 'vitest';
import { theme, setTheme, initTheme, resolvedDark } from '@/app/theme';

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove('dark'); });
  it('defaults to system and applies dark class when set', () => {
    initTheme();
    expect(theme.value).toBe('system');
    setTheme('dark');
    expect(resolvedDark.value).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('bb.theme')).toBe('dark');
    setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
