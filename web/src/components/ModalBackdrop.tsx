import React, { useRef } from "react";

interface ModalBackdropProps {
  onClose: () => void;
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}

export const ModalBackdrop: React.FC<ModalBackdropProps> = ({
  onClose,
  ariaLabel,
  className = "",
  children,
}) => {
  const mouseDownInsideRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownInsideRef.current = e.target !== e.currentTarget;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mouseDownInsideRef.current) {
      mouseDownInsideRef.current = false;
      return;
    }
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/70 ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {children}
    </div>
  );
};
