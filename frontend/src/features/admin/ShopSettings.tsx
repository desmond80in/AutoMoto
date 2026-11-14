import { useState } from 'react';
import { useApp } from '../../session/AppContext';
import { useReady, useSession } from '../../session/SessionProvider';
import { parseNumber } from '../../lib/normalize';
import { useAction } from '../shared/useAction';
import { PinInput } from '../../components/PinInput';

export function ShopSettings() {
  const { api } = useApp();
  const { me } = useReady();
  const { refreshMe } = useSession();
  const { busy, run } = useAction();
  const [shop, setShop] = useState({ name: me.shop.name, hst: String(Math.round(me.shop.hst_rate * 10000) / 100), rate: String(me.shop.labour_rate) });
  const [pin, setPin] = useState({ a: '', b: '' });
  const [err, setErr] = useState<string | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);

  const saveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    const hst = parseNumber(shop.hst);
    const rate = parseNumber(shop.rate);
    if (!shop.name.trim()) return setErr('Enter the shop name.');
    if (hst == null || hst < 0 || hst > 20) return setErr('HST must be between 0 and 20%.');
    if (rate == null || rate < 0 || rate > 1000) return setErr('The labour rate must be between $0 and $1,000 an hour.');
    setErr(null);
    const r = await run('shop', () => api.updateShop({ name: shop.name.trim(), hst_rate: hst / 100, labour_rate: rate }), 'Shop settings saved.').catch(() => undefined);
    if (r) void refreshMe();
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin.a)) return setPinErr('Enter 4 to 6 digits.');
    if (pin.a !== pin.b) return setPinErr("The PINs don't match.");
    setPinErr(null);
    await run('pin', () => api.setMyPin(pin.a), 'Your PIN was changed.').then(() => setPin({ a: '', b: '' }), () => undefined);
  };

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <form className="panel stack" onSubmit={saveShop} noValidate>
        <h2>Shop settings</h2>
        <div className="grid3">
          <div className="field">
            <label className="lbl" htmlFor="sh-name">
              Shop name
            </label>
            <input id="sh-name" value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="sh-hst">
              HST rate (%)
            </label>
            <input id="sh-hst" inputMode="decimal" value={shop.hst} onChange={(e) => setShop({ ...shop, hst: e.target.value })} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="sh-rate">
              Default labour rate ($/hr)
            </label>
            <input id="sh-rate" inputMode="decimal" value={shop.rate} onChange={(e) => setShop({ ...shop, rate: e.target.value })} />
          </div>
        </div>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <div>
          <button className="btn primary" disabled={busy === 'shop'}>
            Save shop settings
          </button>
        </div>
      </form>
      <form className="panel stack" onSubmit={savePin} autoComplete="off" noValidate>
        <h2>Change my PIN</h2>
        <div className="grid2">
          <div className="field">
            <label className="lbl" htmlFor="np1">
              New PIN
            </label>
            <PinInput id="np1" value={pin.a} onChange={(a) => setPin({ ...pin, a })} autoComplete="new-password" />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="np2">
              Repeat the PIN
            </label>
            <PinInput id="np2" value={pin.b} onChange={(b) => setPin({ ...pin, b })} autoComplete="new-password" />
          </div>
        </div>
        {pinErr && (
          <p className="err" role="alert">
            {pinErr}
          </p>
        )}
        <div>
          <button className="btn" disabled={busy === 'pin'}>
            Change my PIN
          </button>
        </div>
      </form>
    </div>
  );
}
