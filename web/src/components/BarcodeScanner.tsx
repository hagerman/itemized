import React, { useEffect, useRef, useState } from "react";
import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
import zxingReaderWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { Camera, Flashlight, FlashlightOff, RefreshCw, Search } from "lucide-react";

const ZXING_1D_FORMATS: NonNullable<ReaderOptions["formats"]> = [
  "UPCA",
  "UPCE",
  "EAN13",
  "EAN8",
  "Code128",
  "Code39",
  "ITF",
];

const ZXING_BASE_OPTIONS: Omit<ReaderOptions, "formats"> = {
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
};

const ZXING_READER_OPTIONS_WITH_QR: ReaderOptions = {
  ...ZXING_BASE_OPTIONS,
  formats: ["QRCode", ...ZXING_1D_FORMATS],
};

const ZXING_READER_OPTIONS_1D_ONLY: ReaderOptions = {
  ...ZXING_BASE_OPTIONS,
  formats: ZXING_1D_FORMATS,
};

const NATIVE_1D_FORMATS = [
  "upc_a",
  "upc_e",
  "ean_13",
  "ean_8",
  "code_128",
  "code_39",
  "itf",
];

const NATIVE_ALL_FORMATS = ["qr_code", ...NATIVE_1D_FORMATS];

const MAX_CAPTURE_DIMENSION = 1024;
const WASM_DECODE_INTERVAL_MS = 120;

interface BarcodeScannerProps {
  onScan: (value: string) => void;
  placeholder?: string;
  active?: boolean;
  defaultCameraEnabled?: boolean;
  flashOnScan?: boolean;
  allowQrCodes?: boolean;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1046;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch {
    // Audio playback may be unavailable in headless environments
  }
}

function computeCaptureSize(videoWidth: number, videoHeight: number): { width: number; height: number } {
  const longest = Math.max(videoWidth, videoHeight);
  if (longest <= MAX_CAPTURE_DIMENSION) {
    return { width: videoWidth, height: videoHeight };
  }
  const scale = MAX_CAPTURE_DIMENSION / longest;
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}

