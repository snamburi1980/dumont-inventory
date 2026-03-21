import { Component } from 'react'

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
    // Log to console for debugging
    console.error('App Error:', error, errorInfo)
    // Could log to Firebase here too
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'center',
          minHeight:'100vh', background:'#FDF6EC', padding:20
        }}>
          <div style={{ textAlign:'center', maxWidth:400 }}>
            <div style={{ fontSize:48, marginBottom:16 }}>!</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#2C1810', marginBottom:8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize:13, color:'#8B7355', marginBottom:24 }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button
                onClick={() => this.setState({ hasError:false, error:null, errorInfo:null })}
                style={{ background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13 }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ background:'#8B7355', color:'#fff', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13 }}
              >
                Reload App
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details style={{ marginTop:20, textAlign:'left', fontSize:11, color:'#aaa' }}>
                <summary style={{ cursor:'pointer', marginBottom:8 }}>Error Details (Dev Only)</summary>
                <pre style={{ overflow:'auto', maxHeight:200, background:'#f5f5f5', padding:10, borderRadius:6 }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
