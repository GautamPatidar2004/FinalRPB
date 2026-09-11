import React from 'react';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> { striped?: boolean; }

export const Table: React.FC<TableProps> = ({ striped = false, className = '', children, ...props }) => (
  <div className="table-wrapper">
    <table className={`table ${striped ? 'table--striped' : ''} ${className}`} {...props}>
      {children}
    </table>
  </div>
);

export const TableHead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className = '', children, ...props }) => (
  <thead {...props} className={className}>{children}</thead>
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className = '', children, ...props }) => (
  <tbody {...props} className={className}>{children}</tbody>
);

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className = '', children, ...props }) => (
  <tr {...props} className={className}>{children}</tr>
);

export const TableHeaderCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className = '', children, ...props }) => (
  <th {...props} className={className}>{children}</th>
);

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className = '', children, ...props }) => (
  <td {...props} className={className}>{children}</td>
);
