import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { configureNexOSBridge } from '@nexos/sdk';

import { App } from './App';
import './styles.css';

configureNexOSBridge(window.nexos);

const root = document.querySelector<HTMLDivElement>('#root');
if (!root) throw new Error('NexOS could not find its renderer root.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
