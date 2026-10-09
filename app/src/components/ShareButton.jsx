import { useEffect, useId, useRef, useState } from "react";
import "./ShareButton.css";

// The QR library is only downloaded when someone opens a QR code.
const loadQr = () => import("uqr");

// Quiet zone around the code, in modules: the QR standard asks for 4.
const QR_BORDER = 4;
const PNG_MODULE_PX = 10;

// SVG path of the dark modules: one unit square per module.
function qrPath(data) {
  let d = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    })
  );
  return d;
}

function downloadPng(data, filename) {
  const size = data.length * PNG_MODULE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect(x * PNG_MODULE_PX, y * PNG_MODULE_PX, PNG_MODULE_PX, PNG_MODULE_PX);
    })
  );
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  }, "image/png");
}

const slug = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/**
 * "Share" for the page's current link (the URL carries the open event, years,
 * filters and area, so the link reopens the same view). Opens a small panel:
 * the device's own share sheet where the browser offers one (phones, some
 * desktops), "Copy link", and a QR code that can be saved as a PNG. The QR is
 * drawn here; the link is never sent to any service.
 *
 * @param {object} props
 * @param {string} props.title  shared as the title, and names the PNG
 * @param {"start"|"end"} [props.align]  which edge of the button the panel lines up with
 */
export default function ShareButton({ title, align = "start", className = "sp-btn" }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState(null); // {url, data} | "loading" | "error" | null
  const [copied, setCopied] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const close = (returnFocus) => {
    setOpen(false);
    setQr(null);
    if (returnFocus) buttonRef.current?.focus();
  };

  // Escape or a press outside closes the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) close(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    panelRef.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  async function shareNative() {
    try {
      await navigator.share({ title, url: window.location.href });
      close(true);
    } catch {
      // Cancelled by the user, or refused: the panel stays open for the other options.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  }

  async function showQr() {
    const url = window.location.href;
    setQr("loading");
    try {
      const { encode } = await loadQr();
      setQr({ url, data: encode(url, { ecc: "M", border: QR_BORDER }).data });
    } catch {
      setQr("error");
    }
  }

  return (
    <div className={`share share--${align}`} ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className={className}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        Share
      </button>
      {open && (
        <div className="share-panel" id={panelId} ref={panelRef} role="group" aria-label="Share this view">
          {canShare && (
            <button type="button" className="sp-btn" onClick={shareNative}>
              Share via…
            </button>
          )}
          <button type="button" className="sp-btn" onClick={copyLink}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          {qr === null && (
            <button type="button" className="sp-btn" onClick={showQr}>
              QR code
            </button>
          )}
          {qr === "loading" && <p className="share-note">Making the QR code…</p>}
          {qr === "error" && <p className="share-note">The QR code could not be made. Please try again.</p>}
          {qr?.data && (
            <figure className="share-qr">
              <svg
                viewBox={`0 0 ${qr.data.length} ${qr.data.length}`}
                shapeRendering="crispEdges"
                role="img"
                aria-label="QR code for the link to this view"
              >
                <rect width="100%" height="100%" fill="#fff" />
                <path d={qrPath(qr.data)} fill="#000" />
              </svg>
              <button
                type="button"
                className="sp-btn"
                onClick={() => downloadPng(qr.data, `${slug(title) || "middleeast-events"}-qr.png`)}
              >
                Download PNG
              </button>
            </figure>
          )}
          <span className="sp-sr-status" role="status">
            {copied ? "Link copied" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
