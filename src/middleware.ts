export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    /*
     * Protege todas as rotas exceto:
     * - /login (pagina de login)
     * - /api/auth (endpoints do NextAuth)
     * - /_next (assets do Next.js)
     * - /favicon.ico, /file.svg, etc (arquivos estaticos)
     */
    '/((?!login|api/auth|_next|favicon.ico|.*\\.svg|.*\\.png|.*\\.ico).*)',
  ],
};
