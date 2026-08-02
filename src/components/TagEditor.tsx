'use client';

import { useMemo, useState, KeyboardEvent } from 'react';

interface TagEditorProps {
  tags: string[];
  suggestions?: string[];
  disabled?: boolean;
  onAdd: (tag: string) => void | Promise<void>;
  onRemove: (tag: string) => void | Promise<void>;
  onTagClick?: (tag: string) => void;
}

export function TagEditor({
  tags,
  suggestions = [],
  disabled = false,
  onAdd,
  onRemove,
  onTagClick
}: TagEditorProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = useMemo(
    () => new Set(tags.map(t => t.toLowerCase())),
    [tags]
  );

  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    return suggestions
      .filter(s => !existing.has(s.toLowerCase()))
      .filter(s => !q || s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [suggestions, existing, input]);

  const commit = async (raw: string) => {
    const tag = raw.trim();
    if (!tag || disabled || busy) return;
    if (existing.has(tag.toLowerCase())) {
      setInput('');
      return;
    }
    setBusy(true);
    try {
      await onAdd(tag);
      setInput('');
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(input.replace(/,/g, ''));
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  };

  return (
    <div className={`tag-editor ${disabled ? 'disabled' : ''}`}>
      <div className="tag-editor-list">
        {tags.length === 0 && (
          <span className="tag-editor-empty">No tags yet</span>
        )}
        {tags.map(tag => (
          <span key={tag} className="tag editable">
            <button
              type="button"
              className="tag-label"
              onClick={() => onTagClick?.(tag)}
              title={onTagClick ? `Filter by "${tag}"` : tag}
            >
              {tag}
            </button>
            <button
              type="button"
              className="tag-remove"
              disabled={disabled || busy}
              onClick={() => onRemove(tag)}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="tag-editor-input-row">
        <input
          type="text"
          value={input}
          disabled={disabled || busy}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag… (Enter)"
          list="project-tag-suggestions"
        />
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={disabled || busy || !input.trim()}
          onClick={() => commit(input)}
        >
          Add
        </button>
      </div>

      <datalist id="project-tag-suggestions">
        {suggestions.map(s => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {filteredSuggestions.length > 0 && input.trim() && (
        <div className="tag-suggestions">
          {filteredSuggestions.map(s => (
            <button
              key={s}
              type="button"
              className="tag-suggestion"
              onClick={() => commit(s)}
              disabled={disabled || busy}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
