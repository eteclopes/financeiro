import { useEffect } from 'react';
import { Button } from './index';

// ── Modal ──────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative bg-white w-full ${sizes[size]} rounded-t-3xl sm:rounded-2xl shadow-modal flex flex-col max-h-[90vh] animate-slide-up`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:text-slate-700 hover:bg-subtle transition-colors text-xl leading-none">
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── ConfirmDialog ──────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirmar', variant = 'danger', loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-muted mb-6">{description}</p>
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ── Form Group ─────────────────────────────────────────────
export function FormGroup({ label, htmlFor, error, children, required, hint }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
        {hint && <span className="text-muted font-normal ml-1 text-xs">({hint})</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-danger flex items-center gap-1">⚠ {error}</p>}
    </div>
  );
}

// ── Input / Select / Textarea ──────────────────────────────
export function Input({ className = '', ...props }) {
  return <input className={`input-base ${className}`} {...props} />;
}
export function Select({ children, className = '', ...props }) {
  return (
    <select className={`input-base ${className}`} {...props}>
      {children}
    </select>
  );
}
export function Textarea({ className = '', ...props }) {
  return <textarea className={`input-base resize-none ${className}`} rows={3} {...props} />;
}

// ── Table ──────────────────────────────────────────────────
export function Table({ columns, data, loading, empty }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-subtle/60 backdrop-blur-sm sticky top-0">
          <tr>
            {columns.map((col) => (
              <th key={col.key ?? col.label} className="table-header">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key ?? col.label} className="table-cell">
                      <div className="h-4 shimmer-bg rounded-lg w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : data.length === 0
              ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-muted text-sm">
                    {empty ?? 'Nenhum registro encontrado.'}
                  </td>
                </tr>
              )
              : data.map((row, i) => (
                  <tr key={row.id ?? i} className="hover:bg-subtle/40 transition-colors">
                    {columns.map((col) => (
                      <td key={col.key ?? col.label} className="table-cell">
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
          }
        </tbody>
      </table>
    </div>
  );
}
