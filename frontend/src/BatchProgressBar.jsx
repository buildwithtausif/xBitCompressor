import { CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react";
import { formatFileSize } from "./utils.js";

function BatchProgressBar({ progress, onCancelAll, isProcessing }) {
  if (!progress || progress.total <= 1) return null;

  const {
    total,
    completed,
    failed,
    processing,
    progressPct,
    originalBytes,
    compressedBytes,
  } = progress;

  const isDone = completed + failed === total && total > 0;
  const savedBytes = Math.max(0, originalBytes - compressedBytes);
  const reductionPct = originalBytes > 0 && compressedBytes > 0
    ? Math.round(((originalBytes - compressedBytes) / originalBytes) * 100)
    : 0;

  return (
    <div className="w-full bg-card border border-border/70 rounded-2xl p-4 sm:p-5 shadow-xs mb-4">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {isProcessing && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
          {isDone && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          <h3 className="font-bold text-sm sm:text-base">
            Batch Progress: {completed} / {total} Completed
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
            {progressPct}%
          </span>
        </div>

        {isProcessing && onCancelAll && (
          <button
            onClick={onCancelAll}
            className="text-xs font-medium text-red-500 hover:text-red-600 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" />
            Cancel Remaining
          </button>
        )}
      </div>

      {/* Progress Bar Track */}
      <div className="w-full h-2.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Stats Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-75 pt-1 border-t border-border/30">
        <div className="flex items-center gap-3">
          <span>Total Original: {formatFileSize(originalBytes)}</span>
          {compressedBytes > 0 && (
            <span className="text-green-500 font-semibold">
              Current: {formatFileSize(compressedBytes)} (-{reductionPct}%)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {processing > 0 && <span>Running: {processing} in parallel</span>}
          {failed > 0 && <span className="text-red-500 font-medium">Failed: {failed}</span>}
        </div>
      </div>
    </div>
  );
}

export default BatchProgressBar;

