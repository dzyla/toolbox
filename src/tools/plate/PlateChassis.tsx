import { type ComponentChildren } from 'preact';
import { type PlateFormat } from '@/core/plates/layout';

export interface WellRenderData {
  id: string; // e.g. 'A1'
  row: string; // 'A'
  col: number; // 1
  bgColor?: string;
  textColor?: string;
  isSelected?: boolean;
  isDragSelected?: boolean;
  isExcluded?: boolean;
  isOutlier?: boolean;
  topLabel?: string;
  midLabel?: string;
  botLabel?: string;
  title?: string;
  content?: ComponentChildren;
}

export interface PlateChassisProps {
  format: PlateFormat;
  rows: number;
  cols: number;
  rowLabels: string[];
  density: 'normal' | 'compact';
  title?: string;
  badge?: string;
  subtitle?: string;
  headerRight?: ComponentChildren;
  selectedWellId?: string | null;
  onWellClick?: (wellId: string) => void;
  onWellMouseDown?: (rowIdx: number, col: number) => void;
  onWellMouseEnter?: (rowIdx: number, col: number) => void;
  onWellMouseLeave?: () => void;
  onRowClick?: (rowChar: string) => void;
  onColClick?: (col: number) => void;
  getWellData: (wellId: string, rowChar: string, colNum: number, rowIdx: number) => WellRenderData;
}

export function hexToRgba(hexColor: string, alpha: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 128;
  const g = parseInt(hex.substring(2, 4), 16) || 128;
  const b = parseInt(hex.substring(4, 6), 16) || 128;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getWellTextColor(hexColor?: string): string {
  if (!hexColor) return 'text-slate-800 dark:text-slate-200';
  if (hexColor.startsWith('rgba')) {
    const m = hexColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const lum = (0.299 * parseInt(m[1]!, 10) + 0.587 * parseInt(m[2]!, 10) + 0.114 * parseInt(m[3]!, 10)) / 255;
      return lum > 0.55 ? 'text-slate-950 font-extrabold' : 'text-white font-extrabold drop-shadow-xs';
    }
  }
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 128;
  const g = parseInt(hex.substring(2, 4), 16) || 128;
  const b = parseInt(hex.substring(4, 6), 16) || 128;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.55) {
    return 'text-slate-950 font-extrabold';
  }
  return 'text-white font-extrabold drop-shadow-xs';
}

