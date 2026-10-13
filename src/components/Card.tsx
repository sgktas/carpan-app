import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, glass, onClick }: CardProps) {
  return (
    <div
      className={clsx('cp-card rounded-2xl p-4 border', glass && 'cp-card--glass', className, onClick && 'cp-card--interactive cursor-pointer')}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={clsx('display font-semibold text-base mb-3', className)} style={{ color: 'var(--ink)' }}>
      {children}
    </h2>
  );
}
