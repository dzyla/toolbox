/* Protocol runs: the checklist (bundled or custom markdown) with step completion, schema-versioned. */
import type { Protocol, ProtocolStep } from '@/core/protocols';
import type { Project } from '@/lib/projects';

export const PROTOCOL_PROJECT_VERSION = 1;

export function protocolProjectSnapshot(protocol: Protocol, sourceId: string) {
  const done = protocol.steps.filter(step => step.completed).length;
  return {
    name: `${protocol.title} (${done}/${protocol.steps.length} steps)`,
    version: PROTOCOL_PROJECT_VERSION,
    state: { schemaVersion: PROTOCOL_PROJECT_VERSION, sourceId, protocol },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validStep(step: unknown): step is ProtocolStep {
  return isRecord(step) && typeof step.id === 'string' && typeof step.text === 'string' && typeof step.completed === 'boolean'
    && (step.timerMinutes === undefined || (typeof step.timerMinutes === 'number' && Number.isFinite(step.timerMinutes) && step.timerMinutes > 0));
}

/** Validate a stored protocol run; throws a user-facing error when it is unusable. */
export function restoreProtocolProject(project: Project): { protocol: Protocol; sourceId: string } {
  const s = project.state;
  if (!isRecord(s) || s.schemaVersion !== PROTOCOL_PROJECT_VERSION || !isRecord(s.protocol)) {
    throw new Error('This protocol run cannot be opened: it was saved in an unsupported format.');
  }
  const p = s.protocol;
  if (typeof p.id !== 'string' || typeof p.title !== 'string' || !Array.isArray(p.steps) || p.steps.length === 0 || !p.steps.every(validStep)) {
    throw new Error('This protocol run cannot be opened: its steps are damaged.');
  }
  return {
    protocol: {
      id: p.id,
      title: p.title,
      category: typeof p.category === 'string' ? p.category : 'Custom',
      description: typeof p.description === 'string' ? p.description : '',
      materials: Array.isArray(p.materials) ? p.materials.filter((m): m is string => typeof m === 'string') : undefined,
      steps: p.steps,
    },
    sourceId: typeof s.sourceId === 'string' ? s.sourceId : 'custom',
  };
}
