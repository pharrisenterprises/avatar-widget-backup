export default function Home() {
  return (
    <main style={{
      minHeight:'100vh', display:'grid', placeItems:'center',
      background:'#0b0b0b', color:'#fff', fontFamily:'ui-sans-serif,system-ui'
    }}>
      <div style={{ textAlign:'center' }}>
        <h1 style={{ fontSize:36, marginBottom:16 }}>Avatar Widget Tester</h1>
        <a href="/embed?autostart=1" style={{ color:'#4ea3ff' }}>
          Open /embed (autostart)
        </a>
      </div>
    </main>
  );
}
