import React from 'react';

export type BadgeVariant = 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'slate' | 'cyan';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  statusText?: string;
  dot?: boolean;
}

function resolveStatusVariant(status?: string): BadgeVariant {
  if (!status) return 'slate';
  const s = status.toUpperCase();
  if (['APPROVED','FEASIBLE','SCHEDULED','ON_TIME','COMPLETED','ACTIVE'].includes(s)) return 'emerald';
  if (['PENDING','UNDER_REVIEW','PENDING_APPROVAL','MEDIUM'].includes(s)) return 'amber';
  if (['REJECTED','INFEASIBLE','CRITICAL','OVERDUE','DELAYED','HIGH'].includes(s)) return 'red';
  if (['DRAFT','LOW'].includes(s)) return 'blue';
  if (['OPERATIONS','ENGINEERING'].includes(s)) return 'cyan';
  return 'slate';
}

export const Badge: React.FC<BadgeProps> = ({
  variant, statusText, dot = false, className = '', children, ...props
}) => {
  const v = variant || (statusText ? resolveStatusVariant(statusText) : 'slate');
  return (
    <span className={`badge badge--${v} ${className}`} {...props}>
      {dot && <span className="badge__dot" />}
      {children || statusText}
    </span>
  );
};
