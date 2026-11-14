import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './design/tokens.css';
import './design/base.css';
import './design/print.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadConfig } from './config/loadConfig';

const root = createRoot(document.getElementById('root')!);

loadConfig()
  .then((cfg) =>
    root.render(
      <StrictMode>
        <App cfg={cfg} />
      </StrictMode>,
    ),
  )
  .catch((e) => {
    console.error(e);
    root.render(
      <main className="center-page">
        <div className="card err-page">
          <h1>This screen can't start.</h1>
          <p className="lede">This screen can't start. Check the network and reload.</p>
          <p style={{ marginTop: 16 }}>
            <button type="button" className="btn primary" onClick={() => location.reload()}>
              Reload
            </button>
          </p>
        </div>
      </main>,
    );
  });