function normalizeScanDebounceKey(code: string): string {
  if (/^\d{11,14}$/.test(code)) {
    return code.replace(/^0+/, "") || code;
  }
  return code;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan,
  placeholder = "Scan barcode, QR URL, or type to search...",
  active = true,
  defaultCameraEnabled = false,
  flashOnScan = false,
  allowQrCodes = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const flashOnScanRef = useRef(flashOnScan);
  flashOnScanRef.current = flashOnScan;
  const allowQrCodesRef = useRef(allowQrCodes);
  allowQrCodesRef.current = allowQrCodes;
  const flashTimerRef = useRef<number | null>(null);

  const [cameraEnabled, setCameraEnabled] = useState(defaultCameraEnabled);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const activeDeviceIdRef = useRef<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [scanFlashing, setScanFlashing] = useState(false);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, []);

  const triggerScanFlash = () => {
    if (!flashOnScanRef.current) return;
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    setScanFlashing(true);
    flashTimerRef.current = window.setTimeout(() => {
      setScanFlashing(false);
      flashTimerRef.current = null;
    }, 280);
  };

  const emitScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    const debounceKey = normalizeScanDebounceKey(code);
    if (lastCodeRef.current.code === debounceKey && now - lastCodeRef.current.at < 1500) {
      return;
    }
    lastCodeRef.current = { code: debounceKey, at: now };
    playBeep();
    triggerScanFlash();
    onScanRef.current(code);
  };

  useEffect(() => {
    if (!active || !cameraEnabled) return;
    let cancelled = false;
    let frameId: number | null = null;
    let wasmTimerId: number | null = null;
    let captureCanvas: HTMLCanvasElement | null = null;
    let captureCtx: CanvasRenderingContext2D | null = null;

    async function startCamera() {
      setCameraError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError(
            window.isSecureContext === false
              ? "Camera requires HTTPS. Access itemized over HTTPS (e.g., via a reverse proxy) to use live barcode scanning."
              : "Camera API unavailable in this browser."
          );
          return;
        }

        const videoConstraints: MediaTrackConstraints = selectedDeviceId
          ? {
              deviceId: { exact: selectedDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };
        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings?.();
        activeDeviceIdRef.current = settings?.deviceId || selectedDeviceId;

        if (navigator.mediaDevices.enumerateDevices) {
          try {
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = allDevices.filter((d) => d.kind === "videoinput" && d.deviceId);
            if (!cancelled) setDevices(videoInputs);
          } catch {
            // Ignore device enumeration errors if camera stream already started
          }
        }

        const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps?.torch));

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // autoPlay handles playback; ignore AbortError from concurrent play attempts
        }
        if (cancelled) return;

        // Engine 1: Native hardware-accelerated BarcodeDetector when available
        const win = window as unknown as {
          BarcodeDetector?: {
            new (opts?: { formats?: string[] }): {
              detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue?: string; format?: string }>>;
            };
            getSupportedFormats?: () => Promise<string[]>;
          };
        };
        if (win.BarcodeDetector) {
          try {
            let formatsWithQr = NATIVE_ALL_FORMATS;
            let formats1dOnly = NATIVE_1D_FORMATS;
            if (typeof win.BarcodeDetector.getSupportedFormats === "function") {
              const supported = await win.BarcodeDetector.getSupportedFormats();
              const filteredAll = NATIVE_ALL_FORMATS.filter((f) => supported.includes(f));
              if (filteredAll.length > 0) {
                formatsWithQr = filteredAll;
              }
              const filtered1d = NATIVE_1D_FORMATS.filter((f) => supported.includes(f));
              if (filtered1d.length > 0) {
                formats1dOnly = filtered1d;
              }
            }
            if (!cancelled) {
              const detectorWithQr = new win.BarcodeDetector({ formats: formatsWithQr });
              const detector1dOnly = new win.BarcodeDetector({ formats: formats1dOnly });
              const loop = async () => {
                if (cancelled || !videoRef.current) return;
                if (videoRef.current.readyState >= 2) {
                  try {
                    const qrAllowed = allowQrCodesRef.current;
                    const detector = qrAllowed ? detectorWithQr : detector1dOnly;
                    const hits = await detector.detect(videoRef.current);
                    const hit = hits.find(
                      (h) => h.rawValue && (qrAllowed || h.format !== "qr_code")
                    );
                    if (hit?.rawValue) {
                      emitScan(hit.rawValue);
                    }
                  } catch {
                    // Ignore transient frame errors
                  }
                }
                if (!cancelled) {
                  frameId = requestAnimationFrame(loop);
                }
              };
              frameId = requestAnimationFrame(loop);
            }
          } catch {
            // Fall through to self-hosted ZXing-WASM engine
          }
        }

        // Engine 2: Self-hosted ZXing-C++ WebAssembly decoder (primary engine on iOS Safari)
        try {
          await prepareZXingModule({
            overrides: {
              locateFile: () => zxingReaderWasmUrl,
            },
            fireImmediately: true,
          });
        } catch (err) {
          if (!cancelled) {
            setCameraError(
              `Barcode decoder failed to initialize: ${err instanceof Error ? err.message : "unknown error"}`
            );
          }
          return;
        }
        if (cancelled) return;

        const decodeWasmFrame = async () => {
          if (cancelled) return;
          const el = videoRef.current;
          if (el && el.readyState >= 2 && el.videoWidth > 0 && el.videoHeight > 0) {
            try {
              const { width, height } = computeCaptureSize(el.videoWidth, el.videoHeight);
              if (!captureCanvas) {
                captureCanvas = document.createElement("canvas");
                captureCtx = captureCanvas.getContext("2d", { willReadFrequently: true });
              }
              if (captureCanvas.width !== width || captureCanvas.height !== height) {
                captureCanvas.width = width;
                captureCanvas.height = height;
              }
              if (captureCtx) {
                captureCtx.drawImage(el, 0, 0, width, height);
                const imageData = captureCtx.getImageData(0, 0, width, height);
                const readerOptions = allowQrCodesRef.current
                  ? ZXING_READER_OPTIONS_WITH_QR
                  : ZXING_READER_OPTIONS_1D_ONLY;
                const results = await readBarcodes(imageData, readerOptions);
                if (!cancelled && results[0]?.text) {
                  emitScan(results[0].text);
                }
              }
            } catch {
              // Ignore transient frame errors and keep scanning
            }
          }
          if (!cancelled) {
            wasmTimerId = window.setTimeout(() => {
              void decodeWasmFrame();
            }, WASM_DECODE_INTERVAL_MS);
          }
        };
        wasmTimerId = window.setTimeout(() => {
          void decodeWasmFrame();
        }, WASM_DECODE_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) {
          setCameraError(err instanceof Error ? err.message : "Unable to start camera");
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      if (wasmTimerId !== null) window.clearTimeout(wasmTimerId);
      captureCanvas = null;
      captureCtx = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setTorchOn(false);
    };
  }, [active, cameraEnabled, selectedDeviceId]);

  const switchCamera = () => {
    if (devices.length <= 1) return;
    const currentId = activeDeviceIdRef.current;
    const currentIdx = currentId ? devices.findIndex((d) => d.deviceId === currentId) : -1;
    const nextDevice = devices[(currentIdx + 1) % devices.length];
    if (nextDevice?.deviceId) {
      setSelectedDeviceId(nextDevice.deviceId);
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Ignore unsupported torch constraint
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    emitScan(manualInput);
    setManualInput("");
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={handleSubmit}
        data-testid="scanner-bar"
        data-scan-flash={scanFlashing ? "true" : "false"}
        className={`flex gap-2 rounded-xl transition-all duration-150 ${
          scanFlashing ? "bg-emerald-500/20 ring-2 ring-emerald-400" : ""
        }`}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder={placeholder}
            aria-label="Barcode or search input"
            autoFocus={!defaultCameraEnabled}
            className={`w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 transition-colors duration-150 focus:outline-none dark:text-slate-100 dark:placeholder-slate-500 ${
              scanFlashing
                ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-950/60"
                : "border-slate-300 bg-white focus:border-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-indigo-500"
            }`}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
        >
          Go
        </button>
        <button
          type="button"
          onClick={() => setCameraEnabled((v) => !v)}
          aria-label={cameraEnabled ? "Stop camera" : "Start camera"}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
            cameraEnabled
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          <Camera className="h-4 w-4" />
          <span className="hidden sm:inline">{cameraEnabled ? "Camera On" : "Camera"}</span>
        </button>
      </form>

      {cameraEnabled && (
        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-52 w-full object-cover"
          />
          {scanFlashing && (
            <div
              data-testid="scan-flash-overlay"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 bg-emerald-400/45 ring-4 ring-inset ring-emerald-300 transition-opacity duration-200"
            />
          )}
          <div className="absolute right-2 top-2 flex gap-2">
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label="Toggle torch"
                className="rounded-full bg-slate-900/80 p-2 text-slate-100 hover:bg-slate-800"
              >
                {torchOn ? <Flashlight className="h-4 w-4 text-amber-400" /> : <FlashlightOff className="h-4 w-4" />}
              </button>
            )}
            {devices.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                aria-label="Switch camera"
                className="rounded-full bg-slate-900/80 p-2 text-slate-100 hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
          {cameraError && (
            <div className="bg-rose-950/90 px-3 py-2 text-xs text-rose-200">{cameraError}</div>
          )}
        </div>
      )}
    </div>
  );
};
