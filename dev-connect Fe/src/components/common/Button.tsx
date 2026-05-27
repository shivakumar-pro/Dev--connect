import React from 'react';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    
    const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none ring-offset-bg-primary';
    
    const variants = {
      primary: 'bg-gradient-to-r from-accent-purple to-accent-orange text-white hover:opacity-90 shadow-md',
      secondary: 'bg-bg-tertiary text-text-primary hover:bg-[rgba(255,255,255,0.1)] border border-border-color',
      outline: 'border-2 border-accent-purple text-accent-purple hover:bg-[rgba(192,132,252,0.1)]',
      ghost: 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary',
      danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20',
    };

    const sizes = {
      default: 'h-12 py-3 px-6 text-base',
      sm: 'h-10 px-4 text-sm',
      md: 'h-12 py-3 px-6 text-base',
      lg: 'h-14 px-8 text-lg font-semibold',
      icon: 'h-12 w-12',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
