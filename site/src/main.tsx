import { createRoot } from 'react-dom/client';
import '@fontsource/anton/400.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import { Hero } from './Hero';
import { Download } from './Download';

createRoot(document.getElementById('root')!).render(<main id="top"><Hero /><Download /></main>);
