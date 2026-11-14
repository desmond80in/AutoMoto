import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Decode a QR code from an image file with jsQR. */
export async function decodeImageFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const sc = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * sc);
    c.height = Math.round(img.height * sc);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    return jsQR(data.data, c.width, c.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Live camera QR scanner: BarcodeDetector when available, else jsQR on ~3 frames a second. */
export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [torch, setTorch] = useState<null | boolean>(null);
  const track = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    const detector = Ctor ? new Ctor({ formats: ['qr_code'] }) : null;
    const canvas = document.createElement('canvas');

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        track.current = stream.getVideoTracks()[0] ?? null;
        const caps = track.current?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorch(false);
        timer = setInterval(async () => {
          if (!v.videoWidth) return;
          let code: string | null = null;
          if (detector) {
            const found = await detector.detect(v).catch(() => []);
            code = found[0]?.rawValue ?? null;
          } else {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
            code = jsQR(d.data, d.width, d.height)?.data ?? null;
          }
          if (code && !stopped) {
            stopped = true;
            onCode(code);
          }
        }, 330);
      } catch {
        setErr("The camera didn't start. Allow camera access, take a photo instead, or type the job number.");
      }
    })();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  const toggleTorch = async () => {
    const on = !torch;
    await track.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => undefined);
    setTorch(on);
  };

  return (
    <div className="scanner">
      {err ? (
        <p className="err" role="alert">
          {err}
        </p>
      ) : (
        <video ref={video} muted playsInline aria-label="Camera preview" />
      )}
      <div className="row">
        {torch !== null && (
          <button type="button" className="btn" aria-pressed={torch} onClick={toggleTorch}>
            {torch ? 'Torch off' : 'Torch on'}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onClose}>
          Close camera
        </button>
      </div>
    </div>
  );
}
