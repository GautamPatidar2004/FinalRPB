import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary', size = 'md', isLoading = false,
  leftIcon, rightIcon, disabled, className = '', children, ...props
}) => (
  <button
    disabled={disabled || isLoading}
    className={`btn btn--${variant} btn--${size} ${className}`}
    {...props}
  >
    {isLoading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : leftIcon}
    {children}
    {!isLoading && rightIcon}
  </button>
);
