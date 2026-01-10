import { motion } from 'framer-motion';
import { LoadingMessages } from './LoadingMessages';
import { LoadingSpinner } from './LoadingSpinner';

export function LoadingSkeleton() {
  return (
    <div className="max-w-2xl mx-auto bg-white shadow-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 lg:p-10">
      {/* Spinner et messages rotatifs */}
      <div className="mb-8">
        <div className="flex justify-center mb-4">
          <LoadingSpinner size="lg" color="primary" />
        </div>
        <LoadingMessages isVisible={true} interval={2500} />
      </div>

      {/* Mini cartes skeleton de destinations (compactes) */}
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            className="bg-slate-50 rounded-xl p-3 sm:p-4 border border-slate-200"
          >
            <div className="flex items-center justify-between">
              {/* Destination et dates */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-5 w-12 bg-slate-300 rounded animate-pulse" />
                  <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
              {/* Prix */}
              <div className="text-right ml-4">
                <div className="h-6 w-16 bg-primary-200 rounded-lg animate-pulse mb-1" />
                <div className="h-3 w-12 bg-slate-200 rounded ml-auto animate-pulse" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
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

