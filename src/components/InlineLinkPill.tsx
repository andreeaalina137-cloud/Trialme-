import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResolvedServiceLink } from '../utils/serviceLinkResolver';

// Global singleton to ensure only ONE link pill is active on screen at any time
let activePillDismiss: (() => void) | null = null;

export function registerActivePill(dismiss: () => void): () => void {
  if (activePillDismiss && activePillDismiss !== dismiss) {
    activePillDismiss();
  }
  activePillDismiss = dismiss;
  return () => {
    if (activePillDismiss === dismiss) {
      activePillDismiss = null;
    }
  };
}

export function dismissAllPills(): void {
  if (activePillDismiss) {
    activePillDismiss();
    activePillDismiss = null;
  }
}

export interface InlineLinkPillProps {
  link: ResolvedServiceLink;
  isVisible: boolean;
  onDismiss: () => void;
  anchorRect?: DOMRect | null;
  position?: 'bottom' | 'top';
}

export const InlineLinkPill: React.FC<InlineLinkPillProps> = ({
  link,
  isVisible,
  onDismiss,
  anchorRect,
  position = 'bottom',
}) => {
  const pillRef = useRef<HTMLAnchorElement>(null);
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setIsPressed(false);
      return;
    }

    const unregister = registerActivePill(onDismiss);

    const handlePointerDownOutside = (e: PointerEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    const handleScroll = () => {
      onDismiss();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };

    // Use passive capture for scroll to respond immediately across any scrolling container
    window.addEventListener('pointerdown', handlePointerDownOutside, { capture: true });
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unregister();
      window.removeEventListener('pointerdown', handlePointerDownOutside, { capture: true });
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, onDismiss]);

  if (!isVisible) return null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    setIsPressed(true);
    // Allow natural browser open via target="_blank" and href, then dismiss pill smoothly
    setTimeout(() => {
      onDismiss();
    }, 150);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    setIsPressed(true);
  };

  // Base styling: Midnight Black (#0A0A0A) background, micro-padding px-2 py-0.5, rounded-md, border-white/10
  // Transitioning to Champagne Gold (#D4AF37) on active / pressed / hover / focus
  const stateClasses = isPressed
    ? 'text-[#D4AF37] border-[#D4AF37]/60 shadow-[#D4AF37]/20 ring-1 ring-[#D4AF37]/30'
    : 'text-white border-white/10 hover:text-[#D4AF37] hover:border-[#D4AF37]/50 active:text-[#D4AF37] active:border-[#D4AF37]/50 focus-visible:text-[#D4AF37] focus-visible:border-[#D4AF37]/50';

  const commonClass = `inline-flex items-center gap-1 bg-[#0A0A0A]/95 backdrop-blur-sm border px-2 py-0.5 rounded-md shadow-lg shadow-black/80 text-[11px] font-medium tracking-wide focus-visible:outline-none transition-colors duration-150 cursor-pointer select-none whitespace-nowrap animate-in fade-in zoom-in-95 ${stateClasses}`;

  // If in browser environment and anchorRect is provided, render via Portal to escape all overflow clipping
  if (typeof document !== 'undefined' && anchorRect) {
    const pillHeight = 24;
    const pillWidth = 110;
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    let top = position === 'top'
      ? anchorRect.top - pillHeight - 6
      : anchorRect.bottom + 6;

    // Flip above if bottom overflows viewport
    if (position === 'bottom' && top + pillHeight > winHeight) {
      top = Math.max(8, anchorRect.top - pillHeight - 6);
    }

    const left = Math.max(8, Math.min(anchorRect.left, winWidth - pillWidth - 8));

    const portalContent = (
      <a
        ref={pillRef}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        style={{
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          zIndex: 99999,
        }}
        aria-label={`Open ${link.serviceName} ${link.label.replace('↗', '').trim()}`}
        className={commonClass}
      >
        <span>{link.label}</span>
      </a>
    );

    return createPortal(portalContent, document.body);
  }

  // Fallback in-place layout (SSR or when anchorRect is unavailable)
  const posClasses =
    position === 'bottom'
      ? 'top-full mt-1.5 left-0'
      : 'bottom-full mb-1.5 left-0';

  return (
    <a
      ref={pillRef}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      aria-label={`Open ${link.serviceName} ${link.label.replace('↗', '').trim()}`}
      className={`absolute ${posClasses} z-50 ${commonClass}`}
    >
      <span>{link.label}</span>
    </a>
  );
};
