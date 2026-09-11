import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  fullHeight?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while communicating with the railway backend service.',
  onRetry, fullHeight = false,
}) => (
  <div className="error-state" style={fullHeight ? { minHeight: 400 } : {}}>
    <div className="error-state__icon">
      <AlertTriangle size={24} />
    </div>
    <h3 className="state-title">{title}</h3>
    <p className="state-message">{message}</p>
    {onRetry && (
      <Button variant="outline" size="sm" onClick={onRetry} leftIcon={<RefreshCw size={14} />}>
        Try Again
      </Button>
    )}
  </div>
);
