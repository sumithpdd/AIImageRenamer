'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ImageCard } from './ImageCard';

interface ProjectViewProps {
  project: any;
  images: any[];
  stats: { total: number; analyzed: number; renamed: number; duplicates: number; pending: number };
  filter: string;
  setFilter: (filter: string) => void;
  selectedImages: Set<string>;
  loading: boolean;
  onScan: () => void;
  onAnalyzeSelected: () => void;
  onAnalyzeAll: () => void;
  onRenameWithAI: () => void;
  onCleanPatterns: () => void;
   onRemoveDuplicates: () => void;
  onToggleSelect: (imageId: string) => void;
  onSelectAll: () => void;
  onPreview: (image: any) => void;
  onRename: (image: any, newName: string) => void;
  onDelete: (image: any) => void;
}

export function ProjectView({ 
  project, 
  images, 
  stats, 
  filter, 
  setFilter, 
  selectedImages, 
  loading,
  onScan, 
  onAnalyzeSelected, 
  onAnalyzeAll, 
  onRenameWithAI, 
  onCleanPatterns,
  onRemoveDuplicates,
  onToggleSelect, 
  onSelectAll, 
  onPreview, 
  onRename, 
  onDelete 
}: ProjectViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="project-controls">
        <ControlRow 
          projectId={project?.id}
          folderPath={project?.folderPath}
          loading={loading}
          onScan={onScan}
        />

        {images.length > 0 && (
          <>
            <StatsBar stats={stats} />
            <ActionBar
              filter={filter}
              setFilter={setFilter}
              selectedImages={selectedImages}
              imageCount={images.length}
              onSelectAll={onSelectAll}
              onCleanPatterns={onCleanPatterns}
              onRemoveDuplicates={onRemoveDuplicates}
              onAnalyzeSelected={onAnalyzeSelected}
              onAnalyzeAll={onAnalyzeAll}
              onRenameWithAI={onRenameWithAI}
            />
          </>
        )}
      </div>

      {images.length === 0 && !loading && <EmptyImages />}

      <div className="image-grid">
        <AnimatePresence mode="popLayout">
          {images.map((image, index) => (
            <ImageCard
              key={image.id}
              image={image}
              index={index}
              selected={selectedImages.has(image.id)}
              onToggleSelect={() => onToggleSelect(image.id)}
              onPreview={() => onPreview(image)}
              onRename={(newName) => onRename(image, newName)}
              onDelete={() => onDelete(image)}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ControlRow({ projectId, folderPath, loading, onScan }: { projectId: string; folderPath: string; loading: boolean; onScan: () => void }) {
  return (
    <div className="control-row">
      <div className="folder-display">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span className="mono">{folderPath}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn-secondary" onClick={onScan} disabled={loading}>
          {loading ? <span className="spinner" /> : 'Scan Folder'}
        </button>
        {projectId && (
          <a
            className="btn-secondary"
            href={`/api/projects/${projectId}/download-zip`}
            title="Download all project images as a ZIP file"
          >
            ⬇️ Download ZIP
          </a>
        )}
      </div>
    </div>
  );
}

function StatsBar({ stats }: { stats: { total: number; analyzed: number; renamed: number; duplicates: number; pending: number } }) {
  return (
    <div className="stats-bar">
      <StatItem value={stats.total} label="Total" />
      <StatItem value={stats.analyzed} label="Analyzed" className="analyzed" />
      <StatItem value={stats.renamed} label="Renamed" className="renamed" />
      <StatItem value={stats.duplicates} label="Duplicates" className="duplicates" />
      <StatItem value={stats.pending} label="Pending" className="pending" />
    </div>
  );
}

function StatItem({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  return (
    <div className="stat-item">
      <span className={`stat-value ${className}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

interface ActionBarProps {
  filter: string;
  setFilter: (filter: string) => void;
  selectedImages: Set<string>;
  imageCount: number;
  onSelectAll: () => void;
  onCleanPatterns: () => void;
  onRemoveDuplicates: () => void;
  onAnalyzeSelected: () => void;
  onAnalyzeAll: () => void;
  onRenameWithAI: () => void;
}

function ActionBar({ 
  filter, 
  setFilter, 
  selectedImages, 
  imageCount,
  onSelectAll, 
  onCleanPatterns,
  onRemoveDuplicates,
  onAnalyzeSelected, 
  onAnalyzeAll, 
  onRenameWithAI 
}: ActionBarProps) {
  const filters = ['all', 'pending', 'analyzed', 'renamed', 'duplicates'];
  
  return (
    <div className="action-bar">
      <div className="filter-tabs">
        {filters.map(f => (
          <button 
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="actions">
        <button className="btn-ghost" onClick={onSelectAll}>
          {selectedImages.size === imageCount ? 'Deselect All' : 'Select All'}
        </button>
        <button 
          className="btn-secondary" 
          onClick={onCleanPatterns} 
          title="Remove imgi_XX_, IMG_, etc."
        >
          🧹 Clean Prefixes
        </button>
        <button
          className="btn-secondary"
          onClick={onRemoveDuplicates}
          title="Delete duplicate files from this project (keeps one copy of each group)"
        >
          🗑️ Remove Duplicates
        </button>
        <button 
          className="btn-secondary" 
          onClick={onAnalyzeSelected} 
          disabled={selectedImages.size === 0}
        >
          🔍 Analyze Selected
        </button>
        <button className="btn-primary" onClick={onAnalyzeAll}>
          🤖 AI Analyze All
        </button>
        <button className="btn-primary" onClick={onRenameWithAI}>
          ✨ Apply AI Names
        </button>
      </div>
    </div>
  );
}

function EmptyImages() {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </div>
      <h3>No images scanned</h3>
      <p>Click &quot;Scan Folder&quot; to find images in this project</p>
    </div>
  );
}
