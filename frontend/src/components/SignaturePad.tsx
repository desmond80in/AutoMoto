import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface SignaturePadHandle {
  clear(): void;
  isEmpty(): boolean;
  /** White-background PNG, at most 600 x 200. */
  toBlob(): Promise<Blob>;
}

interface Props {
  onDrawingChange?: (drawing: boolean) => void;
  onChange?: (hasSignature: boolean) => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad({ onDrawingChange, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const empty = useRef(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.round(c.clientWidth * ratio);
    c.height = Math.round(c.clientHeight * ratio);
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14213d';
    ctx.fillStyle = '#14213d';
    let drawing = false;
    let last = { x: 0, y: 0 };
    const pos = (e: PointerEvent) => {
      const b = c.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      last = pos(e);
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        // not supported
      }
      ctx.beginPath();
      ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2);
      ctx.fill();
      onDrawingChange?.(true);
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    };
    const up = () => {
      if (!drawing) return;
      drawing = false;
      if (empty.current) {
        empty.current = false;
        onChange?.(true);
      }
      onDrawingChange?.(false);
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', up);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('pointerleave', up);
    };
  }, [onChange, onDrawingChange]);

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvas.current!;
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
      empty.current = true;
      onChange?.(false);
    },
    isEmpty: () => empty.current,
    toBlob() {
      const c = canvas.current!;
      const scale = Math.min(1, 600 / c.clientWidth, 200 / c.clientHeight);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(c.clientWidth * scale));
      out.height = Math.max(1, Math.round(c.clientHeight * scale));
      const x = out.getContext('2d')!;
      x.fillStyle = '#fff';
      x.fillRect(0, 0, out.width, out.height);
      x.drawImage(c, 0, 0, out.width, out.height);
      return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Signature export failed'))), 'image/png'));
    },
  }));

  return (
    <canvas
      ref={canvas}
      className="sigpad"
      role="img"
      aria-label="Signature pad. Draw your signature with a finger or mouse."
      data-testid="signature-pad"
    />
  );
});
