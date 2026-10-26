'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { AlertTriangle, Layers3, MapPin } from 'lucide-react';
import { getMapConfig } from '@/lib/map-config';
import { Badge } from '@/components/ui/badge';

export default function CityMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('Loading geographic basemap…');
  useEffect(() => {
    if (!container.current) return;
    let observer: ResizeObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const config = getMapConfig();
      const map = new maplibregl.Map({
        container: container.current,
        style: config.styleUrl,
        center: [config.longitude, config.latitude],
        zoom: 14.5,
        pitch: 50,
        bearing: -20,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: true }),
        'top-right',
      );
      map.addControl(
        new maplibregl.ScaleControl({ unit: 'metric' }),
        'bottom-left',
      );
      map.on('load', () => {
        // OpenFreeMap uses OpenMapTiles building attributes. Unknown heights render flat.
        if (
          map.getSource('openmaptiles') &&
          !map.getLayer('simulicity-buildings')
        ) {
          map.addLayer({
            id: 'simulicity-buildings',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 13,
            filter: [
              '>',
              ['coalesce', ['get', 'render_height'], ['get', 'height'], 0],
              0,
            ],
            paint: {
              'fill-extrusion-color': '#789aaa',
              'fill-extrusion-height': [
                'coalesce',
                ['get', 'render_height'],
                ['get', 'height'],
                0,
              ],
              'fill-extrusion-base': [
                'coalesce',
                ['get', 'render_min_height'],
                ['get', 'min_height'],
                0,
              ],
              'fill-extrusion-opacity': 0.75,
            },
          });
        }
        if (timeout) clearTimeout(timeout);
        setState('ready');
      });
      map.on('error', () => {
        setMessage(
          'Some map resources could not load. Check your connection or map style configuration.',
        );
        setState('error');
      });
      timeout = setTimeout(() => {
        if (!map.loaded()) {
          setMessage(
            'Map loading is taking longer than expected. Check network access to the tile provider.',
          );
          setState('error');
        }
      }, 20000);
      observer = new ResizeObserver(() => map.resize());
      observer.observe(container.current);
    } catch {
      setMessage(
        'Map unavailable. This browser needs WebGL, a valid map configuration, and access to the tile provider.',
      );
      setState('error');
    }
    return () => {
      observer?.disconnect();
      if (timeout) clearTimeout(timeout);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      className="relative h-full min-h-[420px] overflow-hidden bg-[#101c26]"
      aria-label="Interactive city map"
    >
      <div ref={container} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap gap-2">
        <Badge className="border-slate-600/60 bg-slate-950/90 text-slate-200">
          <Layers3 size={12} /> Geographic basemap
        </Badge>
        <Badge className="border-cyan-800 bg-slate-950/90 text-cyan-300">
          <MapPin size={12} /> Explore mode
        </Badge>
      </div>
      {state !== 'ready' && (
        <div
          className="absolute bottom-14 left-4 right-4 z-10 max-w-md rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-xs leading-relaxed text-slate-300"
          role="status"
        >
          {state === 'error' && (
            <AlertTriangle size={14} className="mr-2 inline text-amber-300" />
          )}
          {message}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-9 right-3 rounded bg-slate-950/85 px-2 py-1 text-[10px] text-slate-300">
        3D coverage and heights vary by source
      </div>
    </div>
  );
}
