import React from 'react';
import Surface from './Surface';

// Shared visual frame for workspace lists. Data, rows and actions belong to callers.
export const WorkspaceColumns = ({ columns }) => (
  <div className="relative grid grid-cols-12 gap-3 border-b border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-5 py-3 text-sm font-semibold uppercase text-[var(--text-secondary)] sm:px-6">
    {columns.map(column => <div key={column.label} className={column.className}>{column.label}</div>)}
  </div>
);

const WorkspacePanel = ({ title, icon: Icon, toolbar, actions, as, className = '', children, ...rest }) => (
  <Surface as={as} radius="panel" sheen className={`overflow-hidden ${className}`} {...rest}>
    <div className="relative flex flex-col gap-3 border-b border-[var(--glass-border)] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
      <h2 className="flex items-center text-xl font-semibold text-[var(--text-primary)]">
        {Icon && <Icon className="mr-2 h-5 w-5" />}
        {title}
      </h2>
      {toolbar}
      {actions && <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
    {children}
  </Surface>
);

export default WorkspacePanel;
