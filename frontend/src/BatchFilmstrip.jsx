import { useMemo } from "react";
import { CheckCircle2, AlertCircle, Loader2, RotateCcw, X, Clock, Layers } from "lucide-react";
import { formatFileSize, getFormatLabel, getFileExtension } from "./utils.js";

export default function BatchFilmstrip({
  items = [],
  selectedId,
  onSelect,
  onRemove,
  onRetry,
  compressing = false,
}) {
  const totalBytes = useMemo(() => {
    return items.reduce((acc, i) => acc + (i.size || 0), 0);
  }, [items]);

  if (!items || items.length === 0) return null;

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-3 shrink-0 shadow-xs space-y-2">
      {/* Filmstrip Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-text">
            Batch Queue ({items.length})
          </span>
          <span className="hidden sm:inline text-[11px] opacity-50 truncate">
            Click to inspect image in preview canvas
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px] font-medium opacity-60">
          <span>Total: {formatFileSize(totalBytes)}</span>
        </div>
      </div>

      {/* Horizontal Scrolling Filmstrip Track */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth">
        {items.map((item, idx) => {
          const isSelected = item.id === selectedId;
          const origFormat = getFormatLabel(item.file);
          const formatLabel = origFormat;

          const isSuccess = item.status === "SUCCESS";
          const isProcessing = item.status === "PROCESSING";
          const isError = item.status === "ERROR";
          const isQueued = item.status === "QUEUED";

          const savedPct =
            isSuccess && item.size > 0
              ? Math.round(((item.size - item.compressedSize) / item.size) * 100)
              : 0;

          return (
            <div
              key={item.id}
              onClick={() => onSelect && onSelect(item.id)}
              className={`group relative flex items-center gap-2.5 p-2 rounded-xl border shrink-0 transition-all cursor-pointer w-[200px] select-none ${
                isSelected
                  ? "border-blue-500 bg-blue-500/10 shadow-xs ring-2 ring-blue-500/80"
                  : "border-border/60 bg-background/50 hover:border-blue-400/50 hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100"
              }`}
            >
              {/* Thumbnail + Format Overlay */}
              <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black/10 shrink-0 border border-border/40">
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] opacity-40 font-mono">
                    IMG
                  </div>
                )}
                {/* Index badge */}
                <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold px-1 rounded bg-black/70 text-white leading-tight">
                  #{idx + 1}
                </span>
              </div>

              {/* Card Meta & Status */}
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-center gap-1">
                  {formatLabel && (
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-blue-500/15 text-blue-500 shrink-0 leading-tight">
                      {formatLabel}
                    </span>
                  )}
                  <p className="text-xs font-semibold truncate text-text" title={item.name}>
                    {item.name}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] opacity-60 mt-0.5">
                  <span>{formatFileSize(item.size)}</span>
                  {item.dimensions && (
                    <span>• {item.dimensions.width}×{item.dimensions.height}</span>
                  )}
                </div>

                {/* Status Indicator */}
                <div className="mt-1">
                  {isQueued && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium opacity-60">
                      <Clock className="w-2.5 h-2.5" />
                      Queued
                    </span>
                  )}

                  {isProcessing && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-500 animate-pulse">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Compressing...
                    </span>
                  )}

                  {isSuccess && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-500">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      {savedPct}% saved
                    </span>
                  )}

                  {isError && (
                    <div className="inline-flex items-center gap-1 text-[10px] text-red-500 font-medium">
                      <AlertCircle className="w-2.5 h-2.5" />
                      <span>Failed</span>
                      {onRetry && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetry(item.id);
                          }}
                          className="p-0.5 hover:bg-red-500/10 rounded"
                          title="Retry"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Remove button (hidden while compressing or disabled) */}
              {!compressing && onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  className="absolute top-1.5 right-1.5 p-1 rounded-md opacity-40 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 hover:text-red-500 transition-all cursor-pointer"
                  title="Remove from batch"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

