import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { WorkspaceSummary } from "../../lib/api.js";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

/**
 * Navegación por teclado del selector de workspaces: ↑↓ mueven el foco real entre filas,
 * enter entra al workspace enfocado, ⌘/ctrl+1..9 salta directo a la posición N de `list`
 * (la lista visible, ya filtrada), / enfoca el buscador y ⌘/ctrl+N abre "nuevo workspace".
 */
export function useWorkspaceKeys(
  list: WorkspaceSummary[],
  rowRefs: React.MutableRefObject<(HTMLAnchorElement | null)[]>,
  options?: { filterInputRef?: React.RefObject<HTMLInputElement>; onCreate?: () => void }
) {
  const navigate = useNavigate();
  const activeIndex = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) && e.key !== "Escape") {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n" && options?.onCreate) {
          e.preventDefault();
          options.onCreate();
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (list.length === 0) return;
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        activeIndex.current = (activeIndex.current + delta + list.length) % list.length;
        rowRefs.current[activeIndex.current]?.focus();
        return;
      }

      if (e.key === "Enter") {
        const focused = rowRefs.current.findIndex((el) => el === document.activeElement);
        const target = list[focused >= 0 ? focused : activeIndex.current];
        if (target) navigate(`/w/${target.slug}`);
        return;
      }

      if (e.key === "/" && options?.filterInputRef) {
        e.preventDefault();
        options.filterInputRef.current?.focus();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n" && options?.onCreate) {
        e.preventDefault();
        options.onCreate();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const index = Number(e.key) - 1;
        const target = list[index];
        if (target) {
          e.preventDefault();
          navigate(`/w/${target.slug}`);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, options?.onCreate]);
}
