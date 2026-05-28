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

    const drawCurve = (phase: number, radius: number, wobble: number, points: number, strands: number, opacity: number, lineWidth: number) => {
      const scale = Math.min(w, h) * radius;
      for (let s = 0; s < strands; s++) {
        const p = phase + (s / strands) * Math.PI * 2;
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const a = (i / points) * Math.PI * 2;
          const ripple =
            Math.sin(a * 3 + time * 0.014 + p) * wobble +
            Math.cos(a * 5 - time * 0.009 + p * 0.7) * wobble * 0.6;
          const twist = time * 0.003 + p * 0.2;
          const x = cx + Math.cos(a + twist) * scale * (0.94 + ripple) + Math.sin(a * 2.05 - time * 0.007 + p) * scale * 0.15;
          const y = cy + Math.sin(a * 1.12 - twist) * scale * (0.78 + ripple) + Math.cos(a * 2.4 + time * 0.006 + p) * scale * 0.17;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        const brightness = 43 + Math.sin(time * 0.012 + s * 0.18) * 10;
        ctx.strokeStyle = `hsla(48, 92%, ${brightness}%, ${opacity})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    const drawParticles = () => {
      const outer = Math.min(w, h) * 0.43;
      for (let i = 0; i < 50; i++) {
        const seed = i * 999.91;
        const angle = seed + time * 0.0009;
        const drift = 0.55 + 0.45 * Math.sin(seed * 0.2 + time * 0.003);
        const r = outer * drift;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle * 1.4) * r * 0.76;
        const alpha = 0.1 + 0.15 * Math.sin(seed + time * 0.01) ** 2;
        ctx.beginPath();
        ctx.fillStyle = `rgba(190, 142, 0, ${alpha})`;
        ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const draw = () => {
      time++;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.shadowColor = "rgba(226, 175, 0, 0.4)";
      ctx.shadowBlur = 4;
      drawCurve(0,              0.32, 0.1,   180, 14, 0.55, 1.2);
      drawCurve(Math.PI * 0.7,  0.34, 0.085, 180, 10, 0.45, 1.0);
      ctx.shadowBlur = 8;
      drawCurve(Math.PI * 1.25, 0.31, 0.075, 160,  8, 0.65, 1.4);
      drawParticles();
      ctx.restore();
      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [size]);

  return (
    <div
      className="relative overflow-hidden rounded-full border-2 border-yellow-400 bg-white shadow-xl shadow-yellow-900/10"
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, display: "block" }}
        className="absolute inset-0"
      />
      <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-yellow-100" />
    </div>
  );
}
