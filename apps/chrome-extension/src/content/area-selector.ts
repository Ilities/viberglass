(() => {
  let overlay: HTMLDivElement | null = null;
  let selectionBox: HTMLDivElement | null = null;
  let startX = 0;
  let startY = 0;

  function createOverlay() {
    overlay = document.createElement("div");
    overlay.id = "viberglass-area-selector";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483647",
      cursor: "crosshair",
      background: "rgba(0, 0, 0, 0.3)",
    });

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
    hint.textContent = "Click and drag to select area. Press Esc to cancel.";
    overlay.appendChild(hint);

    selectionBox = document.createElement("div");
    Object.assign(selectionBox.style, {
      position: "absolute",
      border: "2px dashed #f59e0b",
      background: "rgba(245, 158, 11, 0.15)",
      pointerEvents: "none",
      display: "none",
    });
    overlay.appendChild(selectionBox);

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeydown);

    document.documentElement.appendChild(overlay);
  }

  function onMouseDown(e: MouseEvent) {
    startX = e.clientX;
    startY = e.clientY;
    if (selectionBox) {
      Object.assign(selectionBox.style, {
        display: "block",
        left: `${startX}px`,
        top: `${startY}px`,
        width: "0px",
        height: "0px",
      });
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!selectionBox || selectionBox.style.display === "none") return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    Object.assign(selectionBox.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  }

  function onMouseUp(e: MouseEvent) {
    if (!selectionBox || selectionBox.style.display === "none") return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    cleanup();

    if (w < 5 || h < 5) return;

    const pixelRatio = window.devicePixelRatio;
    chrome.runtime.sendMessage({
      type: "AREA_SELECTED",
      data: {
        x: Math.round(x * pixelRatio),
        y: Math.round(y * pixelRatio),
        width: Math.round(w * pixelRatio),
        height: Math.round(h * pixelRatio),
      },
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") cleanup();
  }

  function cleanup() {
    if (overlay) {
      overlay.removeEventListener("mousedown", onMouseDown);
      overlay.removeEventListener("mousemove", onMouseMove);
      overlay.removeEventListener("mouseup", onMouseUp);
      overlay.remove();
      overlay = null;
    }
    document.removeEventListener("keydown", onKeydown);
  }

  createOverlay();
})();
