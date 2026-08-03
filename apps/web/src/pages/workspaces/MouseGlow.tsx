import { useEffect, useRef } from "react";

/**
 * Mancha de gradiente azul que sigue al mouse. El listener vive solo mientras este
 * componente está montado (se limpia al desmontar), así que el efecto no se filtra
 * a ninguna otra pantalla de la app.
 */
export function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    function apply() {
      ref.current?.style.setProperty("--glow-x", `${pos.current.x}px`);
      ref.current?.style.setProperty("--glow-y", `${pos.current.y}px`);
      frame.current = null;
    }
    function onMove(e: MouseEvent) {
      pos.current = { x: e.clientX, y: e.clientY };
      if (frame.current === null) frame.current = requestAnimationFrame(apply);
    }
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return <div ref={ref} className="launchpad-glow" aria-hidden="true" />;
}
