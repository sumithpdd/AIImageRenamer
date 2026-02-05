'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getImageUrl } from '@/lib/api';

interface ImagePreviewProps {
  image: any;
  onClose: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}

export function ImagePreview({ image, onClose, onRename, onDelete }: ImagePreviewProps) {
  const [newName, setNewName] = useState(image.suggestedName || '');
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'details'>('overview');

  const handleRename = () => {
    if (newName.trim()) {
      onRename(newName.trim());
    }
  };

  const metadata = image.metadata || {};

  return (
    <motion.div 
      className="preview-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div 
        className="preview-modal enhanced"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="preview-close" onClick={onClose}>✕</button>

        {/* Left: Image */}
        <div className="preview-image">
          <img
            src={getImageUrl(image.path)}
            alt={image.currentName}
          />
        </div>

        {/* Right: Info Panels */}
        <div className="preview-sidebar">
          {/* Tabs */}
          <div className="preview-tabs">
            <button 
              className={`preview-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button 
              className={`preview-tab ${activeTab === 'analysis' ? 'active' : ''}`}
              onClick={() => setActiveTab('analysis')}
            >
              AI Analysis
            </button>
            <button 
              className={`preview-tab ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Details
            </button>
          </div>

          <div className="preview-content">
            {activeTab === 'overview' && (
              <OverviewTab 
                image={image}
                metadata={metadata}
                newName={newName}
                setNewName={setNewName}
                onRename={handleRename}
                onDelete={onDelete}
              />
            )}

            {activeTab === 'analysis' && (
              <AnalysisTab image={image} metadata={metadata} />
            )}

            {activeTab === 'details' && (
              <DetailsTab image={image} metadata={metadata} />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function OverviewTab({ image, metadata, newName, setNewName, onRename, onDelete }: {
  image: any;
  metadata: any;
  newName: string;
  setNewName: (name: string) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="tab-content">
      {/* Filename */}
      <div className="info-section">
        <label>Filename</label>
        <p className="mono">{image.currentName}</p>
      </div>

      {image.originalName !== image.currentName && (
        <div className="info-section">
          <label>Original Name</label>
          <p className="mono muted">{image.originalName}</p>
        </div>
      )}

      {/* Title from AI */}
      {metadata.title && (
        <div className="info-section">
          <label>Title</label>
          <p>{metadata.title}</p>
        </div>
      )}

      {/* Rename */}
      <div className="info-section">
        <label>Rename To</label>
        <div className="preview-rename">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={image.suggestedName || "Enter new name"}
            onKeyDown={(e) => e.key === 'Enter' && onRename()}
          />
          <button 
            className="btn-primary" 
            onClick={onRename} 
            disabled={!newName.trim()}
          >
            Rename
          </button>
        </div>
        {image.suggestedName && newName !== image.suggestedName && (
          <button 
            className="btn-suggestion" 
            onClick={() => setNewName(image.suggestedName)}
          >
            Use AI suggestion: <span className="mono">{image.suggestedName}</span>
          </button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="info-section">
        <label>File Info</label>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Size</span>
            <span className="info-value">{(image.size / 1024).toFixed(1)} KB</span>
          </div>
          {metadata.resolution && (
            <div className="info-item">
              <span className="info-label">Resolution</span>
              <span className="info-value">{metadata.resolution}</span>
            </div>
          )}
          <div className="info-item">
            <span className="info-label">Status</span>
            <span className={`info-value status-${image.status}`}>{image.status}</span>
          </div>
          {image.isDuplicate && (
            <div className="info-item warning">
              <span className="info-label">⚠️</span>
              <span className="info-value">Has duplicates</span>
            </div>
          )}
        </div>
      </div>

      {/* Path */}
      <div className="info-section">
        <label>Path</label>
        <p className="mono small">{image.path}</p>
      </div>

      {/* Delete */}
      <button className="btn-delete" onClick={onDelete}>
        🗑️ Remove from Project
      </button>
    </div>
  );
}

function AnalysisTab({ image, metadata }: { image: any; metadata: any }) {
  const hasAnalysis = image.status === 'analyzed' || metadata.tags?.length > 0;

  if (!hasAnalysis) {
    return (
      <div className="tab-content">
        <div className="empty-analysis">
          <div className="empty-icon-small">🤖</div>
          <p>This image hasn&apos;t been analyzed yet.</p>
          <p className="muted">Click &quot;AI Analyze All&quot; to get AI-powered metadata.</p>
        </div>
        {metadata.analysisError && (
          <div className="error-box">
            <label>Last Error</label>
            <p>{metadata.analysisError}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tab-content">
      {/* AI Description */}
      {(metadata.description || image.aiDescription) && (
        <div className="info-section">
          <label>Description</label>
          <p className="description">{metadata.description || image.aiDescription}</p>
        </div>
      )}

      {/* Tags */}
      {metadata.tags && metadata.tags.length > 0 && (
        <div className="info-section">
          <label>Tags</label>
          <div className="tag-list">
            {metadata.tags.map((tag: string, i: number) => (
              <span key={i} className="tag">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Colors */}
      {metadata.colors && metadata.colors.length > 0 && (
        <div className="info-section">
          <label>Colors</label>
          <div className="color-list">
            {metadata.colors.map((color: string, i: number) => (
              <span key={i} className="color-tag">{color}</span>
            ))}
          </div>
        </div>
      )}

      {/* Objects */}
      {metadata.objects && metadata.objects.length > 0 && (
        <div className="info-section">
          <label>Objects Detected</label>
          <div className="tag-list">
            {metadata.objects.map((obj: string, i: number) => (
              <span key={i} className="tag object">{obj}</span>
            ))}
          </div>
        </div>
      )}

      {/* Category & Style */}
      <div className="info-section">
        <label>Classification</label>
        <div className="info-grid">
          {metadata.category && (
            <div className="info-item">
              <span className="info-label">Category</span>
              <span className="info-value">{metadata.category}</span>
            </div>
          )}
          {metadata.subcategory && (
            <div className="info-item">
              <span className="info-label">Type</span>
              <span className="info-value">{metadata.subcategory}</span>
            </div>
          )}
          {metadata.style && (
            <div className="info-item">
              <span className="info-label">Style</span>
              <span className="info-value">{metadata.style}</span>
            </div>
          )}
          {metadata.mood && (
            <div className="info-item">
              <span className="info-label">Mood</span>
              <span className="info-value">{metadata.mood}</span>
            </div>
          )}
        </div>
      </div>

      {/* Confidence */}
      {metadata.confidence && (
        <div className="info-section">
          <label>Analysis Confidence</label>
          <div className="confidence-bar">
            <div 
              className="confidence-fill" 
              style={{ width: `${metadata.confidence * 100}%` }}
            />
            <span className="confidence-text">{(metadata.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Model */}
      {metadata.analysisModel && (
        <div className="info-section">
          <label>AI Model</label>
          <p className="mono small">{metadata.analysisModel}</p>
        </div>
      )}
    </div>
  );
}

function DetailsTab({ image, metadata }: { image: any; metadata: any }) {
  return (
    <div className="tab-content">
      {/* File Properties */}
      <div className="info-section">
        <label>File Properties</label>
        <div className="properties-list">
          <div className="property">
            <span className="prop-key">extension</span>
            <span className="prop-value">{image.extension}</span>
          </div>
          <div className="property">
            <span className="prop-key">filesize</span>
            <span className="prop-value">{metadata.filesizeMB || (image.size / (1024*1024)).toFixed(3)} MB</span>
          </div>
          <div className="property">
            <span className="prop-key">filesizeBytes</span>
            <span className="prop-value">{image.size}</span>
          </div>
          {metadata.width && (
            <>
              <div className="property">
                <span className="prop-key">width</span>
                <span className="prop-value">{metadata.width}</span>
              </div>
              <div className="property">
                <span className="prop-key">height</span>
                <span className="prop-value">{metadata.height}</span>
              </div>
              <div className="property">
                <span className="prop-key">resolution</span>
                <span className="prop-value">{metadata.resolution}</span>
              </div>
              <div className="property">
                <span className="prop-key">megapixels</span>
                <span className="prop-value">{metadata.megapixels}</span>
              </div>
            </>
          )}
          {metadata.colorspace && (
            <div className="property">
              <span className="prop-key">colorspace</span>
              <span className="prop-value">{metadata.colorspace}</span>
            </div>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="info-section">
        <label>Dates</label>
        <div className="properties-list">
          <div className="property">
            <span className="prop-key">created</span>
            <span className="prop-value">{new Date(image.createdAt).toLocaleString()}</span>
          </div>
          <div className="property">
            <span className="prop-key">modified</span>
            <span className="prop-value">{new Date(image.modifiedAt).toLocaleString()}</span>
          </div>
          <div className="property">
            <span className="prop-key">scanned</span>
            <span className="prop-value">{new Date(image.scannedAt).toLocaleString()}</span>
          </div>
          {image.analyzedAt && (
            <div className="property">
              <span className="prop-key">analyzed</span>
              <span className="prop-value">{new Date(image.analyzedAt).toLocaleString()}</span>
            </div>
          )}
          {image.renamedAt && (
            <div className="property">
              <span className="prop-key">renamed</span>
              <span className="prop-value">{new Date(image.renamedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Hash */}
      <div className="info-section">
        <label>Identification</label>
        <div className="properties-list">
          <div className="property">
            <span className="prop-key">md5Hash</span>
            <span className="prop-value mono">{image.hash}</span>
          </div>
          <div className="property">
            <span className="prop-key">status</span>
            <span className="prop-value">{image.status}</span>
          </div>
          <div className="property">
            <span className="prop-key">isDuplicate</span>
            <span className="prop-value">{image.isDuplicate ? 'true' : 'false'}</span>
          </div>
          <div className="property">
            <span className="prop-key">renamed</span>
            <span className="prop-value">{image.renamed ? 'true' : 'false'}</span>
          </div>
        </div>
      </div>

      {/* Duplicates */}
      {image.isDuplicate && image.duplicateOf && image.duplicateOf.length > 0 && (
        <div className="info-section">
          <label>Duplicate Of</label>
          <div className="duplicate-list">
            {image.duplicateOf.map((dup: string, i: number) => (
              <span key={i} className="duplicate-item mono">{dup}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
