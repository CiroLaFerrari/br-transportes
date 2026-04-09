'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Stop = { order: number; destination: string };
type Rota = { id: string; origin: string; stops: Stop[] };
type Pt = { label: string; coord: [number, number] };

const GoogleMap = dynamic(() => import('@/components/GoogleMap'), { ssr: false });

export default function RotaMapaPage() {
  const { id } = useParams<{ id: string }>();
  const [rota, setRota] = useState<Rota | null>(null);
  const [pts, setPts] = useState<Pt[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    (async () => {
      setErro(null);
      setCarregando(true);
      const r = await fetch(`/api/rotas/${id}`, { cache: 'no-store' });
      setCarregando(false);
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: 'Erro ao carregar' }));
        setErro(e.error || 'Erro ao carregar');
        return;
      }
      const data = await r.json();
      setRota(data);
    })();
  }, [id]);

  async function geocode() {
    if (!rota) return;
    setErro(null);
    setCarregando(true);
    const places = [rota.origin, ...rota.stops.map((s) => s.destination)];
    const r = await fetch('/api/maps/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ places }),
    });
    setCarregando(false);
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: 'Erro ao geocodificar' }));
      setErro(e.error || 'Erro ao geocodificar');
      return;
    }
    const j = await r.json();
    const points: Pt[] = j.points.map((p: { lon: number; lat: number }, idx: number) => ({
      label: places[idx],
      coord: [p.lon, p.lat],
    }));
    setPts(points);
  }

  useEffect(() => {
    if (rota) geocode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rota]);

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Mapa da Rota</h1>
      {erro && <div className="text-red-600 text-sm">{erro}</div>}
      {carregando && <div className="text-sm">Carregando...</div>}
      {rota && (
        <div className="text-sm">
          Origem: <b>{rota.origin}</b> — Paradas: {rota.stops.length}
        </div>
      )}
      {pts && <GoogleMap points={pts} />}
      {!pts && !carregando && <div className="text-sm text-gray-500">Preparando mapa…</div>}
    </main>
  );
}
