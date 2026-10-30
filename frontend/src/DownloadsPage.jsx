import { useEffect, useState, useMemo } from "react";
import FileSaver from "file-saver";
import JSZip from "jszip";
import { Download, RotateCcw, Share2, Archive, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import ImageCompareSlider from "./ImageCompareSlider.jsx";
import { formatFileSize, getFormatLabel, getFileExtension } from "./utils.js";
import Spinner from "./Spinner.jsx";

function DownloadsPage({ batchItems, setBatchItems, setPhase, resetBatch }) {
  // Active item ID selected for Before/After comparison
  const [selectedId, setSelectedId] = useState(batchItems[0]?.id || null);
  const [isZipping, setIsZipping] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // Active item reference
  const activeItem = useMemo(() => {
    return batchItems.find((i) => i.id === selectedId) || batchItems[0] || null;
  }, [batchItems, selectedId]);

  // Object URLs for active item Before & After comparison
  const [originalURL, setOriginalURL] = useState("");
  const [compressedURL, setCompressedURL] = useState("");

  useEffect(() => {
    if (!activeItem?.file) return;

    const orig = URL.createObjectURL(activeItem.file);
    const comp = activeItem.compressedBlob ? URL.createObjectURL(activeItem.compressedBlob) : "";

    setOriginalURL(orig);
    setCompressedURL(comp);

    return () => {
      URL.revokeObjectURL(orig);
      if (comp) URL.revokeObjectURL(comp);
    };
  }, [activeItem]);

  const getOutputFilename = (item) => {
    return item?.name || "image.jpg";
  };

  const getOutputFormatLabel = (item) => {
    if (!item?.file) return "";
    return getFormatLabel(item.file);
  };

  // Web Share capability check
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.canShare && activeItem?.compressedBlob) {
      try {
        const testFile = new File([activeItem.compressedBlob], `xbit_${getOutputFilename(activeItem)}`, {
          type: activeItem.compressedBlob.type,
        });
        setCanShare(navigator.canShare({ files: [testFile] }));
      } catch {
        setCanShare(false);
      }
    }
  }, [activeItem]);

  // Successful items
  const successItems = useMemo(() => {
    return batchItems.filter((i) => i.status === "SUCCESS" && i.compressedBlob);
  }, [batchItems]);

  // Aggregate Batch Stats
  const totalOriginalBytes = useMemo(() => {
    return successItems.reduce((acc, i) => acc + (i.size || 0), 0);
  }, [successItems]);

  const totalCompressedBytes = useMemo(() => {
    return successItems.reduce((acc, i) => acc + (i.compressedSize || 0), 0);
  }, [successItems]);

  const totalSavedBytes = Math.max(0, totalOriginalBytes - totalCompressedBytes);
  const totalReductionPct = totalOriginalBytes > 0
    ? Math.round(((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) * 100)
    : 0;

  // Download Single Active File
  const downloadSingle = (item = activeItem) => {
    if (!item?.compressedBlob) return;
    FileSaver.saveAs(item.compressedBlob, `xbit_${getOutputFilename(item)}`);
  };

  // Download All as ZIP using JSZip
  const downloadAllAsZip = async () => {
    if (successItems.length === 0 || isZipping) return;

    if (successItems.length === 1) {
      downloadSingle(successItems[0]);
      return;
    }

    setIsZipping(true);
    const toastId = toast.loading("Packaging compressed images into ZIP...");

    try {
      const zip = new JSZip();

      successItems.forEach((item) => {
        zip.file(`xbit_${getOutputFilename(item)}`, item.compressedBlob);
      });

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      FileSaver.saveAs(zipBlob, `xbit_batch_${successItems.length}_images.zip`);
      toast.success("ZIP archive downloaded!", { id: toastId });
    } catch (err) {
      toast.error("Failed to package ZIP archive", { id: toastId });
    } finally {
      setIsZipping(false);
    }
  };

  // Native Mobile Share
  const handleShare = async () => {
    if (!activeItem?.compressedBlob) return;
    try {
      const file = new File([activeItem.compressedBlob], `xbit_${getOutputFilename(activeItem)}`, {
        type: activeItem.compressedBlob.type,
      });
      await navigator.share({
        files: [file],
        title: "Compressed with xBitCompressor",
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        downloadSingle(activeItem);
      }
    }
  };

  const isBatch = batchItems.length > 1;

  return (
    <div className="w-full min-h-full box-border px-3.5 py-4 sm:p-6 flex justify-center safe-bottom">
      <div className="w-full max-w-4xl flex flex-col">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 sm:mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {isBatch ? "Batch Compression Complete" : "Compare Before & After"}
            </h1>
            <p className="text-xs sm:text-sm opacity-60">
              {isBatch
                ? `Successfully processed ${successItems.length} of ${batchItems.length} images`
                : "Swipe the slider to inspect compression quality"}
            </p>
          </div>

          {/* Quick Aggregate Stats Pill */}
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-xl self-start sm:self-auto">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-green-500">
              Saved {formatFileSize(totalSavedBytes)} ({totalReductionPct}% smaller)
            </span>
          </div>
        </div>

        {/* Multi-Item Carousel Selector (shown when in batch mode) */}
        {isBatch && (
          <div className="bg-card border border-border/70 rounded-2xl p-2.5 sm:p-3 mb-3 sm:mb-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold px-1 mb-2 opacity-70">
              <span>Select image to compare Before & After ({batchItems.length}):</span>
              <span>{successItems.length} ready</span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
              {batchItems.map((item, idx) => {
                const isSelected = item.id === selectedId;
                const isSuccess = item.status === "SUCCESS";
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`relative flex items-center gap-2 p-1.5 rounded-xl border shrink-0 transition-all cursor-pointer ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/15 shadow-xs ring-1 ring-blue-500"
                        : "border-border/60 hover:bg-black/5 dark:hover:bg-white/5 opacity-80"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-black/10 shrink-0">
                      <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="text-left pr-1">
                      <p className="text-[11px] font-semibold truncate max-w-[90px]">
                        #{idx + 1} {item.name}
                      </p>
                      <p className="text-[10px] opacity-60">
                        {isSuccess ? formatFileSize(item.compressedSize) : item.status}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Before/After Comparison Card */}
        <div className="bg-card border border-border/70 rounded-2xl p-3 sm:p-5 shadow-xs">
          {activeItem && compressedURL ? (
            <ImageCompareSlider
              originalSrc={originalURL}
              compressedSrc={compressedURL}
            />
          ) : (
            <div className="w-full aspect-video flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-2xl">
              <p className="text-sm opacity-50">Image comparison unavailable</p>
            </div>
          )}

          {/* Active Item Stats Bar */}
          {activeItem && (
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mt-3 pt-3 border-t border-border/40 text-xs sm:text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-500">
                  {getOutputFormatLabel(activeItem)}
                </span>
                <p className="opacity-75 font-medium truncate max-w-[200px] sm:max-w-[340px]">
                  {getOutputFilename(activeItem)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="opacity-50">
                  {formatFileSize(activeItem.size)} → {formatFileSize(activeItem.compressedSize)}
                </span>
                {activeItem.size > activeItem.compressedSize && (
                  <span className="text-green-500 font-semibold px-2 py-0.5 rounded-md bg-green-500/10">
                    Saved {formatFileSize(activeItem.size - activeItem.compressedSize)} (
                    {Math.round(((activeItem.size - activeItem.compressedSize) / activeItem.size) * 100)}%)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons: ZIP Package / Single Download / Share / Start Over */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-4 sm:mt-5">
          {/* Batch Mode: Download All as ZIP */}
          {isBatch && (
            <button
              onClick={downloadAllAsZip}
              disabled={isZipping || successItems.length === 0}
              className="w-full sm:flex-1 min-h-[50px] bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm sm:text-base rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
            >
              {isZipping ? <Spinner /> : <Archive className="w-5 h-5" />}
              {isZipping ? "Creating ZIP..." : `Download All as ZIP (${successItems.length})`}
            </button>
          )}

          {/* Single Download or Share */}
          <button
            onClick={canShare ? handleShare : () => downloadSingle(activeItem)}
            className={`w-full sm:flex-1 min-h-[50px] font-semibold text-sm sm:text-base rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer ${
              isBatch
                ? "border border-border/80 hover:bg-black/5 dark:hover:bg-white/5"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            {canShare ? <Share2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            {isBatch ? "Download Selected" : "Download Compressed Image"}
          </button>

          {/* Compress Another / Start Over */}
          <button
            onClick={() => {
              if (resetBatch) resetBatch();
              else setPhase("landing");
            }}
            className="w-full sm:w-auto px-6 min-h-[50px] border border-border/70 hover:bg-black/5 dark:hover:bg-white/5 font-semibold text-sm sm:text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            {isBatch ? "New Batch" : "New Image"}
          </button>
        </div>

      </div>
    </div>
  );
}

export default DownloadsPage;
