"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Stage, Layer, Image as KImage, Text as KText } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import { ArrowLeft, Bold, Download, Minus, Plus } from "lucide-react";

interface Props {
  image: string; // data URL of the variant
  headline: string; // initial overlay text
  onClose: () => void;
}

const PALETTE = ["#ffffff", "#000000", "#ffd166", "#ff5e7e", "#5be0c3", "#7aa8ff"];

export default function Composer({ image, headline, onClose }: Props) {
  const [img] = useImage(image, "anonymous");
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const textRef = useRef<Konva.Text>(null);

  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [scale, setScale] = useState(1);

  // Text state
  const [text, setText] = useState(headline);
  const [pos, setPos] = useState({ xR: 0.5, yR: 0.5 }); // relative position 0..1
  const [fontSize, setFontSize] = useState(64);
  const [color, setColor] = useState("#ffffff");
  const [bold, setBold] = useState(true);
  const [editing, setEditing] = useState(false);
  const [textareaStyle, setTextareaStyle] = useState<React.CSSProperties>({});

  // Natural image size
  const natural = useMemo(() => {
    if (!img) return { width: 1024, height: 1024 };
    return { width: img.naturalWidth, height: img.naturalHeight };
  }, [img]);

  // Fit stage to container while preserving image aspect
  useLayoutEffect(() => {
    function recalc() {
      const c = containerRef.current;
      if (!c) return;
      const cw = c.clientWidth;
      const ch = c.clientHeight;
      const ar = natural.width / natural.height;
      let w = cw;
      let h = cw / ar;
      if (h > ch) {
        h = ch;
        w = ch * ar;
      }
      setStageSize({ width: w, height: h });
      setScale(w / natural.width);
    }
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [natural.width, natural.height]);

  // Position the editing textarea over the Konva text node
  useEffect(() => {
    if (!editing) return;
    const node = textRef.current;
    const stage = stageRef.current;
    if (!node || !stage) return;
    const box = node.getClientRect();
    const stageBox = stage.container().getBoundingClientRect();
    setTextareaStyle({
      position: "fixed",
      top: stageBox.top + box.y,
      left: stageBox.left + box.x,
      width: Math.max(box.width, 120) + "px",
      minHeight: box.height + "px",
      fontSize: node.fontSize() + "px",
      color: node.fill() as string,
      fontFamily: node.fontFamily(),
      fontWeight: bold ? 700 : 500,
      lineHeight: String(node.lineHeight()),
      transform: `rotate(${node.rotation()}deg)`,
      transformOrigin: "top left",
      letterSpacing: "0.02em",
      background: "transparent",
      border: "1px dashed rgba(255,255,255,0.6)",
      outline: "none",
      padding: "0",
      margin: "0",
      resize: "none",
      overflow: "hidden",
      textAlign: "left" as const,
      zIndex: 1000,
    });
  }, [editing, bold]);

  const xPx = pos.xR * natural.width;
  const yPx = pos.yR * natural.height;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    setPos({
      xR: node.x() / natural.width,
      yR: node.y() / natural.height,
    });
  };

  const finishEditing = useCallback(() => {
    setEditing(false);
  }, []);

  const handleDownload = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const uri = stage.toDataURL({
      pixelRatio: Math.max(1, 1 / scale), // export at native resolution
      mimeType: "image/png",
    });
    const a = document.createElement("a");
    a.href = uri;
    a.download = "studio-composition.png";
    a.click();
  }, [scale]);

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-xs hover:bg-[var(--bg-elev-2)]"
        >
          <ArrowLeft size={14} /> Back to canvas
        </button>
        <div className="text-xs text-[var(--muted)]">
          Drag to reposition · double-click to edit
        </div>
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90"
        >
          <Download size={14} /> Download
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-1.5 text-xs">
        <span className="px-1 text-[var(--muted)]">Size</span>
        <button
          onClick={() => setFontSize((s) => Math.max(16, s - 6))}
          className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elev-2)]"
        >
          <Minus size={12} />
        </button>
        <span className="w-7 text-center tabular-nums">{fontSize}</span>
        <button
          onClick={() => setFontSize((s) => Math.min(240, s + 6))}
          className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elev-2)]"
        >
          <Plus size={12} />
        </button>
        <div className="mx-1 h-4 w-px bg-[var(--border)]" />
        <button
          onClick={() => setBold((b) => !b)}
          className={
            "grid h-6 w-6 place-items-center rounded " +
            (bold
              ? "bg-[var(--bg-elev-2)] text-white"
              : "text-[var(--muted)] hover:bg-[var(--bg-elev-2)]")
          }
          aria-label="Bold"
        >
          <Bold size={12} />
        </button>
        <div className="mx-1 h-4 w-px bg-[var(--border)]" />
        <span className="px-1 text-[var(--muted)]">Color</span>
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={
              "h-5 w-5 rounded-full border " +
              (color === c ? "border-white" : "border-white/20")
            }
            style={{ background: c }}
            aria-label={`Color ${c}`}
          />
        ))}
        <div className="ml-auto text-[var(--muted)]">
          Text overlay is editable (not baked) — download to flatten.
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-black"
        style={{ minHeight: 320 }}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: stageSize.width,
            height: stageSize.height,
            transform: "translate(-50%, -50%)",
          }}
        >
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={scale}
            scaleY={scale}
          >
            <Layer>
              {img ? (
                <KImage
                  image={img}
                  width={natural.width}
                  height={natural.height}
                />
              ) : null}
              <KText
                ref={textRef}
                text={editing ? "" : text}
                x={xPx}
                y={yPx}
                draggable
                onDragEnd={handleDragEnd}
                onDblClick={() => setEditing(true)}
                onDblTap={() => setEditing(true)}
                fontSize={fontSize}
                fontStyle={bold ? "bold" : "normal"}
                fill={color}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth={Math.max(1, fontSize / 32)}
                shadowColor="black"
                shadowBlur={fontSize / 6}
                shadowOpacity={0.35}
                fontFamily="Geist, system-ui, sans-serif"
                letterSpacing={2}
              />
            </Layer>
          </Stage>
          {editing && (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={(e) => {
                if (e.key === "Escape") finishEditing();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  finishEditing();
                }
              }}
              style={textareaStyle}
            />
          )}
        </div>
      </div>
    </div>
  );
}
