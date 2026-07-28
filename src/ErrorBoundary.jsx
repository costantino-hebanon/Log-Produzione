import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', padding:'24px', textAlign:'center', gap:'16px' }}>
        <p style={{ fontSize:'2.5rem' }}>💥</p>
        <p style={{ fontWeight:'bold', fontSize:'1.125rem', color:'#1f2937', margin:0 }}>Qualcosa è andato storto.</p>
        <p style={{ fontSize:'0.875rem', color:'#6b7280', margin:0 }}>{this.state.error?.message}</p>
        <button onClick={() => window.location.reload()}
          style={{ padding:'0.5rem 1.25rem', background:'#2563eb', color:'white', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'0.875rem' }}>
          Ricarica pagina
        </button>
      </div>
    );
    return this.props.children;
  }
}
