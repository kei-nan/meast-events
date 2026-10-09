import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted web fonts: Inter as one variable font (all weights) and Spectral 600,
// from the fontsource npm packages, subset to the characters the site shows by
// scripts/subset-fonts.mjs (run before every dev start and build; the alias is in
// vite.config.js). Vite copies the files into dist/assets with hashed names.
import '@subset-fonts/fonts.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
