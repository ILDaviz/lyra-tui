import React, { useState, useEffect } from "react";

export interface MarqueeTextProps {
  text: string;
  maxLength: number;
  isSelected?: boolean;
  isFocused?: boolean;
  fg?: string;
  delayMs?: number;
  speedMs?: number;
  alwaysScroll?: boolean;
}

export function MarqueeText({
  text,
  maxLength,
  isSelected = false,
  isFocused = true,
  fg,
  delayMs = 1200,
  speedMs = 180,
  alwaysScroll = false,
}: MarqueeTextProps): any {
  const needsMarquee =
    (alwaysScroll || (isSelected && isFocused)) && text.length > maxLength;
  const [offset, setOffset] = useState<number>(0);

  useEffect(() => {
    if (!needsMarquee) return;

    setOffset(0);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let currentOffset = 0;
    const maxOffset = text.length - maxLength;
    const totalSteps = maxOffset + 6;

    const startTimer = setTimeout(() => {
      intervalId = setInterval(() => {
        currentOffset++;
        if (currentOffset > totalSteps) {
          currentOffset = 0;
        }
        setOffset(currentOffset);
      }, speedMs);
    }, delayMs);

    return () => {
      clearTimeout(startTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, maxLength, isSelected, isFocused, delayMs, speedMs, needsMarquee]);

  if (!needsMarquee) {
    const display =
      text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
    return <text fg={fg}>{display}</text>;
  }

  const maxOffset = text.length - maxLength;
  const actualOffset = Math.min(offset, maxOffset);
  const visible = text.slice(actualOffset, actualOffset + maxLength);

  return <text fg={fg}>{visible}</text>;
}
