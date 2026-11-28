import React from "react";
import { X } from "lucide-react";
import { BarcodeScanner } from "./BarcodeScanner";
import { ModalBackdrop } from "./ModalBackdrop";

interface BarcodeScanModalProps {
  open: boolean;
  title?: string;
  allowQrCodes?: boolean;
  onCapture: (code: string) => void;
  onClose: () => void;
}

export const BarcodeScanModal: React.FC<BarcodeScanModalProps> = ({
  open,
  title = "Scan Barcode",
  allowQrCodes = true,
  onCapture,
  onClose,
}) => {
  if (!open) return null;

  return (
    <ModalBackdrop
      onClose={onClose}
      ariaLabel={title}
      className="flex items-end justify-center p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close barcode scanner"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <BarcodeScanner
          active={open}
          allowQrCodes={allowQrCodes}
          placeholder="Scan or enter barcode..."
          onScan={(code) => {
            onCapture(code);
            onClose();
          }}
        />
      </div>
    </ModalBackdrop>
  );
};
