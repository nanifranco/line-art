"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { svgToGcode } from "@/lib/gcodeGenerator";
import { processTypewriter, CHAR_SET_NAMES } from "@/lib/processors/typewriter";

interface TypewriterOptions {
  cols: number;
  contrast: number;
  brightness: number;
  charSet: number;
  invert: number;
  passes: number;
}

const PAPER_SIZES: Record<string, [number, number]> = {
  A6: [105, 148],
  A5: [148, 210],
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  Letter: [216, 279],
  Legal: [216, 356],
  Custom: [200, 200],
};

const defaultOptions: TypewriterOptions = {
  cols: 100,
  contrast: 20,
  brightness: 0,
  charSet: 0,
  invert: 0,
  passes: 2,
};

async function processImage(file: File, options: TypewriterOptions): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const MAX = 700;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  bitmap.close();
  return processTypewriter(imageData, options);
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-300 font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export default function Home() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [processedSvg, setProcessedSvg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"original" | "preview">("original");
  const [isDragging, setIsDragging] = useState(false);
  const [options, setOptions] = useState<TypewriterOptions>(defaultOptions);
  const [paperSize, setPaperSize] = useState("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [gcodeWidthMm, setGcodeWidthMm] = useState(210);
  const [gcodeHeightMm, setGcodeHeightMm] = useState(297);
  const [gcodeFeedRate, setGcodeFeedRate] = useState(3000);
  const [gcodePenUpCmd, setGcodePenUpCmd] = useState("M3 S0");
  const [gcodePenDownCmd, setGcodePenDownCmd] = useState("M3 S30");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const setOpt = useCallback(<K extends keyof TypewriterOptions>(key: K, value: TypewriterOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    setImageFile(file);
    setProcessedSvg(null);
    setError(null);
    setActiveTab("original");
    const url = URL.createObjectURL(file);
    setImagePreviewUrl(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!imageFile) return;
    setIsProcessing(true);
    setError(null);
    try {
      const svgText = await processImage(imageFile, options);
      setProcessedSvg(svgText);
      setActiveTab("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [imageFile, options]);

  const handleDownloadSvg = useCallback(() => {
    if (!processedSvg) return;
    const blob = new Blob([processedSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "typewriter-art.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, [processedSvg]);

  const handleDownloadGcode = useCallback(() => {
    if (!processedSvg) return;
    const gcode = svgToGcode(processedSvg, {
      widthMm: gcodeWidthMm,
      heightMm: gcodeHeightMm,
      feedRate: gcodeFeedRate,
      penUpCmd: gcodePenUpCmd,
      penDownCmd: gcodePenDownCmd,
    });
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "typewriter-art.gcode";
    a.click();
    URL.revokeObjectURL(url);
  }, [processedSvg, gcodeWidthMm, gcodeHeightMm, gcodeFeedRate, gcodePenUpCmd, gcodePenDownCmd]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (paperSize === "Custom") return;
    const [w, h] = PAPER_SIZES[paperSize];
    if (orientation === "portrait") {
      setGcodeWidthMm(w);
      setGcodeHeightMm(h);
    } else {
      setGcodeWidthMm(h);
      setGcodeHeightMm(w);
    }
  }, [paperSize, orientation]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Navbar */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-widest text-white">TYPEWRITER ART</h1>
          <p className="text-xs text-zinc-500 tracking-wide">Photo to typewriter character art</p>
        </div>
        <div className="flex-1" />
        {processedSvg && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-zinc-400">Art ready</span>
          </div>
        )}
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column - controls */}
        <aside className="w-80 flex-shrink-0 border-r border-zinc-800 flex flex-col overflow-y-auto">
          <div className="p-4 flex flex-col gap-5">
            {/* Upload zone */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Image
              </label>
              <div
                className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-white bg-zinc-800"
                    : "border-zinc-700 hover:border-zinc-500"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                {imagePreviewUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreviewUrl}
                      alt="Uploaded preview"
                      className="max-h-32 max-w-full object-contain rounded"
                    />
                    <span className="text-xs text-zinc-500 truncate max-w-full">
                      {imageFile?.name}
                    </span>
                    <span className="text-xs text-zinc-600">Click to change</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 32 32"
                      fill="none"
                      className="text-zinc-600"
                    >
                      <rect
                        x="4"
                        y="4"
                        width="24"
                        height="24"
                        rx="3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M16 10 L16 22 M10 16 L22 16"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-sm text-zinc-500">Drop image here</span>
                    <span className="text-xs text-zinc-600">or click to browse</span>
                  </div>
                )}
              </div>
            </div>

            {/* Parameters */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Parameters
              </label>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3">
                <SliderRow label="Columns" value={options.cols} min={40} max={180} step={4} onChange={(v) => setOpt("cols", v)} />
                <SliderRow label="Contrast" value={options.contrast} min={-80} max={120} step={2} onChange={(v) => setOpt("contrast", v)} />
                <SliderRow label="Brightness" value={options.brightness} min={-60} max={60} step={2} onChange={(v) => setOpt("brightness", v)} />
                <SliderRow label="Opt. Passes" value={options.passes} min={1} max={5} step={1} onChange={(v) => setOpt("passes", v)} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">Character Set</span>
                  <div className="flex flex-wrap gap-1">
                    {CHAR_SET_NAMES.map((name, i) => (
                      <button
                        key={i}
                        onClick={() => setOpt("charSet", i)}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${
                          options.charSet === i
                            ? "bg-white text-zinc-950 border-white"
                            : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  {(["Normal", "Inverted"] as const).map((label, i) => (
                    <button
                      key={i}
                      onClick={() => setOpt("invert", i)}
                      className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                        options.invert === i
                          ? "bg-white text-zinc-950 border-white"
                          : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"
                      }`}
                    >
                      {i === 0 ? "☀ Normal" : "☾ Inverted"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!imageFile || isProcessing}
              className={`w-full py-3 rounded-lg font-semibold text-sm tracking-wider transition-colors ${
                !imageFile || isProcessing
                  ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "bg-white text-zinc-950 hover:bg-zinc-200 cursor-pointer"
              }`}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeOpacity="0.2"
                    />
                    <path
                      d="M12 2 A10 10 0 0 1 22 12"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  PROCESSING...
                </span>
              ) : (
                "GENERATE"
              )}
            </button>

            {error && (
              <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>
        </aside>

        {/* Main content - preview */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-zinc-800 px-4 pt-4 flex items-end gap-1">
            <button
              onClick={() => setActiveTab("original")}
              className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
                activeTab === "original"
                  ? "bg-zinc-900 text-zinc-100 border-t border-l border-r border-zinc-800"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Original
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              disabled={!processedSvg}
              className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
                activeTab === "preview"
                  ? "bg-zinc-900 text-zinc-100 border-t border-l border-r border-zinc-800"
                  : !processedSvg
                  ? "text-zinc-700 cursor-not-allowed"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Art Preview
            </button>
            <div className="flex-1" />
            {processedSvg && activeTab === "preview" && (
              <div className="flex items-center gap-2 pb-2">
                <button
                  onClick={handleDownloadSvg}
                  className="px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-800 transition-colors"
                >
                  Download SVG
                </button>
              </div>
            )}
          </div>

          {/* Preview area */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              {activeTab === "original" ? (
                imagePreviewUrl ? (
                  <div className="max-w-full max-h-full flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreviewUrl}
                      alt="Original"
                      className="max-w-full max-h-[calc(100vh-180px)] object-contain rounded-lg shadow-2xl"
                    />
                  </div>
                ) : (
                  <div className="text-center text-zinc-600">
                    <svg
                      width="64"
                      height="64"
                      viewBox="0 0 64 64"
                      fill="none"
                      className="mx-auto mb-4 opacity-40"
                    >
                      <rect
                        x="8"
                        y="8"
                        width="48"
                        height="48"
                        rx="6"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <circle cx="22" cy="22" r="5" stroke="currentColor" strokeWidth="2" />
                      <path
                        d="M8 42 L20 30 L30 40 L42 26 L56 42"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="text-sm">Upload an image to get started</p>
                  </div>
                )
              ) : processedSvg ? (
                <div className="max-w-full max-h-full flex items-center justify-center p-2">
                  <div
                    className="svg-preview rounded-lg shadow-2xl overflow-hidden"
                    style={{ maxWidth: "100%", maxHeight: "calc(100vh - 200px)" }}
                    dangerouslySetInnerHTML={{ __html: processedSvg }}
                  />
                </div>
              ) : null}
            </div>

            {/* Export panel */}
            {processedSvg && (
              <div className="w-64 flex-shrink-0 border-l border-zinc-800 overflow-y-auto">
                <div className="p-4 flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                      Export
                    </label>
                    <button
                      onClick={handleDownloadSvg}
                      className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-200 transition-colors"
                    >
                      Download SVG
                    </button>
                  </div>

                  <div className="border-t border-zinc-800 pt-4">
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                      G-code Settings
                    </label>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-500">Paper Size</span>
                        <select
                          value={paperSize}
                          onChange={(e) => setPaperSize(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                        >
                          {Object.keys(PAPER_SIZES).map((s) => (
                            <option key={s} value={s}>{s === "Custom" ? "Custom" : `${s} (${PAPER_SIZES[s][0]}×${PAPER_SIZES[s][1]}mm)`}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        {(["portrait", "landscape"] as const).map((o) => (
                          <button
                            key={o}
                            onClick={() => setOrientation(o)}
                            className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${orientation === o ? "bg-white text-zinc-950 border-white" : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"}`}
                          >
                            {o === "portrait" ? "↕ Portrait" : "↔ Landscape"}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-500">Width (mm)</span>
                          <input
                            type="number"
                            value={gcodeWidthMm}
                            min={50}
                            max={1000}
                            onChange={(e) => { setPaperSize("Custom"); setGcodeWidthMm(Number(e.target.value)); }}
                            className="w-full"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-500">Height (mm)</span>
                          <input
                            type="number"
                            value={gcodeHeightMm}
                            min={50}
                            max={1000}
                            onChange={(e) => { setPaperSize("Custom"); setGcodeHeightMm(Number(e.target.value)); }}
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-500">Feed Rate (mm/min)</span>
                        <input
                          type="number"
                          value={gcodeFeedRate}
                          min={100}
                          max={20000}
                          step={100}
                          onChange={(e) => setGcodeFeedRate(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-500">Pen Up Command</span>
                        <input
                          type="text"
                          value={gcodePenUpCmd}
                          onChange={(e) => setGcodePenUpCmd(e.target.value)}
                          className="w-full"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-500">Pen Down Command</span>
                        <input
                          type="text"
                          value={gcodePenDownCmd}
                          onChange={(e) => setGcodePenDownCmd(e.target.value)}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleDownloadGcode}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700 transition-colors"
                  >
                    Download G-code
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
