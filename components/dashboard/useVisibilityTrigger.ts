"use client";

import { RefObject, useEffect, useState } from "react";

export function useVisibilityTrigger<T extends HTMLElement>(ref: RefObject<T | null>, enabled = true) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled || isVisible || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [enabled, isVisible, ref]);

  return isVisible;
}
