import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** SVG QR code, error correction M. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [value]);
  if (!svg) return <div className="qr-missing">QR code unavailable. Use the job number.</div>;
  return <div className="kt-qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
