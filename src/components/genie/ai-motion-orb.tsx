"use client";

import React, { useEffect, useRef } from "react";

interface AIMotionOrbProps {
  size?: number;
}

export default function AIMotionOrb({ size = 56 }: AIMotionOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = size;
    const h = size;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    let time = 0;

    const drawGroup = (
      count: number,
      phaseOffset: number,
      radiusFactor: number,
      wobble: number,
      opacity: number,
      lineWidth: number,
      hue: number,
      lightness: number,
    ) => {
      const scale = Math.min(w, h) * radiusFactor;
      const points = 160;
      for (let s = 0; s < count; s++) {
        const p = phaseOffset + (s / count) * Math.PI * 2;
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const a = (i / points) * Math.PI * 2;
          const ripple =
            Math.sin(a * 2 + time * 0.008 + p) * wobble +
            Math.cos(a * 3.5 - time * 0.005 + p * 0.7) * wobble * 0.45;
          const twist = time * 0.002 + p * 0.15;
          const x =
            cx +
            Math.cos(a + twist) * scale * (0.9 + ripple) +
            Math.sin(a * 1.9 - time * 0.004 + p) * scale * 0.11;
          const y =
            cy +
            Math.sin(a * 1.05 - twist) * scale * (0.76 + ripple) +
            Math.cos(a * 2.2 + time * 0.003 + p) * scale * 0.13;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${hue}, 70%, ${lightness}%, ${opacity})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    const draw = () => {
      time++;
      ctx.clearRect(0, 0, w, h);
      ctx.save();

      // Soft gold glow so lines bloom slightly on dark bg
      ctx.shadowColor = "rgba(234, 170, 0, 0.3)";
      ctx.shadowBlur = 4;

      // Outer layer — 7 strands
      drawGroup(7, 0, 0.32, 0.09, 0.40, 0.9, 45, 62);
      // Mid layer — 5 strands, slightly lighter
      drawGroup(5, Math.PI * 0.4, 0.28, 0.07, 0.32, 0.75, 43, 72);
      // Inner layer — 4 strands, brightest (closest to centre)
      drawGroup(4, Math.PI * 0.9, 0.24, 0.06, 0.28, 0.65, 40, 80);

      ctx.restore();
      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [size]);

  return (
    <div
      className="relative overflow-hidden rounded-full border border-gray-200 shadow-sm"
      style={{ width: size, height: size }}
    >
      {/* Dark background — gold strands pop against it */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 40%, #1c1300 0%, #000000 100%)",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, display: "block" }}
        className="absolute inset-0"
      />
    </div>
  );
}
