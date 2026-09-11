import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  fullHeight?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records found',
  message = 'There is currently no operational data available matching the selected criteria.',
  icon, actionLabel, onAction, fullHeight = false,
}) => (
  <div className="empty-state" style={fullHeight ? { minHeight: 350 } : {}}>
    <div className="empty-state__icon">
      {icon || <Inbox size={24} />}
    </div>
    <h3 className="state-title">{title}</h3>
    <p className="state-message">{message}</p>
    {actionLabel && onAction && (
      <Button variant="outline" size="sm" onClick={onAction}>{actionLabel}</Button>
    )}
  </div>
);
