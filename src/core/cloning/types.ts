/** A problem or note raised while designing: blockers stop the output, warnings and info do not. */
export interface Finding {
  code: string;
  severity: 'blocker' | 'warning' | 'info';
  message: string;
  fragmentId?: string;
  junctionIndex?: number;
}
