export default function Home() {
  return (
    <main style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📚 BookOne v2</h1>
      <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '2rem' }}>
        Multi-tenant SaaS Accounting & ERP
      </p>
      <div style={{ 
        background: '#f5f5f5', 
        borderRadius: '8px', 
        padding: '1.5rem 2.5rem',
        maxWidth: '500px'
      }}>
        <p style={{ margin: '0.5rem 0' }}>🚀 Deployed via Portainer + Cloudflare Tunnel</p>
        <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#999' }}>
          Stack: Next.js 15 · TypeScript · PostgreSQL 16 · Drizzle ORM · shadcn/ui
        </p>
      </div>
    </main>
  );
}
