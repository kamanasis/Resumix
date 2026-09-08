import { useEffect, useRef, useState } from "react";

export default function Cursor3D() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isTextInput, setIsTextInput] = useState(false);

  useEffect(() => {
    // Add custom cursor class to html/body so default cursor is hidden only when Cursor3D is running
    document.documentElement.classList.add("has-custom-cursor");

    let mouseX = -100;
    let mouseY = -100;
    let ringX = -100;
    let ringY = -100;
    let isMoving = false;
    let animationFrameId: number;

    const onPointerMove = (e: PointerEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!isMoving) {
        isMoving = true;
        ringX = mouseX;
        ringY = mouseY;
        setIsActive(true);
      }

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      }

      // Check if hovering interactive or text input element
      const target = e.target as HTMLElement | null;
      if (target) {
        const textElem = target.closest("input, textarea, [contenteditable='true']");
        setIsTextInput(!!textElem);

        const interactive = target.closest(
          "a, button, select, [role='button'], .clickable-cursor, .cursor-pointer"
        );
        setIsHovered(!!interactive);
      }
    };

    const onPointerDown = () => {
      if (ringRef.current) {
        ringRef.current.style.scale = "0.75";
      }
    };

    const onPointerUp = () => {
      if (ringRef.current) {
        ringRef.current.style.scale = isHovered ? "1.4" : "1";
      }
    };

    const onPointerLeave = () => {
      setIsActive(false);
    };

    const onPointerEnter = () => {
      setIsActive(true);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("pointerenter", onPointerEnter);

    // Smooth physics lerp loop for the 3D trailing ring
    const lerp = (start: number, end: number, amt: number) => {
      return (1 - amt) * start + amt * end;
    };

    const animateRing = () => {
      if (isMoving && ringRef.current) {
        ringX = lerp(ringX, mouseX, 0.2);
        ringY = lerp(ringY, mouseY, 0.2);
        ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      }
      animationFrameId = requestAnimationFrame(animateRing);
    };

    animationFrameId = requestAnimationFrame(animateRing);

    return () => {
      document.documentElement.classList.remove("has-custom-cursor");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("pointerenter", onPointerEnter);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isHovered]);

  return (
    <div
      style={{
        pointerEvents: "none",
        zIndex: 9999999,
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        opacity: isActive ? 1 : 0,
        transition: "opacity 0.2s ease-out",
      }}
      aria-hidden="true"
    >
      {/* 3D Central Glowing Dot */}
      <div
        ref={dotRef}
        className="cursor-3d-dot"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: isHovered ? "14px" : isTextInput ? "4px" : "8px",
          height: isHovered ? "14px" : isTextInput ? "18px" : "8px",
          borderRadius: isTextInput ? "2px" : "50%",
          backgroundColor: isHovered ? "#22d3ee" : "#06b6d4",
          boxShadow: isHovered
            ? "0 0 16px rgba(34, 211, 238, 0.95), 0 0 32px rgba(6, 182, 212, 0.7)"
            : "0 0 10px rgba(6, 182, 212, 0.75)",
          pointerEvents: "none",
          transform: "translate3d(-100px, -100px, 0) translate(-50%, -50%)",
          transition: "width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.2s, box-shadow 0.2s, border-radius 0.2s",
          willChange: "transform",
        }}
      />

      {/* 3D Trailing Glowing Ring */}
      <div
        ref={ringRef}
        className="cursor-3d-ring"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: isHovered ? "48px" : isTextInput ? "24px" : "36px",
          height: isHovered ? "48px" : isTextInput ? "24px" : "36px",
          borderRadius: "50%",
          border: isHovered
            ? "2px solid rgba(34, 211, 238, 0.95)"
            : "2px solid rgba(6, 182, 212, 0.65)",
          backgroundColor: isHovered
            ? "rgba(6, 182, 212, 0.18)"
            : "rgba(6, 182, 212, 0.05)",
          boxShadow: isHovered
            ? "0 0 24px rgba(6, 182, 212, 0.55), inset 0 0 12px rgba(6, 182, 212, 0.35)"
            : "0 0 12px rgba(6, 182, 212, 0.3), inset 0 0 6px rgba(6, 182, 212, 0.15)",
          pointerEvents: "none",
          transform: "translate3d(-100px, -100px, 0) translate(-50%, -50%)",
          transition: "width 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.2s, background-color 0.2s, box-shadow 0.2s, scale 0.15s ease-out",
          willChange: "transform",
        }}
      />
    </div>
  );
}
