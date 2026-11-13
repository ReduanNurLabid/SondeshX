import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { KeyRound, Plus, Trash2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { db } from '../services/firebase';

interface StoredKey {
  label: string;
  key: string;
}

// Read by the news pipeline (pipeline/processing/llm.py). Editor-only in firestore.rules.
const KEYS_DOC = doc(db, 'admin_config', 'gemini');

function maskKey(key: string): string {
  return key.length <= 8 ? '••••••••' : `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

export const GeminiKeysPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    getDoc(KEYS_DOC)
      .then((snap) => {
        const stored = snap.exists() ? (snap.data().keys as StoredKey[] | undefined) : undefined;
        setKeys(Array.isArray(stored) ? stored.filter((k) => k && k.key) : []);
        setLoaded(true);
      })
      .catch((err) => setMessage({ text: `Could not load keys: ${err.message}`, error: true }));
  }, [open, loaded]);

  const save = async (next: StoredKey[], successText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await setDoc(KEYS_DOC, { keys: next, updated_at: new Date().toISOString() });
      setKeys(next);
      setMessage({ text: successText, error: false });
    } catch (err: any) {
      setMessage({ text: `Could not save: ${err.message}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (keys.some((k) => k.key === trimmed)) {
      setMessage({ text: 'That key is already saved.', error: true });
      return;
    }
    await save([...keys, { label: label.trim() || `Backup ${keys.length + 1}`, key: trimmed }], 'Key saved. The next pipeline run will use it.');
    setLabel('');
    setValue('');
  };

  const handleRemove = async (target: StoredKey) => {
    if (!window.confirm(`Remove the key "${target.label}"?`)) return;
    await save(keys.filter((k) => k.key !== target.key), 'Key removed.');
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
      <div className="border border-primary/30 bg-surface-container-high">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-wider text-primary cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Backup Gemini API keys
          </span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {open && (
          <div className="border-t border-primary/20 px-4 py-4 space-y-4">
            <p className="font-serif text-xs text-on-surface-variant leading-relaxed">
              The pipeline uses the key stored in GitHub first. When that key runs out of quota, it moves on to the keys below, in order.
              Only signed-in editors can see or change this list.
            </p>

            {!loaded ? (
              <div className="flex items-center gap-2 font-sans text-xs text-on-surface-variant">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading keys
              </div>
            ) : keys.length === 0 ? (
              <p className="font-sans text-xs text-on-surface-variant">No backup keys saved yet.</p>
            ) : (
              <ul className="divide-y divide-primary/10 border border-primary/20">
                {keys.map((k) => (
                  <li key={k.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-sans text-xs font-bold text-primary truncate">{k.label}</div>
                      <div className="font-mono text-[11px] text-on-surface-variant">{maskKey(k.key)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(k)}
                      disabled={busy}
                      className="flex items-center gap-1 border border-primary/30 px-2 py-1 font-sans text-[11px] font-bold uppercase hover:bg-primary hover:text-background transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label, e.g. Second account"
                className="border border-primary/30 bg-background px-3 py-2 font-sans text-xs text-on-surface"
              />
              <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Gemini API key"
                autoComplete="off"
                className="border border-primary/30 bg-background px-3 py-2 font-mono text-xs text-on-surface"
              />
              <button
                type="submit"
                disabled={busy || !value.trim()}
                className="flex items-center justify-center gap-1 bg-primary text-background px-4 py-2 font-sans text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Add key
              </button>
            </form>

            {message && (
              <p className={`font-sans text-xs ${message.error ? 'text-red-600' : 'text-primary'}`}>{message.text}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
