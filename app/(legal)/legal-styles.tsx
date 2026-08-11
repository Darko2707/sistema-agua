import Link from 'next/link';

const sections = {
  page: {
    minHeight: '100vh',
    background: '#F4EEE0',
    color: '#2F352E',
    padding: '40px 18px 56px',
    fontFamily: "var(--font-mulish), 'Mulish', sans-serif",
  },
  shell: {
    width: '100%',
    maxWidth: 820,
    margin: '0 auto',
    background: '#fff',
    border: '1px solid #E8DDC8',
    borderRadius: 8,
    padding: '30px clamp(18px, 5vw, 44px)',
    boxShadow: '0 14px 36px rgba(82, 67, 36, .10)',
  },
  title: {
    margin: 0,
    color: '#15493A',
    fontSize: 'clamp(28px, 5vw, 42px)',
    lineHeight: 1.05,
    fontWeight: 800,
    fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif",
  },
  subtitle: {
    marginTop: 10,
    color: '#786F5B',
    fontSize: 14,
    lineHeight: 1.6,
  },
  topNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap' as const,
    marginBottom: 20,
  },
  h2: {
    marginTop: 28,
    marginBottom: 8,
    color: '#15493A',
    fontSize: 19,
    fontWeight: 800,
  },
  p: {
    margin: '8px 0',
    lineHeight: 1.7,
    fontSize: 15,
  },
  list: {
    margin: '8px 0 0 20px',
    padding: 0,
    lineHeight: 1.7,
    fontSize: 15,
  },
  nav: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap' as const,
    marginTop: 28,
    paddingTop: 20,
    borderTop: '1px solid #EFE6D4',
  },
  link: {
    color: '#0F5F47',
    fontWeight: 800,
    textDecoration: 'none',
  },
  loginLink: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 40,
    padding: '8px 14px',
    border: '1px solid #D8C8A9',
    borderRadius: 999,
    background: '#F8F3E8',
    color: '#15493A',
    fontWeight: 800,
    textDecoration: 'none',
  },
};

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div style={sections.page}>
      <article style={sections.shell}>
        <nav aria-label="Acceso principal" style={sections.topNav}>
          <Link href="/" style={sections.link}>SIS4S</Link>
          <Link href="/login" style={sections.loginLink}>
            ← Volver al inicio de sesión
          </Link>
        </nav>
        <h1 style={sections.title}>{title}</h1>
        <p style={sections.subtitle}>Última actualización: {updated}</p>
        {children}
        <nav aria-label="Documentos legales y acceso" style={sections.nav}>
          <Link href="/privacidad" style={sections.link}>Privacidad</Link>
          <Link href="/cookies" style={sections.link}>Cookies</Link>
          <Link href="/terminos" style={sections.link}>Términos y condiciones</Link>
          <Link href="/login" style={sections.link}>Iniciar sesión</Link>
        </nav>
      </article>
    </div>
  );
}

export const legalStyles = sections;
