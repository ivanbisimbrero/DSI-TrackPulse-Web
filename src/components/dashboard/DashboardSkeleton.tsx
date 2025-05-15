
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

// Separate Skeleton Component
export function DashboardSkeleton({ showLogistics }: { showLogistics: boolean }) {
  return (
    <div className="space-y-8 animate-pulse container mx-auto py-8 px-4 md:px-6 lg:px-8">
      <section>
        <Skeleton className="h-8 w-1/3 mb-4" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)}
        </div>
      </section>
      <Separator />
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
           <div className="flex justify-between items-center mb-4">
             <Skeleton className="h-8 w-1/2" />
             {/* Show button skeleton only if logistics user */}
             {showLogistics && <Skeleton className="h-10 w-36" />}
           </div>
          <Skeleton className="h-12 w-full mb-6" /> {/* Tabs skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-[300px] rounded-lg" />
            <Skeleton className="h-[300px] rounded-lg" />
          </div>
        </div>
        <div className="lg:col-span-1 space-y-8">
          {/* Show stock/copilot skeleton only if logistics user */}
          {showLogistics && (
            <>
              <div>
                <Skeleton className="h-8 w-2/3 mb-4" />
                <Skeleton className="h-[200px] rounded-lg" /> {/* Stock Levels */}
              </div>
              <Skeleton className="h-[300px] rounded-lg" /> {/* Copilot */}
            </>
          )}
           {/* Placeholder skeleton for track team view */}
           {!showLogistics && (
               <Skeleton className="h-[200px] rounded-lg" />
           )}
        </div>
      </section>
    </div>
  );
}
