import { useEffect, useState } from "react";
import axios from "axios";
import { RotateCcw, Zap, Info } from "lucide-react";
import { toast } from "sonner";

const base_url = import.meta.env.VITE_API_URL;

function SettingsPage({ image, setCompressedImage, setImage, setPhase }) {
  const [compression, setCompression] = useState(50);
  const [imageURL, setImageURL] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [usingRange, setUsingRange] = useState(true);
  const [desiredSize, setDesiredSize] = useState("");
  const [measure, setMeasure] = useState("KB");

  useEffect(() => {
    if (!image) return;

    const url = URL.createObjectURL(image);
    setImageURL(url);

    return () => URL.revokeObjectURL(url);
  }, [image]);

  const bytesToMB = (bytes) => {
    return (bytes / (1024 * 1024)).toFixed(2);
  };

  const targetSizeBytes =
    Number(desiredSize) * (measure === "KB" ? 1024 : 1024 * 1024);

  const estimatedSize = usingRange
    ? image
      ? image.size * (1 - compression / 100)
      : 0
    : targetSizeBytes;

  const compressReq = async () => {
    if (!image || compressing) return;

    if (
      !usingRange &&
      (!desiredSize || !Number.isFinite(targetSizeBytes) ||
        targetSizeBytes <= 0)
    ) {
      toast.error("Enter a valid desired file size.");
      return;
    }

    if (!usingRange && targetSizeBytes >= image.size) {
      toast.error("Desired size must be smaller than the original image.");
      return;
    }

    if (!usingRange && targetSizeBytes <= image.size / 10) {
      toast.warning("Desired file size is very small and may reduce image quality.");
    }

    setCompressing(true);

    const formData = new FormData();
    formData.append("image", image);

    try {
      const params = usingRange
        ? { r: compression / 100 }
        : { s: Math.round(targetSizeBytes) };

      const resp = await axios.post(
        `${base_url}/compress`,
        formData,
        {
          responseType: "blob",
          params,
        }
      );

      if (!resp.data || resp.data.size === 0) {
        throw new Error("Empty compressed image");
      }

      setCompressedImage(resp.data);
      setPhase("downloads");
    } catch (error) {
      toast.error("Unable to compress right now, try again later.");
    } finally {
      setCompressing(false);
    }
  };

  const resetImage = () => {
    setImage(null);
    setPhase("landing");
  };

  return (
    <div className="w-full min-h-full flex flex-col lg:flex-row gap-6 p-6">

      <div className="w-full lg:w-2/5 flex">
        <div className="bg-card border border-border rounded-2xl p-6 w-full flex flex-col">

          <h2 className="text-2xl font-semibold mb-8">
            Compression Settings
          </h2>

          <div className="space-y-6">

            <div>
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="radio"
                  name="method"
                  value="range"
                  checked={usingRange}
                  onChange={() => setUsingRange(true)}
                  className="accent-blue-500"
                />
                <span className="font-medium">Quality</span>
                <span className="ml-auto text-blue-500 font-semibold">
                  {compression}%
                </span>
              </label>

              <input
                type="range"
                min="10"
                max="90"
                value={compression}
                onChange={(e) => setCompression(Number(e.target.value))}
                readOnly={!usingRange}
                onFocus={() => setUsingRange(true)}
                className="w-full accent-blue-500 cursor-pointer disabled:cursor-not-allowed"
              />

              <div className="flex justify-between text-sm opacity-50 mt-2">
                <span>10%</span>
                <span>90%</span>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="radio"
                  name="method"
                  value="desiredsize"
                  checked={!usingRange}
                  onChange={() => setUsingRange(false)}
                  className="accent-blue-500"
                />
                <span className="font-medium">Desired File Size</span>
              </label>

              <div className="flex gap-2">
                <input
                  type="number"
                  name="desiredSize"
                  value={desiredSize}
                  onChange={(e) => setDesiredSize(e.target.value)}
                  readOnly={usingRange}
                  onFocus={() => setUsingRange(false)}
                  min="0"
                  step="any"
                  placeholder="Enter size"
                  className="w-full min-w-0 border border-border rounded-lg px-3 py-2 bg-background disabled:opacity-50"
                />

                <select
                  value={measure}
                  onChange={(e) => setMeasure(e.target.value)}
                  readOnly={usingRange}
                  onFocus={() => setUsingRange(false)}
                  className="border border-border rounded-lg px-3 py-2 bg-background disabled:opacity-50"
                >
                  <option value="KB">KB</option>
                  <option value="MB">MB</option>
                </select>
              </div>

              <p className="text-xs opacity-50 mt-2">
                Enter a target smaller than the original file size.
              </p>
            </div>

          </div>

          <p className="text-sm opacity-60 mt-4">
            Higher compression generally produces a smaller file.
          </p>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mt-6 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-blue-500" />
              <p className="text-sm font-medium">
                {usingRange ? "Estimated size after compression" : "Target file size"}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm opacity-50 line-through">
                {bytesToMB(image.size)} MB
              </p>

              <span className="opacity-40">→</span>

              <p className="text-xl font-semibold text-blue-500">
                {bytesToMB(estimatedSize)} MB
              </p>
            </div>

            {!usingRange && targetSizeBytes > 0 && (
              <p className="text-xs opacity-60 mt-2">
                Target: {Math.round(targetSizeBytes).toLocaleString()} bytes
              </p>
            )}

            {usingRange && (
              <p className="text-xs opacity-50 mt-2">
                This is only an estimate. Actual compression depends on the image.
              </p>
            )}
          </div>

          <button
            onClick={compressReq}
            disabled={compressing}
            className="mt-auto bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {compressing ? (
              <svg
                className="size-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="8"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            ) : (
              <Zap className="w-4 h-4" />
            )}

            {compressing ? "Compressing..." : "Compress Image"}
          </button>

        </div>
      </div>

      <div className="w-full lg:w-3/5 flex">
        <div className="bg-card border border-border rounded-2xl p-6 w-full flex flex-col">

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-semibold">
              Original Image
            </h2>

            <button
              onClick={resetImage}
              className="border border-border hover:bg-black/5 dark:hover:bg-white/5 px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-xl p-4">
            <img
              src={imageURL || null}
              alt="Original Image"
              className="max-w-full max-h-[55vh] object-contain rounded-lg"
            />
          </div>

          <div className="flex justify-between items-center mt-4 text-sm gap-3">
            <p className="truncate max-w-[70%] opacity-70">
              {image.name}
            </p>

            <p className="opacity-50 shrink-0">
              {bytesToMB(image.size)} MB
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}

export default SettingsPage;