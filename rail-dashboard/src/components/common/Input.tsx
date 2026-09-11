import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label, helperText, error, leftIcon, rightIcon, className = '', id, ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="input-group" style={{ width: '100%' }}>
      {label && <label htmlFor={inputId} className="input-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        {leftIcon && (
          <div style={{ position: 'absolute', inset: '0 auto 0 0', paddingLeft: 12, display: 'flex', alignItems: 'center', pointerEvents: 'none', color: 'var(--text-muted)' }}>
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`input ${className}`}
          style={{
            paddingLeft: leftIcon ? 36 : undefined,
            paddingRight: rightIcon ? 36 : undefined,
            borderColor: error ? 'var(--red)' : undefined,
          }}
          {...props}
        />
        {rightIcon && (
          <div style={{ position: 'absolute', inset: '0 0 0 auto', paddingRight: 12, display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
            {rightIcon}
          </div>
        )}
      </div>
      {error && <p className="input-hint" style={{ color: 'var(--red)', fontWeight: 600 }}>{error}</p>}
      {helperText && !error && <p className="input-hint">{helperText}</p>}
    </div>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options?: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
  label, helperText, error, options = [], className = '', id, children, ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="input-group" style={{ width: '100%' }}>
      {label && <label htmlFor={selectId} className="input-label">{label}</label>}
      <select
        id={selectId}
        className={`select ${className}`}
        style={{ borderColor: error ? 'var(--red)' : undefined }}
        {...props}
      >
        {children || options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="input-hint" style={{ color: 'var(--red)', fontWeight: 600 }}>{error}</p>}
      {helperText && !error && <p className="input-hint">{helperText}</p>}
    </div>
  );
};
