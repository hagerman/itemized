import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { Camera, Flashlight, FlashlightOff, RefreshCw, Search } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (value: string) => void;
  placeholder?: string;
  active?: boolean;
  defaultCameraEnabled?: boolean;
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

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan,
  placeholder = "Scan barcode, QR URL, or type to search...",
  active = true,
  defaultCameraEnabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [cameraEnabled, setCameraEnabled] = useState(defaultCameraEnabled);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const emitScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (lastCodeRef.current.code === code && now - lastCodeRef.current.at < 1500) {
      return;
    }
    lastCodeRef.current = { code, at: now };
    playBeep();
    onScanRef.current(code);
  };

  useEffect(() => {
    if (!active || !cameraEnabled) return;
    let cancelled = false;
    let frameId: number | null = null;
    const zxingReader = new BrowserMultiFormatReader();

    async function startCamera() {
      setCameraError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError("Camera API unavailable in this browser.");
          return;
        }
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
        if (!cancelled) setDevices(videoInputs);

        const chosen = videoInputs[deviceIndex % Math.max(videoInputs.length, 1)];
        const constraints: MediaStreamConstraints = {
          video: chosen?.deviceId
            ? { deviceId: { exact: chosen.deviceId } }
            : { facingMode: "environment" },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps?.torch));

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        // Engine 1: Native hardware-accelerated BarcodeDetector when available
        const win = window as unknown as {
          BarcodeDetector?: new (opts?: { formats?: string[] }) => {
            detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
          };
        };
        if (win.BarcodeDetector) {
          const detector = new win.BarcodeDetector({
            formats: ["qr_code", "upc_a", "upc_e", "ean_13", "code_128", "code_39"],
          });
          const loop = async () => {
            if (cancelled || !videoRef.current) return;
            if (videoRef.current.readyState >= 2) {
              try {
                const hits = await detector.detect(videoRef.current);
                if (hits[0]?.rawValue) {
                  emitScan(hits[0].rawValue);
                }
              } catch {
                // Ignore transient frame errors
              }
            }
            frameId = requestAnimationFrame(loop);
          };
          frameId = requestAnimationFrame(loop);
        }

        // Engine 2: ZXing fallback running concurrently
        void zxingReader.decodeFromVideoElementContinuously(video, (result) => {
          if (!cancelled && result?.getText()) {
            emitScan(result.getText());
          }
        });
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
      zxingReader.reset();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setTorchOn(false);
    };
  }, [active, cameraEnabled, deviceIndex]);

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
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder={placeholder}
            aria-label="Barcode or search input"
            autoFocus={!defaultCameraEnabled}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Go
        </button>
        <button
          type="button"
          onClick={() => setCameraEnabled((v) => !v)}
          aria-label={cameraEnabled ? "Stop camera" : "Start camera"}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
            cameraEnabled
              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
              : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
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
            playsInline
            muted
            className="h-52 w-full object-cover"
          />
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
                onClick={() => setDeviceIndex((i) => i + 1)}
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
