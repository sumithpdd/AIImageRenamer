'use client';

import { useMemo, useState } from 'react';

export interface ProjectTagCount {
  name: string;
  count: number;
}

interface TagFilterBarProps {
  tags: ProjectTagCount[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClear: () => void;
  selectedImageCount?: number;
  onBatchAddTag?: (tag: string) => void;
}

export function TagFilterBar({
  tags,
  selectedTags,
  onToggleTag,
  onClear,
  selectedImageCount = 0,
  onBatchAddTag
}: TagFilterBarProps) {
  const [batchInput, setBatchInput] = useState('');
  const selectedSet = useMemo(
    () => new Set(selectedTags.map(t => t.toLowerCase())),
    [selectedTags]
  );

  if (tags.length === 0 && selectedImageCount === 0) return null;

  const submitBatch = () => {
    const tag = batchInput.trim();
    if (!tag || !onBatchAddTag) return;
    onBatchAddTag(tag);
    setBatchInput('');
  };

  return (
    <div className="tag-filter-bar">
      <div className="tag-filter-header">
        <span className="tag-filter-title">Tags</span>
        {selectedTags.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={onClear}>
            Clear filters ({selectedTags.length})
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="tag-filter-chips">
          {tags.map(({ name, count }) => {
            const active = selectedSet.has(name.toLowerCase());
            return (
              <button
                key={name}
                type="button"
                className={`tag-filter-chip ${active ? 'active' : ''}`}
                onClick={() => onToggleTag(name)}
                title={`${count} image${count === 1 ? '' : 's'}`}
              >
                {name}
                <span className="tag-filter-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {selectedImageCount > 0 && onBatchAddTag && (
        <div className="tag-batch-row">
          <span className="tag-batch-label">
            Tag {selectedImageCount} selected
          </span>
          <input
            type="text"
            value={batchInput}
            onChange={e => setBatchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitBatch()}
            placeholder="Tag name…"
          />
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={!batchInput.trim()}
            onClick={submitBatch}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
