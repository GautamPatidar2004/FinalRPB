import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
  accent?: 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'none';
}

export const Card: React.FC<CardProps> = ({
  title, subtitle, action, footer, noPadding = false, accent = 'none', className = '', children, ...props
}) => (
  <div
    className={`card ${accent !== 'none' ? `card--${accent}` : ''} ${className}`}
    {...props}
  >
    {(title || action || subtitle) && (
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          {title && <h3 className="card-title">{title}</h3>}
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {action && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{action}</div>}
      </div>
    )}
    <div className={noPadding ? 'card-body--no-padding' : 'card-body'}>{children}</div>
    {footer && <div className="card-footer">{footer}</div>}
  </div>
);
