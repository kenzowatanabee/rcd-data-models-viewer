import '@fontsource-variable/inter/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/doc.css';
import './styles/graph.css';
import './styles/flow.css';
import './styles/palette.css';
import './styles/health.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { FolderState } from '../desktop/bridge';
import { App } from './App';
import { CloneDialog } from './CloneDialog';
import { desktop, resetSessionFor } from './desktop';
import { ShortcutProvider } from './ShortcutLayer';
import { ThemeProvider } from './theme';
import { Welcome } from './Welcome';

/** The viewer; in the desktop app, the welcome screen until a folder opens. */
function Root() {
  const [folder, setFolder] = useState<FolderState | null>(null);
  const [cloning, setCloning] = useState(false);
  useEffect(() => {
    if (desktop === null) return;
    // The menus' "Clone Repository…"
    return desktop.onOpenClone(() => setCloning(true));
  }, []);
  useEffect(() => {
    if (desktop === null) return;
    let live = true;
    void desktop.getFolder().then((state) => {
      if (!live) return;
      resetSessionFor(state.current);
      setFolder(state);
    });
    // The main process reloads the page right after; this only keeps the
    // state current until then
    const off = desktop.onFolderChanged(setFolder);
    return () => {
      live = false;
      off();
    };
  }, []);
  if (desktop === null) return <App />;
  if (folder === null) return null;
  return (
    <>
      {folder.current === null ? (
        <Welcome state={folder} onClone={() => setCloning(true)} />
      ) : (
        <App />
      )}
      {cloning && <CloneDialog onClose={() => setCloning(false)} />}
    </>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <ShortcutProvider>
        <Root />
      </ShortcutProvider>
    </ThemeProvider>
  </StrictMode>,
);
