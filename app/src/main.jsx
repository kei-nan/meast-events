import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted web fonts (npm packages; Vite copies the files into dist/assets).
// Only what the CSS uses: Inter as one variable font (all weights), Spectral 600.
import '@fontsource-variable/inter/wght.css'
import '@fontsource/spectral/600.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
