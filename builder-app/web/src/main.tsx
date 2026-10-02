import React from 'react';
import { createRoot } from 'react-dom/client';
import { Viewer } from './viewer';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Viewer /></React.StrictMode>);
