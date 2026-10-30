import { CheckCircle2, AlertCircle, Loader2, RotateCcw, X, Clock } from "lucide-react";
import { formatFileSize, getFormatLabel, getFileExtension } from "./utils.js";

function BatchItemCard({ item, isSelected, onSelect, onRetry, onRemove }) {
  const origFormat = getFormatLabel(item.file);
  const isConvertedToJpeg = item.compressedBlob && (item.compressedBlob.type?.includes("jpeg") || item.compressedBlob.type?.includes("jpg")) && origFormat !== "JPEG" && origFormat !== "JPG";
  const formatLabel = isConvertedToJpeg ? "JPG" : origFormat;
  const isSuccess = item.status === "SUCCESS";
  const isProcessing = item.status === "PROCESSING";
  const isError = item.status === "ERROR";
  const isQueued = item.status === "QUEUED";

  const savedPct = isSuccess && item.size > 0
    ? Math.round(((item.size - item.compressedSize) / item.size) * 100)
    : 0;

  return (
    <div
      onClick={onSelect}
      className={`group relative flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? "border-blue-500 bg-blue-500/10 shadow-xs ring-1 ring-blue-500"
          : "border-border/60 bg-card hover:border-blue-400/60 hover:bg-card/90"
      }`}
    >
      {/* Thumbnail + Details */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-black/10 shrink-0 border border-border/40">
          {item.previewUrl ? (
            <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs opacity-50">IMG</div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {formatLabel && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-500 shrink-0">
                {formatLabel}
              </span>
            )}
            <p className="text-xs sm:text-sm font-semibold truncate max-w-[140px] sm:max-w-[220px]">
              {item.name}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] opacity-60 mt-0.5">
            <span>{formatFileSize(item.size)}</span>
            {item.dimensions && (
              <span>• {item.dimensions.width}×{item.dimensions.height}</span>
            )}
          </div>
        </div>
      </div>

      {/* Status & Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {isQueued && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 opacity-70">
            <Clock className="w-3 h-3" />
            Queued
          </span>
        )}

        {isProcessing && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-500 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            Compressing
          </span>
        )}

        {isSuccess && (
          <div className="flex flex-col items-end">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-500">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {savedPct}% saved
            </span>
            <span className="text-[10px] opacity-60">
              {formatFileSize(item.compressedSize)}
            </span>
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-red-500 font-medium flex items-center gap-1" title={item.error}>
              <AlertCircle className="w-3 h-3" />
              Failed
            </span>
            {onRetry && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(item.id);
                }}
                className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-blue-500"
                title="Retry"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Remove button if still queued */}
        {isQueued && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.id);
            }}
            className="p-1 rounded-md hover:bg-red-500/10 text-red-400 hover:text-red-600 transition-colors"
            title="Remove from batch"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default BatchItemCard;

