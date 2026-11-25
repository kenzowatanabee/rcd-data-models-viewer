import '@fontsource-variable/inter/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/doc.css';
import './styles/graph.css';
import './styles/flow.css';
import './styles/palette.css';
import './styles/health.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ShortcutProvider } from './ShortcutLayer';
import { ThemeProvider } from './theme';

const root = document.getElementById('root');
if (root === null) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <ShortcutProvider>
        <App />
      </ShortcutProvider>
    </ThemeProvider>
  </StrictMode>,
);
