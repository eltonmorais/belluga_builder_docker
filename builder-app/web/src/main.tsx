import React from 'react';
import { createRoot } from 'react-dom/client';
import { Viewer } from './viewer';
import { LocalArtifactPreview } from './local-artifact-preview';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode>{location.pathname === '/local' ? <LocalArtifactPreview /> : <Viewer />}</React.StrictMode>);
