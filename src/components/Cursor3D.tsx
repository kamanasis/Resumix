import { useEffect, useRef, useState } from "react";

export default function Cursor3D() {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Only enable custom cursor on devices with a mouse pointer
    const mediaQuery = window.matchMedia("(pointer: fine)");
    if (!mediaQuery.matches) return;

    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const container = containerRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!container || !dot || !ring) return;

    let mouseX = 0;
    let mouseY = 0;
    let ringX = 0;
    let ringY = 0;
    let hasMoved = false;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      
      if (!hasMoved) {
        hasMoved = true;
        ringX = mouseX;
        ringY = mouseY;
      }
      container.style.opacity = "1";
      
      // Instantly position the central dot using GPU-accelerated translate3d with 50% offset
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    };

    const handleHoverStart = () => {
      container.classList.add("cursor-hover");
    };
    const handleHoverEnd = () => {
      container.classList.remove("cursor-hover");
    };

    const onMouseLeave = () => {
      container.style.opacity = "0";
    };

    const onMouseEnter = () => {
      if (hasMoved) {
        container.style.opacity = "1";
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    // Elegant, highly-performant event delegation instead of MutationObservers and heavy listeners
    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest("a, button, select, input, textarea, [role='button'], .clickable-cursor, .cursor-pointer");
      if (interactive) {
        handleHoverStart();
      } else {
        handleHoverEnd();
      }
    };
    window.addEventListener("mouseover", onMouseOver);

    // Smooth lagging/spring animation using requestAnimationFrame
    let animationFrameId: number;
    const lerp = (start: number, end: number, amt: number) => {
      return (1 - amt) * start + amt * end;
    };

    const updateRing = () => {
      if (hasMoved) {
        ringX = lerp(ringX, mouseX, 0.15);
        ringY = lerp(ringY, mouseY, 0.15);
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      }
      animationFrameId = requestAnimationFrame(updateRing);
    };

    animationFrameId = requestAnimationFrame(updateRing);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
      window.removeEventListener("mouseover", onMouseOver);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div ref={containerRef} style={{ opacity: 0, transition: "opacity 0.25s ease-out" }}>
      {/* Central responsive dot */}
      <div
        ref={dotRef}
        className="cursor-3d-dot"
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 99999,
          top: 0,
          left: 0,
          transform: "translate3d(0px, 0px, 0) translate(-50%, -50%)",
          transition: "width 0.1s, height 0.1s, background-color 0.2s"
        }}
      />
      {/* Lagging 3D outer ring */}
      <div
        ref={ringRef}
        className="cursor-3d-ring"
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 99998,
          top: 0,
          left: 0,
          transform: "translate3d(0px, 0px, 0) translate(-50%, -50%)",
          transition: "width 0.2s, height 0.2s, border-color 0.2s, background-color 0.2s"
        }}
      />
    </div>
  );
}
