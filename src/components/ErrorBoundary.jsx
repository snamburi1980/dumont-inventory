import { Component } from 'react'
import * as Sentry from '@sentry/react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('App Error:', error, errorInfo)
    // Report to Sentry so crashes in the field are visible without the user reporting them
    try {
      Sentry.captureException(error, { extra: { componentStack: errorInfo?.componentStack } })
    } catch (_) {}
  }

  render() {
    if (this.state.hasError) {
      // NOTE: must not reference `process.env` here — Vite does not define `process`
      // in the browser, and a ReferenceError inside this fallback turns a recoverable
      // error into a permanent white screen.
      const isDev = import.meta.env?.DEV
      return (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'center',
          minHeight:'100vh', background:'#F6F4ED', padding:20
        }}>
          <div style={{ textAlign:'center', maxWidth:400 }}>
            <div style={{ fontSize:44, marginBottom:12 }}>🍦</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#1A4C48', marginBottom:8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize:13, color:'#6B7F78', marginBottom:22, lineHeight:1.6 }}>
              Your saved data is safe. Try again, or reload the app.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              <button
                onClick={() => this.setState({ hasError:false, error:null, errorInfo:null })}
                style={{ background:'#1A4C48', color:'#fff', border:'none', borderRadius:8, padding:'12px 22px', cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:'inherit' }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ background:'#fff', color:'#1A4C48', border:'1px solid #E3DDD0', borderRadius:8, padding:'12px 22px', cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:'inherit' }}
              >
                Reload App
              </button>
            </div>
            <details style={{ marginTop:22, textAlign:'left', fontSize:11, color:'#aaa' }}>
              <summary style={{ cursor:'pointer', marginBottom:8 }}>Technical details</summary>
              <pre style={{ overflow:'auto', maxHeight:200, background:'#f5f5f5', padding:10, borderRadius:6, whiteSpace:'pre-wrap' }}>
                {String(this.state.error?.message || this.state.error || 'Unknown error')}
                {isDev && this.state.errorInfo ? '\n\n' + this.state.errorInfo.componentStack : ''}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
