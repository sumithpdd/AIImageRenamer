'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getImageUrl } from '@/lib/api';

interface ImageCardProps {
  image: any;
  index: number;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}

export function ImageCard({ 
  image, 
  index, 
  selected, 
  onToggleSelect, 
  onPreview, 
  onRename, 
  onDelete 
}: ImageCardProps) {
  const [editMode, setEditMode] = useState(false);
  const [newName, setNewName] = useState('');

  const handleRename = () => {
    if (newName.trim()) {
      onRename(newName.trim());
      setEditMode(false);
      setNewName('');
    }
  };

  const applySuggestion = () => {
    if (image.suggestedName) onRename(image.suggestedName);
  };

  const cardClasses = [
    'image-card',
    selected && 'selected',
    image.isDuplicate && 'duplicate',
    image.renamed && 'renamed'
  ].filter(Boolean).join(' ');

  return (
    <motion.div
      className={cardClasses}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.02 }}
      layout
    >
      <Checkbox selected={selected} onToggle={onToggleSelect} />
      <Badges image={image} />
      <ImageThumbnail image={image} onPreview={onPreview} />
      
      <div className="card-content">
        {editMode ? (
          <EditNameForm
            value={newName}
            onChange={setNewName}
            onSubmit={handleRename}
            onCancel={() => setEditMode(false)}
          />
        ) : (
          <ImageInfo 
            image={image} 
            onApplySuggestion={applySuggestion} 
          />
        )}

        <CardActions 
          onEdit={() => setEditMode(true)} 
          onDelete={onDelete} 
        />
        
        <div className="card-status">
          <span className={`status-badge ${image.status}`}>{image.status}</span>
        </div>
      </div>
    </motion.div>
  );
}

function Checkbox({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  return (
    <div className="card-checkbox" onClick={onToggle}>
      <div className={`checkbox ${selected ? 'checked' : ''}`}>
        {selected && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    </div>
  );
}

function Badges({ image }: { image: any }) {
  return (
    <>
      {image.isDuplicate && (
        <div className="badge duplicate-badge" title="Duplicate">⚠️</div>
      )}
      {image.renamed && (
        <div className="badge renamed-badge" title="Renamed">✓</div>
      )}
    </>
  );
}

function ImageThumbnail({ image, onPreview }: { image: any; onPreview: () => void }) {
  return (
    <div className="card-image" onClick={onPreview}>
      <img
        src={getImageUrl(image.path)}
        alt={image.currentName}
        loading="lazy"
      />
      <div className="image-overlay">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </div>
    </div>
  );
}

function EditNameForm({ 
  value, 
  onChange, 
  onSubmit, 
  onCancel 
}: { 
  value: string; 
  onChange: (v: string) => void; 
  onSubmit: () => void; 
  onCancel: () => void;
}) {
  return (
    <div className="edit-name">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="New name"
        autoFocus
      />
      <button onClick={onSubmit} className="btn-icon success">✓</button>
      <button onClick={onCancel} className="btn-icon">✕</button>
    </div>
  );
}

function ImageInfo({ image, onApplySuggestion }: { image: any; onApplySuggestion: () => void }) {
  return (
    <>
      <p className="image-name mono" title={image.currentName}>
        {image.currentName}
      </p>
      
      {image.originalName !== image.currentName && (
        <p className="original-name mono">was: {image.originalName}</p>
      )}
      
      {image.suggestedName && !image.renamed && (
        <div className="suggestion">
          <span className="suggestion-label">AI:</span>
          <span className="suggestion-name mono">
            {image.suggestedName}{image.extension}
          </span>
          <button onClick={onApplySuggestion} className="btn-apply">✓</button>
        </div>
      )}
      
      {image.patternCleanName && !image.suggestedName && !image.renamed && (
        <div className="suggestion pattern">
          <span className="suggestion-label">Clean:</span>
          <span className="suggestion-name mono">
            {image.patternCleanName}{image.extension}
          </span>
        </div>
      )}
    </>
  );
}

function CardActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="card-actions">
      <button onClick={onEdit} className="btn-icon" title="Rename">✏️</button>
      <button onClick={onDelete} className="btn-icon danger" title="Remove">🗑️</button>
    </div>
  );
}
