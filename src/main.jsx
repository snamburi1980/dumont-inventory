import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './styles/global.css'
import App from './App'
import OfflineBanner from './components/OfflineBanner'
import { ConfirmHost } from './components/ConfirmDialog'
import UpdatePrompt from './components/UpdatePrompt'

Sentry.init({
  dsn: 'https://4ec55a8eb23a22f5ee08daccd6e24018@o4511152029827072.ingest.us.sentry.io/4511152039395328',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.5,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Global so it shows on the login screen too — signing in needs a network */}
    <OfflineBanner />
    <App />
    <ConfirmHost />
    <UpdatePrompt />
  </StrictMode>
)