// Reproduce un TerminalScript con efecto typewriter: primero teclea el comando,
// luego revela la salida línea por línea. Puerto del `DCLogic` del prototipo
// (Pemie Landing.dc.html) a un hook de React con cancelación por AbortController
// en vez del contador `_t` manual del original.

import { useEffect, useState } from "react";
import type { TerminalScript, TerminalSegment } from "../data/terminalScripts.js";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useTerminalPlayback(script: TerminalScript) {
  const [typed, setTyped] = useState("");
  const [lines, setLines] = useState<TerminalSegment[][]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    if (prefersReducedMotion()) {
      setTyped(script.command);
      setLines(script.lines);
      return () => controller.abort();
    }

    setTyped("");
    setLines([]);

    (async () => {
      try {
        await sleep(300, signal);
        for (let i = 1; i <= script.command.length; i++) {
          setTyped(script.command.slice(0, i));
          await sleep(16 + Math.random() * 26, signal);
        }
        await sleep(260, signal);
        setTyped("");
        for (const segs of script.lines) {
          await sleep(240, signal);
          setLines((prev) => [...prev, segs]);
        }
      } catch {
        // AbortError esperado al cambiar de script o desmontar: no hay nada que hacer.
      }
    })();

    return () => controller.abort();
  }, [script]);

  return { typed, lines };
}