export function PlateChassis({
  format,
  rows,
  cols,
  rowLabels,
  density,
  title,
  badge = '◹ A1 NOTCH',
  subtitle,
  headerRight,
  selectedWellId,
  onWellClick,
  onWellMouseDown,
  onWellMouseEnter,
  onWellMouseLeave,
  onRowClick,
  onColClick,
  getWellData,
}: PlateChassisProps) {
  const isCompact = density === 'compact' || format > 96;
  const sizeClass = !isCompact ? 'w-14 sm:w-16 h-14 sm:h-16' : 'w-8 sm:w-9 h-8 sm:h-9';
  const colWidthClass = !isCompact && format <= 96 ? 'w-14 sm:w-16' : 'w-8 sm:w-9';
  const rowHeightClass = !isCompact ? 'h-14 sm:h-16' : 'h-8 sm:h-9';

  return (
    <div class="relative rounded-3xl border-2 border-slate-300/80 dark:border-slate-700/80 bg-linear-to-b from-slate-100 to-slate-200/90 dark:from-slate-800 dark:to-slate-900 p-3 sm:p-5 shadow-xl select-none">
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          nav, aside, header, footer, .no-print { display: none !important; }
          .print\\:block { display: block !important; }
        }
      `}</style>

      {/* Microplate Skirt Header with A1 Notch */}
      <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-300/60 dark:border-slate-700/60">
        <div class="flex items-center gap-2">
          <div class="px-2 py-0.5 rounded-md bg-slate-300/80 dark:bg-slate-700/80 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 shadow-2xs">
            {badge}
          </div>
          <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {title || `ANSI / SLAS 1-2004 Microplate · ${format}-Well Flat Bottom`}
          </span>
        </div>
        <div class="flex items-center gap-3">
          {subtitle && (
            <div class="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {subtitle}
            </div>
          )}
          {headerRight}
        </div>
      </div>

      {/* Scrollable Wells Grid */}
      <div class="overflow-x-auto pb-2">
        <div class="inline-block min-w-max">
          {/* Column Headers */}
          <div class="flex items-center mb-1.5">
            <span class="w-8 shrink-0 text-center font-bold text-xs text-slate-400"></span>
            {Array.from({ length: cols }, (_, i) => i + 1).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => onColClick?.(c)}
                title={`Select column ${c}`}
                class={`${colWidthClass} h-6 mx-0.5 rounded-md text-[11px] font-mono font-extrabold text-slate-600 dark:text-slate-400 hover:bg-sky-200/70 dark:hover:bg-sky-900/60 hover:text-sky-700 dark:hover:text-sky-300 transition shrink-0 flex items-center justify-center`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Rows */}
          {Array.from({ length: rows }, (_, rIdx) => {
            const rowChar = rowLabels[rIdx]!;

            return (
              <div key={rowChar} class="flex items-center mb-1.5">
                {/* Row Header */}
                <button
                  type="button"
                  onClick={() => onRowClick?.(rowChar)}
                  title={`Select row ${rowChar}`}
                  class={`w-8 ${rowHeightClass} mr-1 rounded-md text-xs font-mono font-extrabold text-slate-600 dark:text-slate-400 hover:bg-sky-200/70 dark:hover:bg-sky-900/60 hover:text-sky-700 dark:hover:text-sky-300 transition shrink-0 flex items-center justify-center`}
                >
                  {rowChar}
                </button>

                {/* Wells */}
                {Array.from({ length: cols }, (_, cIdx) => {
                  const colNum = cIdx + 1;
                  const wellId = `${rowChar}${colNum}`;
                  const wp = getWellData(wellId, rowChar, colNum, rIdx);
                  const isSelected = selectedWellId === wellId || wp.isSelected;

                  return (
                    <button
                      key={wellId}
                      type="button"
                      onMouseDown={() => onWellMouseDown?.(rIdx, colNum)}
                      onMouseEnter={() => onWellMouseEnter?.(rIdx, colNum)}
                      onMouseLeave={onWellMouseLeave}
                      onClick={() => onWellClick?.(wellId)}
                      title={wp.title || wellId}
                      style={{
                        backgroundColor: wp.bgColor,
                      }}
                      class={`
                        ${sizeClass} rounded-full mx-0.5 relative transition-all duration-150 shrink-0
                        ${wp.bgColor
                          ? `border-2 border-black/25 dark:border-white/20 shadow-inner ${wp.textColor || getWellTextColor(wp.bgColor)}`
                          : 'border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-950/60 shadow-inner hover:border-slate-400 dark:hover:border-slate-500'
                        }
                        ${isSelected ? 'ring-3 ring-sky-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 scale-105 z-10 shadow-md' : ''}
                        ${wp.isDragSelected && !isSelected ? 'ring-2 ring-accent-500 scale-102 z-10 shadow-xs' : ''}
                        ${wp.isExcluded ? 'opacity-40 grayscale-70' : ''}
                        flex flex-col items-center justify-center p-1
                      `}
                    >
                      {/* Outer rim 3D inset reflection */}
                      <span class="absolute inset-0.5 rounded-full pointer-events-none border border-white/20 dark:border-white/10" />

                      {/* Outlier Badge */}
                      {wp.isOutlier && (
                        <span class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center font-bold shadow-xs">
                          !
                        </span>
                      )}

                      {/* Excluded Strike */}
                      {wp.isExcluded && (
                        <span class="absolute inset-0 flex items-center justify-center pointer-events-none text-rose-500/80 font-bold text-lg">
                          ✕
                        </span>
                      )}

                      {wp.content ? (
                        wp.content
                      ) : isCompact ? (
                        <div class="flex flex-col items-center justify-center w-full h-full">
                          <span class="text-[9px] font-mono font-extrabold leading-none">{wp.topLabel || wellId}</span>
                          {wp.botLabel ? (
                            <span class="text-[7.5px] font-mono font-bold leading-none truncate max-w-full px-0.5 mt-0.5">
                              {wp.botLabel}
                            </span>
                          ) : wp.midLabel && wp.midLabel !== '—' && (
                            <span class="text-[7px] leading-none truncate max-w-full px-0.5 mt-0.5 opacity-80">
                              {wp.midLabel}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div class="flex flex-col items-center justify-between w-full h-full py-0.5">
                          <span class="text-[8px] font-mono leading-none font-bold opacity-75">{wp.topLabel || wellId}</span>
                          <span class="text-[9px] sm:text-[10px] leading-tight font-extrabold truncate w-full text-center px-0.5">
                            {wp.midLabel || '—'}
                          </span>
                          <span class="text-[8px] font-mono leading-none font-bold truncate w-full text-center opacity-90">
                            {wp.botLabel || ''}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
