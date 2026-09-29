/* Bench protocol model shared by every cloning method. */

export interface ReactionComponent {
  name: string;
  /** Stock description, e.g. "2X", "50 ng/µL". */
  stock?: string;
  /** Amount description, e.g. "0.05 pmol (41 ng)". */
  amount?: string;
  /** Volume in µL; null means "to final volume" (water). */
  volumeUl: number | null;
}

export interface ReactionTable {
  title: string;
  totalVolumeUl: number;
  components: ReactionComponent[];
  notes: string[];
}

export interface ProtocolStep {
  text: string;
  temperatureC?: number;
  minutes?: number;
}

export interface CloningProtocol {
  title: string;
  reactions: ReactionTable[];
  steps: ProtocolStep[];
  /** Vendor document the protocol follows. */
  source: string;
}

/** Water volume that brings the listed components to the reaction total; negative if they overflow. */
export function waterVolume(table: ReactionTable): number {
  const used = table.components.reduce((sum, component) => sum + (component.volumeUl ?? 0), 0);
  return table.totalVolumeUl - used;
}

function formatVolume(volume: number): string {
  return `${Number(volume.toFixed(volume < 1 ? 2 : 1))} µL`;
}

export function protocolText(protocol: CloningProtocol): string {
  const lines = [protocol.title, ''];
  for (const table of protocol.reactions) {
    lines.push(`${table.title} (${table.totalVolumeUl} µL)`);
    for (const component of table.components) {
      const volume = component.volumeUl === null ? `to ${table.totalVolumeUl} µL (${formatVolume(Math.max(0, waterVolume(table)))})` : formatVolume(component.volumeUl);
      const detail = [component.stock, component.amount].filter(Boolean).join(', ');
      lines.push(`  ${component.name}${detail ? ` [${detail}]` : ''}: ${volume}`);
    }
    for (const note of table.notes) lines.push(`  Note: ${note}`);
    lines.push('');
  }
  protocol.steps.forEach((step, index) => lines.push(`${index + 1}. ${step.text}`));
  lines.push('', `Source: ${protocol.source}`);
  return lines.join('\n');
}
