import { useEffect, useRef } from "react";

// Concentric luminous rings that breathe with the agent's voice. Canvas, not DOM, so it costs one layer.
export function Orb({ level, size = 360, active = true }: { level: React.MutableRefObject<number>; size?: number; active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let smooth = 0;
    const draw = () => {
      t += reduce ? 0 : 0.006;
      smooth += ((active ? level.current : 0) - smooth) * 0.18;
      ctx.clearRect(0, 0, size, size);
      const c = size / 2;
      const glow = ctx.createRadialGradient(c, c, size * 0.08, c, c, size * 0.5);
      glow.addColorStop(0, `rgba(217,137,58,${0.16 + smooth * 0.25})`);
      glow.addColorStop(1, "rgba(217,137,58,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "lighter";
      const rings = 26;
      for (let i = 0; i < rings; i++) {
        const p = i / rings;
        const wobble = 1 + smooth * 0.22 * Math.sin(t * 6 + i * 0.7);
        const rx = size * (0.3 + 0.07 * Math.sin(t + p * Math.PI * 2)) * wobble;
        const ry = size * (0.27 + 0.06 * Math.cos(t * 1.3 + p * Math.PI * 2)) * wobble;
        ctx.beginPath();
        ctx.ellipse(c, c, rx, ry, t * 0.6 + p * Math.PI, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${226 - i * 2},${150 - i},${70},${0.1 + smooth * 0.18})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size, active, level]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}
