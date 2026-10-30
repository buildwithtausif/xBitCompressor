import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import { RotateCcw, Zap, Info, Sliders, Layers, XCircle, CheckCircle2, FileImage, AlertTriangle, Target } from "lucide-react";
import { toast } from "sonner";
import Spinner from "./Spinner.jsx";
import { formatFileSize, getFormatLabel } from "./utils.js";
import { BatchWorkerPool, getFileFormat } from "./utils/priorityQueue.js";
import BatchItemCard from "./BatchItemCard.jsx";
import BatchProgressBar from "./BatchProgressBar.jsx";

const base_url = import.meta.env.VITE_API_URL;

const PRESET_CHIPS = [
  { label: "25%", value: 25, hint: "Low" },
  { label: "50%", value: 50, hint: "Balanced" },
  { label: "75%", value: 75, hint: "High" },
  { label: "100%", value: 100, hint: "Max" },
];

function SettingsPage({
  batchItems,
  setBatchItems,
  setPhase,
  resetBatch,
  compressing,
  setCompressing,
}) {
  const [compression, setCompression] = useState(50);
  const [usingRange, setUsingRange] = useState(true);
  const [desiredSize, setDesiredSize] = useState("");
  const [measure, setMeasure] = useState("KB");
  const [allowResize, setAllowResize] = useState(true);
  const [toJpeg, setToJpeg] = useState(false);

  // Target size in bytes (memoized early to avoid temporal dead zone)
  const targetSizeBytes = useMemo(() => {
    const num = Number(desiredSize);
    return Number.isFinite(num) && num > 0
      ? num * (measure === "KB" ? 1024 : 1024 * 1024)
      : 0;
  }, [desiredSize, measure]);

  // Selected item ID for preview & active inspection
  const [selectedId, setSelectedId] = useState(batchItems[0]?.id || null);

  // Segmented Tab for Mobile and Desktop: 'slider' | 'target' | 'queue'
  const [activeTab, setActiveTab] = useState("slider");
  const prevCompressionRef = useRef(compression);

  // Compression change handler with 100% warning toast
  const handleCompressionChange = useCallback((newVal) => {
    const val = Number(newVal);
    if (val === 100 && prevCompressionRef.current < 100) {
      toast.warning(
        "Maximum Compression Warning: 100% compression aggressively quantizes color palettes and may produce heavily distorted, washed-out, or discolored images.",
        { id: "max-compression-warn", duration: 5000 }
      );
    }
    prevCompressionRef.current = val;
    setCompression(val);
  }, []);

  // Worker Pool Progress State
  const [queueProgress, setQueueProgress] = useState(null);
  const poolRef = useRef(null);

  // Calibration state for batch estimation
  const [calibrationFactor, setCalibrationFactor] = useState(1.0);
  const [activeItemExactBytes, setActiveItemExactBytes] = useState(null);
  const activeEstimateAbortRef = useRef(null);
  const activeDebounceRef = useRef(null);

  // Active item reference
  const activeItem = useMemo(() => {
    return batchItems.find((i) => i.id === selectedId) || batchItems[0] || null;
  }, [batchItems, selectedId]);

  const isCurrentJpeg = useMemo(() => {
    if (!activeItem?.file) return false;
    const fmt = getFileFormat(activeItem.file);
    return fmt === "jpg" || fmt === "jpeg";
  }, [activeItem]);

  // Load natural dimensions for all items asynchronously if not present
  useEffect(() => {
    batchItems.forEach((item) => {
      if (!item.dimensions && item.previewUrl) {
        const img = new Image();
        img.onload = () => {
          setBatchItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? { ...it, dimensions: { width: img.naturalWidth, height: img.naturalHeight } }
                : it
            )
          );
        };
        img.src = item.previewUrl;
      }
    });
  }, [batchItems, setBatchItems]);

  // Tier 2: Sampled Anchor Calibration (Probe largest file once at Q=50)
  useEffect(() => {
    if (!batchItems || batchItems.length === 0) return;

    const sampleItem = [...batchItems].sort((a, b) => b.size - a.size)[0];
    if (!sampleItem) return;

    const controller = new AbortController();
    const formData = new FormData();
    formData.append("image", sampleItem.file);

    axios.post(`${base_url}/estimate`, formData, {
      params: { r: 0.50 },
      signal: controller.signal,
    }).then((resp) => {
      const serverBytes = resp.data.estimated_bytes;
      if (serverBytes && serverBytes > 0) {
        const fmt = getFileFormat(sampleItem.file);
        const bpp = fmt === "png" ? 1.05 : fmt === "webp" ? 0.65 : 0.85;
        const dims = sampleItem.dimensions;
        const baseHeuristic = dims
          ? (dims.width * dims.height * bpp) / 8
          : (sampleItem.size * (fmt === "png" ? 0.15 : fmt === "webp" ? 0.60 : 0.22));

        if (baseHeuristic > 0) {
          const factor = Math.max(0.1, Math.min(3.0, serverBytes / baseHeuristic));
          setCalibrationFactor(factor);
        }
      }
    }).catch(() => {
      // Keep default factor on error
    });

    return () => controller.abort();
  }, [batchItems]);

  // Tier 3: Active item exact server estimate (debounced 150ms)
  const fetchActiveExactEstimate = useCallback((isRange, compValue, targetBytes, resizeAllowed, convertToJpeg, item) => {
    if (!item?.file) return;

    if (activeEstimateAbortRef.current) {
      activeEstimateAbortRef.current.abort();
    }
    if (activeDebounceRef.current) {
      clearTimeout(activeDebounceRef.current);
    }

    activeDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      activeEstimateAbortRef.current = controller;

      try {
        const formData = new FormData();
        formData.append("image", item.file);

        if (!isRange && (!targetBytes || targetBytes <= 0)) {
          return;
        }

        const params = isRange
          ? { r: (100 - compValue) / 100 }
          : {
              s: Math.round(targetBytes),
              allow_resize: resizeAllowed ? 1 : 0,
              to_jpeg: convertToJpeg ? 1 : 0,
            };

        const resp = await axios.post(`${base_url}/estimate`, formData, {
          params,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setActiveItemExactBytes(resp.data.estimated_bytes);
        }
      } catch {
        // Fallback to heuristic
      }
    }, 150);
  }, []);

  useEffect(() => {
    if (activeItem) {
      setActiveItemExactBytes(null);
      fetchActiveExactEstimate(usingRange, compression, targetSizeBytes, allowResize, toJpeg, activeItem);
    }
    return () => {
      if (activeDebounceRef.current) clearTimeout(activeDebounceRef.current);
    };
  }, [compression, activeItem, usingRange, targetSizeBytes, allowResize, toJpeg, fetchActiveExactEstimate]);

  // Codec-aware BPP heuristic for a single item
  const calculateItemHeuristic = useCallback((item, comp) => {
    const q = Math.max(1, 100 - comp);
    const curveMultiplier = Math.pow(q / 50, 1.35);
    const fmt = getFileFormat(item.file);
    const bpp = fmt === "png" ? 1.05 : fmt === "webp" ? 0.65 : 0.85;

    const base = item.dimensions
      ? (item.dimensions.width * item.dimensions.height * bpp) / 8
      : (item.size * (fmt === "png" ? 0.15 : fmt === "webp" ? 0.60 : 0.22));

    return Math.max(256, Math.min(item.size, Math.round(base * curveMultiplier * calibrationFactor)));
  }, [calibrationFactor]);

  // Aggregate Batch Estimates
  const totalOriginalBytes = useMemo(() => {
    return batchItems.reduce((acc, i) => acc + (i.size || 0), 0);
  }, [batchItems]);

  const totalEstimatedBytes = useMemo(() => {
    if (!usingRange) {
      return targetSizeBytes > 0 ? targetSizeBytes * batchItems.length : totalOriginalBytes * 0.5;
    }
    return batchItems.reduce((acc, i) => {
      if (i.status === "SUCCESS" && i.compressedSize > 0) return acc + i.compressedSize;
      return acc + calculateItemHeuristic(i, compression);
    }, 0);
  }, [batchItems, usingRange, compression, targetSizeBytes, totalOriginalBytes, calculateItemHeuristic]);

  const activeEstimatedSize = useMemo(() => {
    if (!usingRange) {
      if (activeItemExactBytes !== null) return activeItemExactBytes;
      return targetSizeBytes > 0 ? targetSizeBytes : 0;
    }
    if (!activeItem) return 0;
    if (activeItemExactBytes !== null) return activeItemExactBytes;
    return calculateItemHeuristic(activeItem, compression);
  }, [usingRange, targetSizeBytes, activeItem, activeItemExactBytes, calculateItemHeuristic, compression]);

  // Smart 1-tap quick target size presets based on active item
  const smartTargetPresets = useMemo(() => {
    if (!activeItem || !activeItem.size) return [];
    const sizeKB = activeItem.size / 1024;
    const presets = [];

    // 50% of original size
    const halfKB = Math.round(sizeKB * 0.5);
    if (halfKB >= 10) {
      presets.push({
        label: "50% Size",
        value: halfKB >= 1024 ? (halfKB / 1024).toFixed(1) : halfKB,
        unit: halfKB >= 1024 ? "MB" : "KB",
        hint: `~${formatFileSize(halfKB * 1024)}`,
      });
    }

    // 25% of original size
    const quarterKB = Math.round(sizeKB * 0.25);
    if (quarterKB >= 10 && quarterKB !== halfKB) {
      presets.push({
        label: "25% Size",
        value: quarterKB >= 1024 ? (quarterKB / 1024).toFixed(1) : quarterKB,
        unit: quarterKB >= 1024 ? "MB" : "KB",
        hint: `~${formatFileSize(quarterKB * 1024)}`,
      });
    }

    // Fixed popular targets if smaller than active item
    if (sizeKB > 550) {
      presets.push({ label: "500 KB", value: 500, unit: "KB", hint: "Email / Web" });
    }
    if (sizeKB > 250) {
      presets.push({ label: "200 KB", value: 200, unit: "KB", hint: "Compact" });
    }

    if (presets.length < 2) {
      presets.push({ label: "100 KB", value: 100, unit: "KB", hint: "Ultra Small" });
    }

    return presets.slice(0, 4);
  }, [activeItem]);

  // Start Batch Compression Queue
  const startBatchCompression = () => {
    if (compressing || batchItems.length === 0) return;

    if (!usingRange && (!desiredSize || !Number.isFinite(targetSizeBytes) || targetSizeBytes <= 0)) {
      toast.error("Enter a valid desired file size.");
      return;
    }

    setCompressing(true);

    const pool = new BatchWorkerPool({
      concurrency: 2,
      compressFn: async (item, signal) => {
        const formData = new FormData();
        formData.append("image", item.file);

        const params = usingRange
          ? { r: (100 - compression) / 100 }
          : {
              s: Math.round(targetSizeBytes),
              allow_resize: allowResize ? 1 : 0,
              to_jpeg: toJpeg ? 1 : 0,
            };

        const resp = await axios.post(`${base_url}/compress`, formData, {
          responseType: "blob",
          params,
          signal,
        });

        if (!resp.data || resp.data.size === 0) {
          throw new Error("Empty compressed image received");
        }

        return resp.data;
      },
      onItemStart: (item) => {
        setBatchItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "PROCESSING" } : i))
        );
      },
      onItemSuccess: (item) => {
        setBatchItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "SUCCESS",
                  compressedBlob: item.compressedBlob,
                  compressedSize: item.compressedSize,
                  error: null,
                }
              : i
          )
        );
      },
      onItemError: (item, err) => {
        setBatchItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "ERROR", error: err.message || "Failed to compress" }
              : i
          )
        );
      },
      onProgress: (p) => {
        setQueueProgress(p);
      },
      onComplete: (finalItems) => {
        setCompressing(false);
        const successCount = finalItems.filter((i) => i.status === "SUCCESS").length;
        if (successCount > 0) {
          toast.success(`Batch compression finished (${successCount}/${finalItems.length} succeeded).`);
          setPhase("downloads");
        } else {
          toast.error("Batch failed. Please review errors and retry.");
        }
      },
    });

    poolRef.current = pool;
    pool.setItems(batchItems);
    pool.start();
  };

  const cancelBatch = () => {
    if (poolRef.current) {
      poolRef.current.cancelAll();
    }
    setCompressing(false);
    toast.info("Batch compression cancelled.");
  };

  const handleRetryItem = (id) => {
    if (poolRef.current) {
      poolRef.current.retryItem(id);
    }
  };

  const handleRemoveItem = (id) => {
    if (compressing) return;
    const itemToRemove = batchItems.find((i) => i.id === id);
    if (itemToRemove?.previewUrl) {
      URL.revokeObjectURL(itemToRemove.previewUrl);
    }

    const remaining = batchItems.filter((i) => i.id !== id);
    if (remaining.length === 0) {
      if (resetBatch) resetBatch();
      else setPhase("landing");
      return;
    }
    setBatchItems(remaining);
    if (selectedId === id) {
      setSelectedId(remaining[0].id);
    }
  };

  const handleSelectActiveItem = (id) => {
    setSelectedId(id);
    if (poolRef.current) {
      poolRef.current.boostItem(id);
    }
  };

  const isBatch = batchItems.length > 1;

  // Active Reduction Percentage
  const activeReductionPct = activeItem && activeItem.size > 0 && activeEstimatedSize > 0
    ? Math.round(((activeItem.size - activeEstimatedSize) / activeItem.size) * 100)
    : 0;

  return (
    <div className="w-full h-full flex flex-col lg:flex-row gap-0 lg:gap-6 p-0 lg:p-6 overflow-hidden">

      {/* ========================================================================= */}
      {/* MOBILE-ONLY VIEWPORT-LOCKED TWO-TIER ARCHITECTURE (< lg)                 */}
      {/* Zero Scroll Debt: Image Canvas Anchored on Top, Thumb Controls on Bottom */}
      {/* ========================================================================= */}
      <div className="lg:hidden flex flex-col w-full h-full overflow-hidden">

        {/* 1. Mobile Top Canvas: Fixed ~38vh, Always Visible, Zero Scroll */}
        <div className="relative w-full h-[38vh] min-h-[220px] max-h-[300px] bg-black/5 dark:bg-white/5 border-b border-border/60 flex items-center justify-center p-3 overflow-hidden shrink-0">
          {activeItem?.previewUrl ? (
            <img
              src={activeItem.previewUrl}
              alt={activeItem.name}
              className="w-full h-full object-contain rounded-xl select-none"
            />
          ) : (
            <div className="text-xs opacity-50 flex items-center gap-1.5">
              <FileImage className="w-4 h-4" /> No image selected
            </div>
          )}

          {/* Top Bar Actions on Canvas */}
          <div className="absolute top-2.5 inset-x-3 flex items-center justify-between pointer-events-none">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white shadow-xs pointer-events-auto flex items-center gap-1">
              <FileImage className="w-3 h-3 text-blue-400" />
              {getFormatLabel(activeItem?.file)}
              {isBatch && ` • #${batchItems.findIndex(i => i.id === selectedId) + 1} of ${batchItems.length}`}
            </span>

            <button
              onClick={() => {
                if (compressing) cancelBatch();
                if (resetBatch) resetBatch();
                else setPhase("landing");
              }}
              className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center shadow-xs pointer-events-auto active:scale-95 transition-transform"
              title="Start over"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Floating Metric Pill: Anchored in User's Direct Line of Sight */}
          <div className="absolute bottom-2 inset-x-3 flex items-center justify-between bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-xl shadow-md pointer-events-none text-xs">
            <span className="font-medium truncate max-w-[50%]">
              {activeItem?.name}
            </span>
            <div className="flex items-center gap-1.5 font-bold text-[11px] sm:text-xs">
              <span className="opacity-70 line-through font-normal">{formatFileSize(activeItem?.size)}</span>
              <span>→</span>
              <span className="text-blue-400 font-extrabold">{formatFileSize(activeEstimatedSize)}</span>
              {activeReductionPct > 0 && (
                <span className="text-green-400 bg-green-500/20 px-1.5 py-0.2 rounded font-semibold text-[10px]">
                  -{activeReductionPct}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2. Mobile Batch Thumbnail Quick-Strip (shown in batch mode) */}
        {isBatch && (
          <div className="w-full bg-card/80 border-b border-border/50 px-3 py-1.5 flex items-center gap-2 overflow-x-auto shrink-0 no-scrollbar">
            {batchItems.map((item, idx) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectActiveItem(item.id)}
                  className={`w-9 h-9 rounded-lg overflow-hidden shrink-0 border transition-all active:scale-95 ${
                    isSelected
                      ? "border-blue-500 ring-2 ring-blue-500"
                      : "border-border/60 opacity-70"
                  }`}
                  title={item.name}
                >
                  <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        )}

        {/* 3. Mobile Segmented Control Dock (3 Sub-Menus) */}
        <div className="px-3 pt-2 pb-1 bg-card/40 shrink-0">
          <div className={`grid ${isBatch ? "grid-cols-3" : "grid-cols-2"} p-0.5 rounded-xl bg-black/10 dark:bg-white/10 text-xs font-semibold`}>
            {/* Sub-menu 1: Compression Level (Slider) */}
            <button
              type="button"
              onClick={() => {
                setActiveTab("slider");
                setUsingRange(true);
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "slider"
                  ? "bg-background text-text shadow-xs"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-blue-500" />
              <span>Compression</span>
            </button>

            {/* Sub-menu 2: Target File Size */}
            <button
              type="button"
              onClick={() => {
                setActiveTab("target");
                setUsingRange(false);
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "target"
                  ? "bg-background text-text shadow-xs"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <Target className="w-3.5 h-3.5 text-blue-500" />
              <span>Target Size</span>
            </button>

            {/* Sub-menu 3: Batch Queue (only in batch mode) */}
            {isBatch && (
              <button
                type="button"
                onClick={() => setActiveTab("queue")}
                className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "queue"
                    ? "bg-background text-text shadow-xs"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>Queue ({batchItems.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* 4. Mobile Interactive Surface (Scrolls internally within bottom half) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2.5 pb-24 overscroll-contain">
          {/* Progress bar if actively compressing */}
          {compressing && queueProgress && (
            <div className="mb-3">
              <BatchProgressBar
                progress={queueProgress}
                onCancelAll={cancelBatch}
                isProcessing={compressing}
              />
            </div>
          )}

          {/* Sub-Menu 1 Panel: Slider Controls */}
          {activeTab === "slider" && (
            <div className="space-y-3.5">
              <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-blue-500" /> Compression Level
                  </span>
                  <span className={`font-extrabold text-base ${compression === 100 ? "text-amber-500" : "text-blue-500"}`}>
                    {compression}%
                  </span>
                </div>

                <div className="py-2">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={compression}
                    onChange={(e) => handleCompressionChange(e.target.value)}
                    disabled={compressing}
                    className="w-full accent-blue-500 cursor-pointer"
                    style={{ touchAction: "none" }}
                  />
                </div>

                <div className="flex justify-between text-[11px] opacity-50 font-medium px-0.5">
                  <span>Low (10%)</span>
                  <span className={compression === 100 ? "text-amber-500 font-bold" : ""}>Max (100%)</span>
                </div>

                {/* 4 Quick-Preset Chips */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {PRESET_CHIPS.map((chip) => {
                    const isActive = compression === chip.value;
                    const isMax = chip.value === 100;
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        disabled={compressing}
                        onClick={() => handleCompressionChange(chip.value)}
                        title={isMax ? "Warning: 100% compression aggressively degrades quality and manipulates colors" : undefined}
                        className={`min-h-[40px] py-1 px-1 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 ${
                          isActive
                            ? isMax
                              ? "bg-amber-500 text-white shadow-xs"
                              : "bg-blue-500 text-white shadow-xs"
                            : isMax
                            ? "border border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                            : "border border-border/60 hover:bg-black/5 dark:hover:bg-white/5 opacity-80"
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {chip.label}
                          {isMax && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                        </span>
                        <span className={`text-[9px] font-normal ${isActive ? "text-white/80" : "opacity-60"}`}>
                          {chip.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Amber Warning Banner when 100% is selected */}
                {compression === 100 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-amber-500 text-xs mt-2 animate-fadeIn">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold">Heavy Quality & Color Degradation</p>
                      <p className="opacity-90 leading-relaxed text-[11px]">
                        100% compression aggressively quantizes pixel color depth. Images may appear heavily distorted, washed out, or discolored.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Total Batch Prediction Banner */}
              {isBatch && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-center justify-between text-xs">
                  <span className="font-semibold text-blue-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Total Batch Predicted:
                  </span>
                  <span className="font-bold text-sm">
                    {formatFileSize(totalOriginalBytes)} → {formatFileSize(totalEstimatedBytes)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Sub-Menu 2 Panel: Target File Size */}
          {activeTab === "target" && (
            <div className="space-y-3.5">
              <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-blue-500" /> Target File Size
                  </span>
                  <span className="text-[11px] font-medium opacity-60">
                    Original: {formatFileSize(activeItem?.size || 0)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    name="desiredSize_mobile"
                    value={desiredSize}
                    onChange={(e) => setDesiredSize(e.target.value)}
                    disabled={compressing}
                    min="0"
                    step="any"
                    placeholder="e.g. 500"
                    className="w-full min-w-0 border border-border/70 rounded-xl px-3 py-2.5 bg-background text-base disabled:opacity-50 transition-colors"
                  />

                  <select
                    value={measure}
                    onChange={(e) => setMeasure(e.target.value)}
                    disabled={compressing}
                    className="border border-border/70 rounded-xl px-3 py-2.5 bg-background text-base font-semibold disabled:opacity-50 transition-colors shrink-0"
                  >
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                  </select>
                </div>

                {/* Smart Quick Target Presets */}
                {smartTargetPresets.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold opacity-60 px-0.5">Quick Target Suggestions:</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {smartTargetPresets.map((preset, idx) => {
                        const isMatch = desiredSize === String(preset.value) && measure === preset.unit;
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={compressing}
                            onClick={() => {
                              setDesiredSize(String(preset.value));
                              setMeasure(preset.unit);
                            }}
                            className={`min-h-[40px] py-1 px-1 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 ${
                              isMatch
                                ? "bg-blue-500 text-white shadow-xs"
                                : "border border-border/60 hover:bg-black/5 dark:hover:bg-white/5 opacity-80"
                            }`}
                          >
                            <span>{preset.label}</span>
                            <span className={`text-[9px] font-normal ${isMatch ? "text-white/80" : "opacity-60"}`}>
                              {preset.hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Resolution / Downscaling Permission Checkbox */}
                <label className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl border border-border/70 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={allowResize}
                    onChange={(e) => setAllowResize(e.target.checked)}
                    disabled={compressing}
                    className="w-4 h-4 mt-0.5 rounded accent-blue-500 cursor-pointer shrink-0"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-semibold text-xs text-text block">
                      Allow dimension downscaling (Width × Height)
                    </span>
                    <span className="text-[10px] sm:text-[11px] opacity-60 leading-relaxed block">
                      {allowResize
                        ? "Dimensions may be reduced if needed to hit your exact target size."
                        : activeItem?.dimensions
                        ? `Strictly locks native resolution (${activeItem.dimensions.width} × ${activeItem.dimensions.height}). Size will be reduced via quality optimization only.`
                        : "Strictly locks native resolution. Size will be reduced via quality optimization only."}
                    </span>
                  </div>
                </label>

                {/* Warning notice if resolution is locked and target size is smaller than lowest floor */}
                {!allowResize && activeEstimatedSize > targetSizeBytes && targetSizeBytes > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 flex items-start gap-2 text-amber-500 text-[11px] animate-fadeIn">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Resolution locked. Smallest achievable size at native resolution is approximately{" "}
                      <strong>{formatFileSize(activeEstimatedSize)}</strong>.
                    </span>
                  </div>
                )}

                {/* Convert to JPEG Permission Checkbox */}
                <label className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl border border-border/70 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={toJpeg}
                    onChange={(e) => setToJpeg(e.target.checked)}
                    disabled={compressing}
                    className="w-4 h-4 mt-0.5 rounded accent-blue-500 cursor-pointer shrink-0"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-semibold text-xs text-text flex items-center gap-1.5 flex-wrap">
                      Convert to JPEG for best compression
                      {isCurrentJpeg && (
                        <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10 opacity-60">
                          Already JPEG
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] sm:text-[11px] opacity-60 leading-relaxed block">
                      {toJpeg
                        ? "Converts PNG/WebP to JPEG. Significantly reduces file size, but removes transparency."
                        : `Preserves original ${getFormatLabel(activeItem?.file)} format.`}
                    </span>
                  </div>
                </label>

                {/* Consequence Disclosure Card (shown when checked and image is non-JPEG) */}
                {toJpeg && !isCurrentJpeg && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 text-amber-500 text-[11px] space-y-1 animate-fadeIn">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Consequences of JPEG Conversion:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 opacity-90 pl-1">
                      <li>Transparent backgrounds will be filled with solid white.</li>
                      <li>Output file format will change to <code className="font-semibold text-[10px] bg-amber-500/20 px-1 py-0.2 rounded">.jpg</code>.</li>
                      <li>Lossless pixel fidelity will be converted to lossy DCT quantization.</li>
                    </ul>
                  </div>
                )}

                <p className="text-[11px] opacity-60 px-0.5 leading-relaxed">
                  Algorithm dynamically scales dimensions and adjusts encoder quality to compress under your target size.
                </p>
              </div>

              {/* Total Batch Prediction Banner */}
              {isBatch && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-center justify-between text-xs">
                  <span className="font-semibold text-blue-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Total Batch Predicted:
                  </span>
                  <span className="font-bold text-sm">
                    {formatFileSize(totalOriginalBytes)} → {formatFileSize(totalEstimatedBytes)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Sub-Menu 3 Panel: Batch Queue List */}
          {activeTab === "queue" && isBatch && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold opacity-70 px-1">
                <span>Queued Files (tap to preview above):</span>
                <span>{batchItems.length} items</span>
              </div>
              {batchItems.map((item) => (
                <BatchItemCard
                  key={item.id}
                  item={item}
                  isSelected={item.id === selectedId}
                  onSelect={() => handleSelectActiveItem(item.id)}
                  onRetry={handleRetryItem}
                  onRemove={handleRemoveItem}
                />
              ))}
            </div>
          )}
        </div>

        {/* 5. Mobile Fixed Bottom Thumb CTA */}
        <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur-md border-t border-border/60 p-3 safe-bottom z-30 shadow-lg flex gap-2">
          <button
            onClick={startBatchCompression}
            disabled={compressing}
            className="flex-1 min-h-[50px] bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-60 text-white rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] cursor-pointer"
          >
            {compressing ? <Spinner /> : <Zap className="w-4 h-4" />}
            {compressing
              ? `Compressing (${queueProgress?.completed || 0}/${batchItems.length})...`
              : isBatch
              ? `Compress ${batchItems.length} Images`
              : "Compress Image"}
          </button>

          {compressing && (
            <button
              onClick={cancelBatch}
              className="px-4 min-h-[50px] rounded-2xl border border-red-500/40 text-red-500 font-bold text-sm flex items-center justify-center cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* DESKTOP TWO-COLUMN MASTER-DETAIL LAYOUT (hidden on mobile, shown on lg)   */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex w-full h-full gap-6">

        {/* Left Column: Settings, Estimation & Queue List */}
        <div className="w-2/5 flex flex-col h-full">
          <div className="bg-card border border-border/70 rounded-2xl p-6 w-full flex flex-col flex-1 shadow-xs overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-500" />
                <h2 className="text-2xl font-bold tracking-tight">
                  {isBatch ? "Batch Settings" : "Compression Settings"}
                </h2>
              </div>
              {isBatch && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  {batchItems.length} Images
                </span>
              )}
            </div>

            {/* Progress Bar when active */}
            {compressing && queueProgress && (
              <BatchProgressBar
                progress={queueProgress}
                onCancelAll={cancelBatch}
                isProcessing={compressing}
              />
            )}

            {/* Desktop Segmented Mode Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 text-sm font-semibold mb-5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("slider");
                  setUsingRange(true);
                }}
                className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  usingRange
                    ? "bg-background text-text shadow-xs"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                <Sliders className="w-4 h-4 text-blue-500" />
                <span>Compression Level</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("target");
                  setUsingRange(false);
                }}
                className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  !usingRange
                    ? "bg-background text-text shadow-xs"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                <Target className="w-4 h-4 text-blue-500" />
                <span>Target File Size</span>
              </button>
            </div>

            {/* Desktop Controls Surface */}
            <div className="space-y-5">
              {usingRange ? (
                /* Mode 1: Compression Slider */
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-base">
                      {isBatch ? "Batch Compression Level" : "Compression Level"}
                    </span>
                    <span className={`font-bold text-lg ${compression === 100 ? "text-amber-500" : "text-blue-500"}`}>
                      {compression}%
                    </span>
                  </div>

                  <div className="py-2">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={compression}
                      onChange={(e) => handleCompressionChange(e.target.value)}
                      disabled={compressing}
                      className="w-full accent-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ touchAction: "none" }}
                    />
                  </div>

                  <div className="flex justify-between text-xs opacity-50 font-medium px-0.5">
                    <span>Low (10%)</span>
                    <span className={compression === 100 ? "text-amber-500 font-bold" : ""}>Max (100%)</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {PRESET_CHIPS.map((chip) => {
                      const isActive = compression === chip.value;
                      const isMax = chip.value === 100;
                      return (
                        <button
                          key={chip.value}
                          type="button"
                          disabled={compressing}
                          onClick={() => handleCompressionChange(chip.value)}
                          title={isMax ? "Warning: 100% compression aggressively degrades quality and manipulates colors" : undefined}
                          className={`min-h-[38px] py-1 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 ${
                            isActive
                              ? isMax
                                ? "bg-amber-500 text-white shadow-xs"
                                : "bg-blue-500 text-white shadow-xs"
                              : isMax
                              ? "border border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                              : "border border-border/60 hover:bg-black/5 dark:hover:bg-white/5 opacity-80"
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            {chip.label}
                            {isMax && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                          </span>
                          <span className={`text-[9px] font-normal ${isActive ? "text-white/80" : "opacity-60"}`}>
                            {chip.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Amber Warning Card when 100% is selected on Desktop */}
                  {compression === 100 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-amber-500 text-xs mt-3 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold">Heavy Quality & Color Degradation</p>
                        <p className="opacity-90 leading-relaxed text-[11px]">
                          100% compression aggressively quantizes pixel color depth. Images may appear heavily distorted, washed out, or discolored.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Mode 2: Target Size Input */
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-base">Target File Size</span>
                    <span className="text-xs opacity-60">
                      Original: {formatFileSize(activeItem?.size || 0)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      name="desiredSize_desktop"
                      value={desiredSize}
                      onChange={(e) => setDesiredSize(e.target.value)}
                      disabled={compressing}
                      min="0"
                      step="any"
                      placeholder="e.g. 500"
                      className="w-full min-w-0 border border-border/70 rounded-xl px-3.5 py-2.5 bg-background text-sm disabled:opacity-50 transition-colors"
                    />

                    <select
                      value={measure}
                      onChange={(e) => setMeasure(e.target.value)}
                      disabled={compressing}
                      className="border border-border/70 rounded-xl px-3.5 py-2.5 bg-background text-sm font-medium disabled:opacity-50 transition-colors shrink-0"
                    >
                      <option value="KB">KB</option>
                      <option value="MB">MB</option>
                    </select>
                  </div>

                  {/* Smart Quick Target Presets for Desktop */}
                  {smartTargetPresets.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-xs font-semibold opacity-60 px-0.5">Quick Target Suggestions:</span>
                      <div className="grid grid-cols-4 gap-2">
                        {smartTargetPresets.map((preset, idx) => {
                          const isMatch = desiredSize === String(preset.value) && measure === preset.unit;
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={compressing}
                              onClick={() => {
                                setDesiredSize(String(preset.value));
                                setMeasure(preset.unit);
                              }}
                              className={`min-h-[40px] py-1 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 ${
                                isMatch
                                  ? "bg-blue-500 text-white shadow-xs"
                                  : "border border-border/60 hover:bg-black/5 dark:hover:bg-white/5 opacity-80"
                              }`}
                            >
                              <span>{preset.label}</span>
                              <span className={`text-[9px] font-normal ${isMatch ? "text-white/80" : "opacity-60"}`}>
                                {preset.hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Resolution / Downscaling Permission Checkbox */}
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border/70 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors select-none">
                    <input
                      type="checkbox"
                      checked={allowResize}
                      onChange={(e) => setAllowResize(e.target.checked)}
                      disabled={compressing}
                      className="w-4 h-4 mt-0.5 rounded accent-blue-500 cursor-pointer shrink-0"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-semibold text-sm text-text block">
                        Allow dimension downscaling (Width × Height)
                      </span>
                      <span className="text-xs opacity-60 leading-relaxed block">
                        {allowResize
                          ? "Dimensions may be reduced if needed to hit your exact target size."
                          : activeItem?.dimensions
                          ? `Strictly locks native resolution (${activeItem.dimensions.width} × ${activeItem.dimensions.height}). Size will be reduced via quality optimization only.`
                          : "Strictly locks native resolution. Size will be reduced via quality optimization only."}
                      </span>
                    </div>
                  </label>

                  {/* Warning notice if resolution is locked and target size is smaller than lowest floor */}
                  {!allowResize && activeEstimatedSize > targetSizeBytes && targetSizeBytes > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-amber-500 text-xs animate-fadeIn">
                      <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Resolution locked. Smallest achievable size at native resolution is approximately{" "}
                        <strong>{formatFileSize(activeEstimatedSize)}</strong>.
                      </span>
                    </div>
                  )}

                  {/* Convert to JPEG Permission Checkbox */}
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border/70 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors select-none">
                    <input
                      type="checkbox"
                      checked={toJpeg}
                      onChange={(e) => setToJpeg(e.target.checked)}
                      disabled={compressing}
                      className="w-4 h-4 mt-0.5 rounded accent-blue-500 cursor-pointer shrink-0"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-semibold text-sm text-text flex items-center gap-2">
                        Convert to JPEG for best compression
                        {isCurrentJpeg && (
                          <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 opacity-60">
                            Already JPEG
                          </span>
                        )}
                      </span>
                      <span className="text-xs opacity-60 leading-relaxed block">
                        {toJpeg
                          ? "Converts PNG/WebP to JPEG. Significantly reduces file size, but removes transparency."
                          : `Preserves original ${getFormatLabel(activeItem?.file)} format.`}
                      </span>
                    </div>
                  </label>

                  {/* Consequence Disclosure Card (shown when checked and image is non-JPEG) */}
                  {toJpeg && !isCurrentJpeg && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-500 text-xs space-y-1.5 animate-fadeIn">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Consequences of JPEG Conversion:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 opacity-90 pl-1">
                        <li>Transparent backgrounds will be filled with solid white.</li>
                        <li>Output file format will change to <code className="font-semibold bg-amber-500/20 px-1 py-0.2 rounded">.jpg</code>.</li>
                        <li>Lossless pixel fidelity will be converted to lossy DCT quantization.</li>
                      </ul>
                    </div>
                  )}

                  <p className="text-xs opacity-60 leading-relaxed">
                    Algorithm dynamically calculates dimension scaling and quality factor to fit under your desired threshold.
                  </p>
                </div>
              )}
            </div>

            {/* Estimation Info Box */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 mt-5 mb-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                <p className="text-sm font-semibold">
                  {isBatch ? "Estimated Total Batch Output" : "Predicted Output Size"}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm opacity-50 line-through">
                  {formatFileSize(totalOriginalBytes)}
                </p>
                <span className="opacity-40 text-sm">→</span>
                <p className="text-xl font-bold text-blue-500">
                  {formatFileSize(totalEstimatedBytes)}
                </p>
              </div>

              <p className="text-[11px] opacity-65 mt-1">
                {isBatch
                  ? `Predicting across ${batchItems.length} items with PyVips BPP calibration.`
                  : "Calibrated to PyVips engine."}
              </p>
            </div>

            {/* Batch Queue Section */}
            {isBatch && (
              <div className="flex-1 min-h-0 flex flex-col mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                    Batch Queue ({batchItems.length})
                  </span>
                  <span className="text-[11px] opacity-50">
                    Tap to preview
                  </span>
                </div>

                <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
                  {batchItems.map((item) => (
                    <BatchItemCard
                      key={item.id}
                      item={item}
                      isSelected={item.id === selectedId}
                      onSelect={() => handleSelectActiveItem(item.id)}
                      onRetry={handleRetryItem}
                      onRemove={handleRemoveItem}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Desktop Action Buttons */}
            <div className="flex gap-3 mt-auto pt-4 border-t border-border/30">
              <button
                onClick={startBatchCompression}
                disabled={compressing}
                className="flex-1 min-h-[48px] bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer shadow-xs"
              >
                {compressing ? <Spinner /> : <Zap className="w-4 h-4" />}
                {compressing
                  ? `Compressing ${queueProgress?.completed || 0}/${batchItems.length}...`
                  : isBatch
                  ? `Compress ${batchItems.length} Images`
                  : "Compress Image"}
              </button>

              {compressing && (
                <button
                  onClick={cancelBatch}
                  className="px-4 py-3 rounded-xl border border-red-500/40 text-red-500 hover:bg-red-500/10 font-medium text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

          </div>
        </div>

        {/* Right Column: Full Master Image Preview */}
        <div className="w-3/5 flex flex-col h-full">
          <div className="bg-card border border-border/70 rounded-2xl p-6 w-full flex flex-col flex-1 shadow-xs">

            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {isBatch ? "Selected Image Preview" : "Original Image"}
                </h2>
                {isBatch && (
                  <p className="text-xs opacity-60">
                    Viewing #{batchItems.findIndex((i) => i.id === selectedId) + 1} of {batchItems.length}
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  if (compressing) cancelBatch();
                  if (resetBatch) resetBatch();
                  else setPhase("landing");
                }}
                className="border border-border/70 hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-sm font-medium transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Start Over
              </button>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-2xl p-4 overflow-hidden">
              {activeItem?.previewUrl ? (
                <img
                  src={activeItem.previewUrl}
                  alt={activeItem.name}
                  className="max-w-full max-h-[55vh] object-contain rounded-xl shadow-xs"
                />
              ) : (
                <p className="text-sm opacity-50">No image selected</p>
              )}
            </div>

            {activeItem && (
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/40 text-sm gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-500">
                    {getFormatLabel(activeItem.file)}
                  </span>
                  <p className="truncate opacity-75 font-medium max-w-[340px]">
                    {activeItem.name}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0 opacity-60 font-medium">
                  {activeItem.dimensions && (
                    <span>{activeItem.dimensions.width} × {activeItem.dimensions.height}</span>
                  )}
                  <span>Original: {formatFileSize(activeItem.size)}</span>
                  <span className="text-blue-500 font-semibold">
                    Est: ~{formatFileSize(activeEstimatedSize)}
                  </span>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}

export default SettingsPage;
