'use client';

import { useEffect, useRef } from 'react';

type Pt = { label: string; coord: [number, number] }; // [lon, lat]
type Props = {
  points: Pt[];
  lines?: any[]; // GeoJSON LineString[]
};

export default function LeafletMap({ points, lines = [] }: Props) {
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (typeof window === 'undefined' || !divRef.current) return;

      // Carrega Leaflet e CSS apenas no cliente (corrige "window is not defined" e HMR de CSS)
      if (!LRef.current) {
        const leaflet = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        LRef.current = leaflet.default ?? leaflet;
      }
      const L = LRef.current;

      // Cria o mapa uma única vez
      if (!mapRef.current) {
        mapRef.current = L.map(divRef.current).setView([-23.55, -46.63], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
        }).addTo(mapRef.current);
      }

      const m = mapRef.current;

      // Grupo temporário para esta renderização
      const layer = L.layerGroup().addTo(m);

      // Marcadores (lon,lat -> lat,lon)
      const bounds: [number, number][] = [];
      (points || []).forEach((p, i) => {
        const [lon, lat] = p.coord;
        const mk = L.marker([lat, lon]).addTo(layer);
        mk.bindPopup(`${i === 0 ? 'Origem' : `Parada ${i}`}: ${p.label}`);
        bounds.push([lat, lon]);
      });

      // Linhas (GeoJSON LineString)
      (lines || []).forEach((g: any) => {
        if (g?.type === 'LineString' && Array.isArray(g.coordinates)) {
          const latlngs = g.coordinates.map((c: [number, number]) => [c[1], c[0]]);
          L.polyline(latlngs, { weight: 4 }).addTo(layer);
          latlngs.forEach((ll: [number, number]) => bounds.push(ll));
        }
      });

      // Ajusta enquadramento
      if (bounds.length) {
        try {
          m.fitBounds(L.latLngBounds(bounds), { padding: [20, 20] });
        } catch {}
      }

      // Limpa camadas ao atualizar/desmontar
      return () => {
        if (!cancelled) m.removeLayer(layer);
      };
    })();

    return () => {
      cancelled = true;
    };
    // Recalcula quando mudam pontos/linhas
  }, [JSON.stringify(points), JSON.stringify(lines)]);

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />;
}
