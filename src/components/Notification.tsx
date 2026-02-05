'use client';

import { motion } from 'framer-motion';

interface NotificationProps {
  notification: { message: string; type: string } | null;
}

export function Notification({ notification }: NotificationProps) {
  if (!notification) return null;
  
  return (
    <motion.div
      className={`notification ${notification.type}`}
      initial={{ opacity: 0, y: -50, x: '-50%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
    >
      {notification.message}
    </motion.div>
  );
}
