import { createPortal } from 'react-dom';
import { useState } from 'react';
import type { CSSProperties, FC } from 'react';

export interface ConfettiOrigin {
  x: number;
  y: number;
}

export interface ConfettiBurst {
  id: number;
  origin: ConfettiOrigin;
}

interface ConfettiExplosionProps {
  burst: ConfettiBurst | null;
  onComplete: (burstId: number) => void;
}

interface ConfettiParticle {
  color: string;
  travelX: number;
  travelY: number;
  rotation: number;
  width: number;
  height: number;
  shape: '2px' | '50%';
}

const PARTICLE_COLORS = ['#FBBF24', '#10B981', '#22D3EE', '#FFFFFF'];
const PARTICLE_COUNT = 60;

function createParticles(): ConfettiParticle[] {
  const maxDistance = Math.max(window.innerWidth, window.innerHeight);

  return Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * maxDistance * 0.85;

    return {
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      travelX: Math.cos(angle) * distance,
      travelY: Math.sin(angle) * distance,
      rotation: Math.round(Math.random() * 1080 - 540),
      width: 6 + Math.random() * 7,
      height: 6 + Math.random() * 10,
      shape: Math.random() > 0.72 ? '50%' : '2px',
    };
  });
}

export const ConfettiExplosion: FC<ConfettiExplosionProps> = ({ burst, onComplete }) => {
  const [particles] = useState(createParticles);
  if (!burst) return null;

  return createPortal(
    <div
      data-testid="confetti-explosion"
      data-burst-id={burst.id}
      data-particle-count={particles.length}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 999999,
      }}
    >
      {particles.map((particle, index) => (
        <span
          key={`${burst.id}-${index}`}
          data-testid="confetti-particle"
          className="confetti-explosion-particle"
          onAnimationEnd={index === particles.length - 1 ? () => onComplete(burst.id) : undefined}
          style={{
            left: `${burst.origin.x}px`,
            top: `${burst.origin.y}px`,
            width: `${particle.width}px`,
            height: `${particle.height}px`,
            backgroundColor: particle.color,
            borderRadius: particle.shape,
            '--confetti-x': `${particle.travelX}px`,
            '--confetti-y': `${particle.travelY}px`,
            '--confetti-rotation': `${particle.rotation}deg`,
          } as CSSProperties}
        />
      ))}
    </div>,
    document.body
  );
};
