import { ImageUp, UploadCloud, Layers } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB supported by server

function LandingPage({ batchItems = [], setBatchItems, setPhase }) {
  const supportedFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const [dragOver, setDragOver] = useState(false);

  const processFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;

    // Revoke any previous object URLs before storing new batch items
    if (batchItems && batchItems.length > 0) {
      batchItems.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    }

    const files = Array.from(fileList);
    const validItems = [];
    let skippedFormat = 0;
    let skippedSize = 0;

    files.forEach((file) => {
      if (!file.type.startsWith("image/") || !supportedFormats.includes(file.type)) {
        skippedFormat++;
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        skippedSize++;
        return;
      }

      validItems.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        size: file.size,
        status: "QUEUED",
        previewUrl: URL.createObjectURL(file),
        dimensions: null,
        compressedBlob: null,
        compressedSize: 0,
        error: null,
        isSelected: false,
      });
    });

    if (skippedFormat > 0) {
      toast.warning(`${skippedFormat} file(s) skipped — only JPG, PNG, and WebP are supported.`);
    }
    if (skippedSize > 0) {
      toast.error(`${skippedSize} file(s) skipped — exceeds maximum size of 1 GB.`);
    }

    if (validItems.length === 0) {
      if (skippedFormat === 0 && skippedSize === 0) {
        toast.error("Please provide valid image files.");
      }
      return;
    }

    if (validItems.length > 1) {
      toast.success(`${validItems.length} images queued for batch compression.`);
    }

    // Default select first item
    validItems[0].isSelected = true;

    setBatchItems(validItems);
    setPhase("settings");
  };

  const dropHandler = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  return (
    <div className="w-full min-h-full flex flex-col items-center justify-center px-4 py-6 sm:py-10 text-center safe-bottom">
      <div className="w-full max-w-xl flex flex-col items-center gap-3 mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Batch Image <span className="text-blue-500">Compressor</span>
        </h2>
        <p className="text-sm sm:text-base opacity-70">
          Compress single or multiple JPEG, PNG, and WebP images in parallel
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
          {["JPG / JPEG", "PNG", "WEBP"].map((fmt) => (
            <span
              key={fmt}
              className="text-[11px] sm:text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20"
            >
              {fmt}
            </span>
          ))}
        </div>
      </div>

      <label
        htmlFor="imageFile"
        id="dropBox"
        className={`w-full max-w-xl min-h-[280px] sm:min-h-[340px] border-2 sm:border-3 border-dashed flex flex-col items-center justify-center gap-4 p-6 sm:p-8 rounded-3xl transition-all duration-200 cursor-pointer select-none active:scale-[0.99] ${
          dragOver
            ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
            : "border-border/80 bg-card/60 hover:bg-card hover:border-blue-500/60"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={dropHandler}
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 transition-transform group-hover:scale-105">
          <Layers className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>

        {/* Mobile-first Call to Action with Multi-Select notice */}
        <div className="flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold text-sm sm:text-base px-6 py-3 rounded-2xl shadow-sm transition-all">
            <UploadCloud className="w-4 h-4" />
            <span>Select Images (Multiple Allowed)</span>
          </div>

          <p className="text-xs sm:text-sm opacity-60 mt-1">
            Drag & drop single or batch images here
          </p>
        </div>

        <input
          hidden
          id="imageFile"
          type="file"
          multiple
          accept={supportedFormats.join(", ")}
          onChange={(e) => processFiles(e.target.files)}
        />
      </label>
    </div>
  );
}

export default LandingPage;
