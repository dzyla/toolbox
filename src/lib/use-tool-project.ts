/* Save a tool's work to the on-device projects store and reopen it from `/p/:id`. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { getProject, saveProject, type Project } from './projects';
import { newId } from './id';

export interface ProjectSnapshot {
  name: string;
  /** Tool-owned schema version stored with the project. */
  version: number;
  state: unknown;
  assets?: Record<string, Blob>;
  thumbnail?: Blob;
}

export interface ToolProjectApi {
  /** Id of the project this session saves into (set after a save or a restore). */
  savedId: string | undefined;
  status: { kind: 'idle' | 'saved' | 'restored' | 'error'; message: string };
  save: (snapshot: ProjectSnapshot) => Promise<void>;
  /** Detach from the current project so the next save creates a new one (e.g. after loading new data). */
  detach: () => void;
}

/**
 * `restore` validates a stored project and applies it to the tool; throw to reject it.
 * The same project id is reused for later saves, so "Save" updates rather than duplicates.
 */
export function useToolProject(toolId: string, projectId: string | undefined, restore: (project: Project) => void | Promise<void>): ToolProjectApi {
  const [savedId, setSavedId] = useState<string | undefined>();
  const [status, setStatus] = useState<ToolProjectApi['status']>({ kind: 'idle', message: '' });
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const generation = useRef(0);

  useEffect(() => {
    setSavedId(undefined);
    if (!projectId) return;
    const mine = ++generation.current;
    void (async () => {
      try {
        const project = await getProject(projectId);
        if (mine !== generation.current) return;
        if (!project || project.toolId !== toolId) throw new Error('This saved project was not found on this device.');
        await restoreRef.current(project);
        if (mine !== generation.current) return;
        setSavedId(project.id);
        setStatus({ kind: 'restored', message: `Opened saved project: ${project.name}.` });
      } catch (error) {
        if (mine === generation.current) setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not open this project.' });
      }
    })();
  }, [toolId, projectId]);

  const save = async (snapshot: ProjectSnapshot) => {
    const mine = generation.current;
    const id = savedId ?? newId();
    try {
      await saveProject({ id, toolId, ...snapshot });
      if (mine !== generation.current) return;
      setSavedId(id);
      setStatus({ kind: 'saved', message: `Saved "${snapshot.name}" on this device. Reopen it from Recent projects.` });
    } catch (error) {
      setStatus({ kind: 'error', message: `Could not save: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  const detach = () => { generation.current++; setSavedId(undefined); };

  return { savedId, status, save, detach };
}
