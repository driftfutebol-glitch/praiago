import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { markOtaBundleReady } from './lib/ota'

markOtaBundleReady()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary appName="PraiaGo Ambulante" homePath="/">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
