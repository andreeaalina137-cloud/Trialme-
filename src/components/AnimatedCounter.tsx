import React, { useEffect, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  currencySymbol?: string;
  decimals?: number;
  className?: string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  currencySymbol = '£',
  decimals = 2,
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let startTime: number | null = null;
    const startValue = displayValue;
    const endValue = value;
    const duration = 600; // ms

    if (startValue === endValue) return;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * ease;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
      }
    };

    const frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  const formatted = displayValue.toFixed(decimals);
  if (currencySymbol === 'lei') {
    return <span className={`tabular-nums font-mono tracking-tight ${className}`}>{formatted}&nbsp;lei</span>;
  }
  return <span className={`tabular-nums font-mono tracking-tight ${className}`}>{currencySymbol}{formatted}</span>;
};
