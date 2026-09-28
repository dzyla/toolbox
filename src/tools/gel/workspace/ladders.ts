import { useRef, useState, useMemo } from 'preact/hooks';
import { loadLibrary, saveLibrary } from '@/lib/local-library';
import { CUSTOM_LADDERS, type StandardLadder } from '../ladder-library';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import type { GelCore } from '../workspace';
import { LADDERS } from '../workspace-model';

/** Built-in and user ladders (custom ladders persist through the local library). */
export function useGelLadders(core: GelCore) {
  const { s, set } = core;

  // Custom Ladders
  const [customLadders, setCustomLadders] = useState<StandardLadder[]>(() => loadLibrary(CUSTOM_LADDERS));
  const [showCustomLadderModal, setShowCustomLadderModal] = useState<boolean>(false);
  const [customLadderName, setCustomLadderName] = useState<string>('');
  const [customLadderKind, setCustomLadderKind] = useState<'protein' | 'dna'>('protein');
  const [customLadderSizesStr, setCustomLadderSizesStr] = useState<string>('');
  const [customLadderError, setCustomLadderError] = useState<string>('');
  const customLadderFileRef = useRef<HTMLInputElement>(null);

  const allLadders = useMemo(() => {
    return [...LADDERS, ...customLadders];
  }, [customLadders]);

  // Active ladder preset
  const activeLadder = useMemo(() => {
    return allLadders.find(l => l.id === s.ladderId) || allLadders[0]!;
  }, [allLadders, s.ladderId]);

  function handleSaveCustomLadder() {
    setCustomLadderError('');
    if (!customLadderName.trim()) {
      setCustomLadderError('Please provide a name for this ladder.');
      return;
    }
    const numbers = customLadderSizesStr
      .split(/[\s,;]+/)
      .map(v => parseFloat(v.trim()))
      .filter(n => !isNaN(n) && n > 0);

    if (numbers.length < 2) {
      setCustomLadderError('Please enter at least 2 valid positive band sizes.');
      return;
    }

    const sorted = Array.from(new Set(numbers)).sort((a, b) => b - a);
    const newLadder: StandardLadder = {
      id: `custom-${Date.now()}`,
      name: customLadderName.trim(),
      kind: customLadderKind,
      sizes: sorted,
      unit: customLadderKind === 'protein' ? 'kDa' : 'bp',
      supplier: 'Custom',
    };

    const updated = [...customLadders, newLadder];
    setCustomLadders(updated);
    if (!saveLibrary(CUSTOM_LADDERS, updated)) setCustomLadderError('Could not store the ladder on this device (storage is full or blocked); it is available until you close the page.');
    set({ ladderId: newLadder.id });
    setShowCustomLadderModal(false);
    setCustomLadderName('');
    setCustomLadderSizesStr('');
  }

  function handleDeleteCustomLadder(id: string) {
    const updated = customLadders.filter(l => l.id !== id);
    setCustomLadders(updated);
    if (!saveLibrary(CUSTOM_LADDERS, updated)) setCustomLadderError('Could not store the ladder on this device (storage is full or blocked); it is available until you close the page.');
    if (s.ladderId === id) {
      set({ ladderId: LADDERS[0]!.id });
    }
  }

  async function handleCustomLadderFileUpload(file: File) {
    let text: string;
    try {
      text = await readTextFile(file, 1024 * 1024);
    } catch (err) {
      setCustomLadderError(importErrorMessage(err, file.name));
      return;
    }
    setCustomLadderError('');
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        setCustomLadderSizesStr(json.join(', '));
      } else if (json && typeof json === 'object') {
        if (json.name) setCustomLadderName(json.name);
        if (json.kind === 'dna' || json.kind === 'protein') setCustomLadderKind(json.kind);
        if (Array.isArray(json.sizes)) setCustomLadderSizesStr(json.sizes.join(', '));
      }
    } catch {
      setCustomLadderSizesStr(text.trim());
    }
  }

  return {
    customLadders,
    setCustomLadders,
    showCustomLadderModal,
    setShowCustomLadderModal,
    customLadderName,
    setCustomLadderName,
    customLadderKind,
    setCustomLadderKind,
    customLadderSizesStr,
    setCustomLadderSizesStr,
    customLadderError,
    setCustomLadderError,
    customLadderFileRef,
    allLadders,
    activeLadder,
    handleSaveCustomLadder,
    handleDeleteCustomLadder,
    handleCustomLadderFileUpload,
  };
}

export type GelLadders = ReturnType<typeof useGelLadders>;
