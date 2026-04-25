(() => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  let isDrawing = false;
  let tool: "arrow" | "rectangle" | "text" = "arrow";
  let color = "#f59e0b";
  let startX = 0;
  let startY = 0;
  let container: HTMLDivElement | null = null;
  let toolbar: HTMLDivElement | null = null;

  const pixelRatio = window.devicePixelRatio;

  function init(imageDataUrl?: string) {
    container = document.createElement("div");
    container.id = "viberglass-annotator";
    Object.assign(container.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483647",
    });

    const img = new Image();
    img.onload = () => {
      canvas.width = window.innerWidth * pixelRatio;
      canvas.height = window.innerHeight * pixelRatio;
      Object.assign(canvas.style, {
        width: "100vw",
        height: "100vh",
        position: "absolute",
        top: "0",
        left: "0",
      });

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    if (imageDataUrl) img.src = imageDataUrl;

    container.appendChild(canvas);
    createToolbar();
    document.documentElement.appendChild(container);

    canvas.addEventListener("mousedown", onCanvasMouseDown);
    canvas.addEventListener("mousemove", onCanvasMouseMove);
    canvas.addEventListener("mouseup", onCanvasMouseUp);
    document.addEventListener("keydown", onKeydown);
  }

  function createToolbar() {
    toolbar = document.createElement("div");
    Object.assign(toolbar.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(15, 23, 42, 0.9)",
      borderRadius: "8px",
      padding: "6px",
      display: "flex",
      gap: "4px",
      zIndex: "2147483647",
      fontFamily: "system-ui, sans-serif",
    });

    const tools: Array<{ id: typeof tool; label: string }> = [
      { id: "arrow", label: "Arrow" },
      { id: "rectangle", label: "Box" },
      { id: "text", label: "Text" },
    ];

    tools.forEach(({ id, label }) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.dataset.tool = id;
      Object.assign(btn.style, {
        background: tool === id ? "#f59e0b" : "transparent",
        color: tool === id ? "#000" : "#fff",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "4px",
        padding: "4px 10px",
        cursor: "pointer",
        fontSize: "13px",
      });
      btn.addEventListener("click", () => {
        tool = id;
        toolbar?.querySelectorAll("button").forEach((b) => {
          const isActive = b.dataset.tool === id;
          Object.assign(b.style, {
            background: isActive ? "#f59e0b" : "transparent",
            color: isActive ? "#000" : "#fff",
          });
        });
      });
      toolbar!.appendChild(btn);
    });

    const doneBtn = document.createElement("button");
    doneBtn.textContent = "Done";
    Object.assign(doneBtn.style, {
      background: "#22c55e",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      padding: "4px 12px",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "bold",
      marginLeft: "4px",
    });
    doneBtn.addEventListener("click", finishAnnotation);
    toolbar!.appendChild(doneBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    Object.assign(cancelBtn.style, {
      background: "transparent",
      color: "#ef4444",
      border: "1px solid #ef4444",
      borderRadius: "4px",
      padding: "4px 10px",
      cursor: "pointer",
      fontSize: "13px",
    });
    cancelBtn.addEventListener("click", cleanup);
    toolbar!.appendChild(cancelBtn);

    container!.appendChild(toolbar);
  }

  function onCanvasMouseDown(e: MouseEvent) {
    isDrawing = true;
    startX = e.clientX * pixelRatio;
    startY = e.clientY * pixelRatio;
  }

  function onCanvasMouseMove(e: MouseEvent) {
    if (!isDrawing) return;
  }

  function onCanvasMouseUp(e: MouseEvent) {
    if (!isDrawing) return;
    isDrawing = false;
    const endX = e.clientX * pixelRatio;
    const endY = e.clientY * pixelRatio;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3 * pixelRatio;
    ctx.font = `${16 * pixelRatio}px system-ui, sans-serif`;

    if (tool === "arrow") {
      drawArrow(startX, startY, endX, endY);
    } else if (tool === "rectangle") {
      ctx.strokeRect(startX, startY, endX - startX, endY - startY);
    } else if (tool === "text") {
      const text = prompt("Enter annotation text:");
      if (text) ctx.fillText(text, startX, startY);
    }
  }

  function drawArrow(fromX: number, fromY: number, toX: number, toY: number) {
    const headLen = 12 * pixelRatio;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  }

  function finishAnnotation() {
    const dataUrl = canvas.toDataURL("image/png");
    chrome.runtime.sendMessage({
      type: "ANNOTATION_COMPLETE",
      data: { dataUrl },
    });
    cleanup();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") cleanup();
  }

  function cleanup() {
    canvas.removeEventListener("mousedown", onCanvasMouseDown);
    canvas.removeEventListener("mousemove", onCanvasMouseMove);
    canvas.removeEventListener("mouseup", onCanvasMouseUp);
    document.removeEventListener("keydown", onKeydown);
    container?.remove();
    container = null;
    toolbar = null;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CONTENT_SCRIPT_INIT") {
      init(message.data?.screenshotDataUrl);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  }
})();
