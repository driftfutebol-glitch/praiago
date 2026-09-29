import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary appName="Painel admin" homePath="/">
      <MotionConfig reducedMotion="user"><App /></MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
