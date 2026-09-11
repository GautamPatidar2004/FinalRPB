import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullHeight?: boolean;
}

const sizeMap = { sm: 16, md: 32, lg: 48 };

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading operational data...',
  size = 'md',
  fullHeight = false,
}) => (
  <div className="loading-state" style={fullHeight ? { minHeight: 400 } : {}}>
    <Loader2
      size={sizeMap[size]}
      style={{ color: 'var(--blue)', animation: 'spin 1s linear infinite' }}
    />
    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-tertiary)' }}>{message}</p>
  </div>
);

export const SkeletonBox: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      height: 16, width: '100%', borderRadius: 6,
      background: '#e2e8f0', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
      ...style,
    }}
  />
);

export const SkeletonCard: React.FC = () => (
  <div style={{
    background: '#fff', borderRadius: 14, border: '1px solid #e3e8f0',
    padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
    animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
  }}>
    <div style={{ height: 14, background: '#e2e8f0', borderRadius: 5, width: '35%' }} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 12, background: '#f1f5f9', borderRadius: 5 }} />
      <div style={{ height: 12, background: '#f1f5f9', borderRadius: 5, width: '80%' }} />
    </div>
  </div>
);
