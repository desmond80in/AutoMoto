import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const LANGS: [string, string][] = [
  ['en-CA', 'English (Canada)'],
  ['fr-CA', 'Français (Canada)'],
  ['es-MX', 'Español'],
  ['pt-BR', 'Português'],
  ['pa-IN', 'ਪੰਜਾਬੀ'],
  ['hi-IN', 'हिन्दी'],
  ['zh-CN', '中文'],
  ['ta-IN', 'தமிழ்'],
  ['fil-PH', 'Tagalog'],
];

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MIC = (
  <svg className="mic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

interface Props {
  mode: 'visit' | 'registration';
  text: string;
  onText: (t: string) => void;
  onFill: () => void;
  busy: boolean;
  message?: string | null;
  result?: ReactNode;
}

/** Typed or spoken description + "Fill in the form for me" (SPEC-FRONTEND 7.3). */
export function VoiceBox({ mode, text, onText, onFill, busy, message, result }: Props) {
  const id = useId();
  const Ctor = recognitionCtor();
  const [speech, setSpeech] = useState(!!Ctor);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState('en-CA');
  const rec = useRef<RecognitionLike | null>(null);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => () => rec.current?.stop(), []);

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let fin = '';
      let mid = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) fin += res[0].transcript;
        else mid += res[0].transcript;
      }
      if (fin) onText((textRef.current ? `${textRef.current.trimEnd()} ` : '') + fin.trim());
      setInterim(mid);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') setSpeech(false);
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setSpeech(false);
    }
  };

  const isVisit = mode === 'visit';
  const label = isVisit ? "Tell us what's wrong, in your own words" : 'Prefer to talk? Tell us about you and your car';
  const placeholder = isVisit
    ? 'For example: "When I brake on the highway there is a grinding noise from the front. The battery light came on yesterday. It has about 53 thousand kilometres."'
    : 'For example: "My name is Ravi Patel, my number is 437 555 0101. I drive a 2018 Mazda CX-5, plate CKTR 418."';

  return (
    <div className="voice">
      <div className="spread">
        <label className="lbl" htmlFor={`${id}-say`}>
          {label}
        </label>
        <span className="tag">Any language</span>
      </div>
      <textarea id={`${id}-say`} rows={4} placeholder={placeholder} value={text} onChange={(e) => onText(e.target.value)} />
      {listening && interim && <p className="interim" aria-live="polite">{interim}</p>}
      {speech ? (
        <div className="row">
          <button type="button" className="btn mic-btn" aria-pressed={listening} onClick={toggle}>
            {MIC} {listening ? 'Stop' : 'Tap to talk'}
          </button>
          <label className="sr" htmlFor={`${id}-lang`}>
            Language
          </label>
          <select id={`${id}-lang`} value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: 'auto' }} disabled={listening}>
            {LANGS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="hint voice-tip">
          {MIC}
          <span>To talk instead of type, tap the microphone key on the keyboard, speak, then tap it again.</span>
        </p>
      )}
      <div className="row">
        <button type="button" className="btn primary" onClick={onFill} disabled={busy}>
          {busy ? 'Reading your description…' : 'Fill in the form for me'}
        </button>
        {message && (
          <span className="ai-msg warn" role="status">
            {message}
          </span>
        )}
      </div>
      {result}
    </div>
  );
}
