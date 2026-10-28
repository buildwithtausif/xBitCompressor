import { useEffect, useState, useRef } from "react";
import FileSaver from "file-saver";
import { Download, RotateCcw, Eye } from "lucide-react";

function DownloadsPage({ image, compressedImage, setPhase }) {
  const [imageURL, setImageURL] = useState("");
  const [compressedURL, setCompressedURL] = useState("");
  const compressedImageRef = useRef();
  useEffect(() => {
    if (!image || !compressedImage) return;

    const originalURL = URL.createObjectURL(image);
    const compressedURL = URL.createObjectURL(compressedImage);
    setImageURL(originalURL);
    setCompressedURL(compressedURL);

    return () => {
      URL.revokeObjectURL(originalURL);
      URL.revokeObjectURL(compressedURL);
    };
  }, [image, compressedImage]);

  const bytesToMB = (bytes) => {
    return (bytes / (1024 * 1024)).toFixed(2);
  };

  const downloadImage = () => {
    FileSaver.saveAs(compressedImage, `compressed_${image.name}`);
  };

  return (
    <div className="w-full h-full box-border p-6 flex justify-center">
      <div className="w-full max-w-5xl flex flex-col">
        <div className="mb-4">
          <h1 className="text-xl md:text-2xl font-semibold">
            Compare Before & After
          </h1>

          <p className="text-sm opacity-60">
            Hold the eye to see the original image for comparison.
          </p>
        </div>

        <div className="bg-card max-h-8/10 border border-border rounded-2xl p-4 md:p-6">
          <div className="relative w-full max-h-19/20 aspect-video overflow-hidden rounded-xl select-none">
            <button
              className="absolute top-1 animate-pulse right-1 bg-background/60 p-2 rounded-full z-10 hover:bg-background active:animate-none transition-all"
              onMouseDown={() => compressedImageRef.current.classList.add("hidden")}
              onMouseUp={() => compressedImageRef.current.classList.remove("hidden")}
            >
              <Eye />
            </button>

            <img
              src={imageURL || null}
              alt="Original Image"
              className="absolute inset-0 w-full h-full object-contain"
            />

            <img
              id="compressed"
              ref={compressedImageRef}
              src={compressedURL || null}
              alt="Compressed Image"
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-col sm:flex-row justify-between gap-2 mt-4 text-sm">
            <p className="opacity-60 truncate">{image.name}</p>

            <p className="opacity-60">
              Saved approximately{" "}
              <span className="text-green-500 font-medium">
                {bytesToMB(image.size - compressedImage.size)} MB
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-5">
          <button
            onClick={downloadImage}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Compressed Image
          </button>

          <button
            onClick={() => setPhase("landing")}
            className="flex-1 border border-border hover:bg-black/5 dark:hover:bg-white/5 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Compress Another Image
          </button>
        </div>
      </div>
    </div>
  );
}

export default DownloadsPage;
