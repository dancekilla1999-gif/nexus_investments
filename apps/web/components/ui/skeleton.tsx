import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Card } from './card';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-surface-raised', className)} {...props} />;
}

export function StatCardSkeleton() {
  return (
    <Card>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-3 h-4 w-14 rounded-full" />
    </Card>
  );
}
