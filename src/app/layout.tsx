import './globals.css';
import type { Metadata } from 'next';
import NavHeader from '@/components/NavHeader';
import SessionProvider from '@/components/SessionProvider';

export const metadata: Metadata = {
  title: 'BR Transportes',
  description: 'Sistema de planejamento e operação de entregas — BR Transportes e Logística',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#FAFAFA', color: '#383838', fontFamily: "'Roboto', Arial, sans-serif" }}>
        <SessionProvider>
          <NavHeader />

          {/* CONTENT */}
          <main style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 16px', minHeight: 'calc(100vh - 120px)' }}>
            {children}
          </main>

          {/* FOOTER */}
          <footer style={{
            background: '#1A4A1A',
            color: 'rgba(255,255,255,0.6)',
            textAlign: 'center',
            padding: '14px 16px',
            fontSize: 12,
            fontWeight: 500,
          }}>
            BR Transportes e Logistica — Sistema de Planejamento de Entregas
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
