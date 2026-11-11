import type { FC, ReactNode } from 'react';

export interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export const Field: FC<FieldProps> = ({ label, hint, children }) => {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
          {label}
        </span>
        {hint && <span className="text-[10.5px] text-white/35">{hint}</span>}
      </div>
      {children}
    </label>
  );
};
