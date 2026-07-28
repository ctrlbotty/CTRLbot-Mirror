import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { mirror } from './lib/video.js';
import { subscribeToMain, useStore } from './state/store.js';
import './styles.css';

// Wire the video channel and main-process events before React mounts so no
// early packet or device event is missed.
mirror.connect();
subscribeToMain();
void useStore.getState().bootstrap();

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
