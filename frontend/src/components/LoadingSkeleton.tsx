import { motion } from 'framer-motion';

export function LoadingSkeleton() {
  return (
    <div className="max-w-2xl mx-auto bg-white shadow-xl rounded-2xl p-8 md:p-10">
      {/* Budget skeleton */}
      <div className="mb-8">
        <div className="h-6 bg-slate-200 rounded w-32 mb-4 animate-pulse" />
        <div className="h-12 bg-slate-200 rounded w-24 mb-2 animate-pulse" />
        <div className="h-4 bg-slate-200 rounded-full animate-pulse" />
      </div>

      {/* Airport skeleton */}
      <div className="mb-8">
        <div className="h-6 bg-slate-200 rounded w-24 mb-4 animate-pulse" />
        <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
      </div>

      {/* Presets skeleton */}
      <div className="mb-8">
        <div className="h-6 bg-slate-200 rounded w-32 mb-4 animate-pulse" />
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-slate-200 rounded-full w-32 animate-pulse" />
          ))}
        </div>
      </div>

      {/* Button skeleton */}
      <div className="h-16 bg-slate-200 rounded-full animate-pulse" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white shadow-xl max-w-sm w-full animate-pulse">
      {/* Image skeleton avec shimmer */}
      <div className="relative w-full h-64 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
      
      {/* Content skeleton */}
      <div className="p-6 bg-white">
        <div className="h-12 bg-slate-200 rounded w-32 mb-2" />
        <div className="h-4 bg-slate-200 rounded w-24 mb-4" />
        
        <div className="mt-4 space-y-3">
          <div className="h-4 bg-slate-200 rounded w-full" />
          <div className="h-4 bg-slate-200 rounded w-3/4" />
        </div>

        <div className="flex gap-3 mt-6">
          <div className="flex-1 h-12 bg-slate-200 rounded-full" />
          <div className="flex-[2] h-12 bg-slate-200 rounded-full" />
        </div>
      </div>
    </div>
  );
}

