(() => {
  let overlay: HTMLDivElement | null = null;
  let highlightBox: HTMLDivElement | null = null;
  let currentElement: HTMLElement | null = null;

  function createOverlay() {
    overlay = document.createElement("div");
    overlay.id = "viberglass-element-selector";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483646",
      cursor: "crosshair",
    });

    highlightBox = document.createElement("div");
    Object.assign(highlightBox.style, {
      position: "fixed",
      border: "2px solid #f59e0b",
      background: "rgba(245, 158, 11, 0.12)",
      pointerEvents: "none",
      zIndex: "2147483646",
      transition: "all 50ms ease-out",
      display: "none",
    });
    document.documentElement.appendChild(highlightBox);

    const hint = document.createElement("div");
    Object.assign(hint.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0, 0, 0, 0.8)",
      color: "white",
      padding: "8px 16px",
      borderRadius: "6px",
      fontSize: "14px",
      fontFamily: "system-ui, sans-serif",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    hint.textContent = "Click an element to capture. Press Esc to cancel.";
    document.documentElement.appendChild(hint);

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeydown, true);

    overlay.appendChild(hint);
    document.documentElement.appendChild(overlay);
  }

  function onMouseMove(e: MouseEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!el || el === overlay || el === highlightBox || overlay?.contains(el)) {
      if (highlightBox) highlightBox.style.display = "none";
      return;
    }

    currentElement = el;
    const rect = el.getBoundingClientRect();
    if (highlightBox) {
      Object.assign(highlightBox.style, {
        display: "block",
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }
  }

  function onClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentElement) return;

    const rect = currentElement.getBoundingClientRect();
    cleanup();

    const pixelRatio = window.devicePixelRatio;
    chrome.runtime.sendMessage({
      type: "ELEMENT_SELECTED",
      data: {
        x: Math.round(rect.left * pixelRatio),
        y: Math.round(rect.top * pixelRatio),
        width: Math.round(rect.width * pixelRatio),
        height: Math.round(rect.height * pixelRatio),
      },
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") cleanup();
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeydown, true);
    overlay?.remove();
    highlightBox?.remove();
    overlay = null;
    highlightBox = null;
    currentElement = null;
  }

  createOverlay();
})();
