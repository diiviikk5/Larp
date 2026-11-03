import { createRoot } from 'react-dom/client';
import '@fontsource/anton/400.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import { Hero } from './Hero';

// The home page is the hero alone: one screen, no scrolling. Download, Skills, Apps and Memory are linked from it.
createRoot(document.getElementById('root')!).render(<main id="top"><Hero /></main>);
