// src/app/entregas/[id]/page.tsx
import { redirect } from 'next/navigation';

export default async function EntregaRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/rotas/${encodeURIComponent(id)}`);
}