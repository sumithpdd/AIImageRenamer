'use client';

import { motion } from 'framer-motion';

interface ProcessingOverlayProps {
  processing: { active: boolean; current: number; total: number; action: string };
}

export function ProcessingOverlay({ processing }: ProcessingOverlayProps) {
  if (!processing.active) return null;
  
  return (
    <motion.div 
      className="processing-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="processing-modal">
        <div className="processing-spinner" />
        <h3>{processing.action}...</h3>
        <p>Processing {processing.total} images</p>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: '100%' }} />
        </div>
      </div>
    </motion.div>
  );
}
