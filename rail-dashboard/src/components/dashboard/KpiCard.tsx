import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

export type KpiVariant = 'default' | 'blue' | 'emerald' | 'amber' | 'red' | 'purple';

export interface KpiCardProps {
  title: string;
  value: string | number | null | undefined;
  unit?: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: KpiVariant;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClick?: () => void;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title, value, unit, subtitle, icon,
  variant = 'default', isLoading = false, error = null, onRetry, onClick, className = '',
}) => (
  <div
    onClick={onClick}
    className={`kpi-card ${variant !== 'default' ? `kpi-card--${variant}` : ''} ${onClick ? 'kpi-card--clickable' : ''} ${className}`}
  >
    <div className="kpi-card__body">
      <div className="kpi-card__header">
        <span className="kpi-card__label">{title}</span>
        {icon && (
          <div className={`kpi-card__icon kpi-card__icon--${variant}`}>
            {icon}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: '4px 0' }}>
            <Loader2 size={18} style={{ color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>Loading…</span>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--red)', padding: '2px 0' }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>Unavailable</span>
            {onRetry && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                style={{ marginLeft: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <>
            <span className="kpi-card__value">
              {value != null ? value : '\u2014'}
            </span>
            {unit && <span className="kpi-card__unit">{unit}</span>}
          </>
        )}
      </div>

      {subtitle && !isLoading && !error && (
        <div className="kpi-card__footer">{subtitle}</div>
      )}
    </div>
  </div>
);
