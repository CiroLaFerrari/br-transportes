'use client';

import { useEffect, useRef, useCallback } from 'react';

type Pt = { label: string; coord: [number, number] }; // [lon, lat]
type Props = {
  points: Pt[];
  lines?: any[]; // GeoJSON LineString[]
};

let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof window !== 'undefined' && (window as any).google?.maps) {
    return Promise.resolve();
  }

  loadPromise = new Promise((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    if (!key) {
      reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set'));
      loadPromise = null;
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export default function GoogleMap({ points, lines = [] }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);

  const clearOverlays = useCallback(() => {
    markersRef.current.forEach((m: any) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p: any) => p.setMap(null));
    polylinesRef.current = [];
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !divRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }

      if (cancelled || !divRef.current) return;

      const gmaps = (window as any).google.maps;

      // Create map once
      if (!mapRef.current) {
        mapRef.current = new gmaps.Map(divRef.current, {
          center: { lat: -23.55, lng: -46.63 },
          zoom: 5,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        });
      }

      const map = mapRef.current;
      clearOverlays();

      const bounds = new gmaps.LatLngBounds();
      let hasBounds = false;

      // Markers
      (points || []).forEach((p, i) => {
        const [lon, lat] = p.coord;
        const position = { lat, lng: lon };

        const isOrigin = i === 0;
        const marker = new gmaps.Marker({
          map,
          position,
          title: `${isOrigin ? 'Origem' : `Parada ${i}`}: ${p.label}`,
          label: isOrigin
            ? { text: 'A', color: '#fff', fontWeight: 'bold' }
            : { text: String(i), color: '#fff', fontWeight: 'bold' },
          icon: {
            path: gmaps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: isOrigin ? '#1A4A1A' : '#dc2626',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });

        const info = new gmaps.InfoWindow({
          content: `<div style="font-family:sans-serif;font-size:13px;"><b>${isOrigin ? 'Origem' : `Parada ${i}`}</b><br/>${p.label}</div>`,
        });
        marker.addListener('click', () => info.open(map, marker));

        markersRef.current.push(marker);
        bounds.extend(position);
        hasBounds = true;
      });

      // Polylines from GeoJSON LineStrings
      (lines || []).forEach((g: any) => {
        if (g?.type === 'LineString' && Array.isArray(g.coordinates)) {
          const path = g.coordinates.map((c: [number, number]) => ({
            lat: c[1],
            lng: c[0],
          }));

          const polyline = new gmaps.Polyline({
            map,
            path,
            strokeColor: '#1A4A1A',
            strokeOpacity: 0.85,
            strokeWeight: 4,
          });

          polylinesRef.current.push(polyline);
          path.forEach((pt: { lat: number; lng: number }) => {
            bounds.extend(pt);
            hasBounds = true;
          });
        }
      });

      if (hasBounds) {
        map.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30 });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points), JSON.stringify(lines), clearOverlays]);

  useEffect(() => {
    return () => { clearOverlays(); };
  }, [clearOverlays]);

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />;
}
