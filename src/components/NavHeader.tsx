'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/coletas', label: 'Coletas' },
  { href: '/patio', label: 'Patio' },
  { href: '/minutas', label: 'Minutas' },
  { href: '/planejamento', label: 'Planejamento' },
  { href: '/rotas', label: 'Rotas' },
  { href: '/entregas', label: 'Entregas' },
  { href: '/operacao', label: 'Operacao' },
  { href: '/scan', label: 'Scan' },
  { href: '/etiquetas', label: 'Etiquetas' },
  { href: '/relatorios', label: 'Relatorios' },
];

const cadLinks = [
  { href: '/clientes', label: 'Clientes' },
  { href: '/produtos', label: 'Produtos' },
  { href: '/veiculos', label: 'Veiculos' },
  { href: '/motoristas', label: 'Motoristas' },
];

export default function NavHeader() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header style={{
      background: 'linear-gradient(96.87deg, #1A4A1A 0%, #222222 100%)',
      borderBottom: '3px solid #F5BE16',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: '#F5BE16', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 16, color: '#1A4A1A',
          }}>
            BR
          </div>
          <div>
            <div style={{ color: '#F5BE16', fontWeight: 900, fontSize: 15, letterSpacing: 0.5, lineHeight: 1.1 }}>
              BR Transportes
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 500 }}>
              Planejamento &amp; Operacao
            </div>
          </div>
        </Link>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                color: isActive(l.href) ? '#F5BE16' : 'rgba(255,255,255,0.85)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: isActive(l.href) ? 700 : 500,
                padding: '6px 10px',
                borderRadius: 6,
                background: isActive(l.href) ? 'rgba(245,190,22,0.15)' : 'transparent',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,190,22,0.15)'; e.currentTarget.style.color = '#F5BE16'; }}
              onMouseLeave={(e) => {
                const active = isActive(l.href);
                e.currentTarget.style.background = active ? 'rgba(245,190,22,0.15)' : 'transparent';
                e.currentTarget.style.color = active ? '#F5BE16' : 'rgba(255,255,255,0.85)';
              }}
            >
              {l.label}
            </Link>
          ))}
          <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4px', fontSize: 16 }}>|</span>
          {cadLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                color: isActive(l.href) ? '#F5BE16' : 'rgba(245,190,22,0.8)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: isActive(l.href) ? 700 : 500,
                padding: '6px 10px',
                borderRadius: 6,
                background: isActive(l.href) ? 'rgba(245,190,22,0.15)' : 'transparent',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,190,22,0.15)'; e.currentTarget.style.color = '#F5BE16'; }}
              onMouseLeave={(e) => {
                const active = isActive(l.href);
                e.currentTarget.style.background = active ? 'rgba(245,190,22,0.15)' : 'transparent';
                e.currentTarget.style.color = active ? '#F5BE16' : 'rgba(245,190,22,0.8)';
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
