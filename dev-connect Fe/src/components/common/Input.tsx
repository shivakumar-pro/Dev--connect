import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { AlertCircle } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, icon, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-text-secondary mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              "flex h-12 w-full rounded-lg border text-base transition-colors",
              "bg-bg-secondary border-border-color text-text-primary",
              "placeholder:text-text-muted",
              "focus-visible:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              icon ? "pl-11" : "pl-4",
              "pr-4 py-3 shadow-sm",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p className="text-sm text-red-400 mt-1 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
