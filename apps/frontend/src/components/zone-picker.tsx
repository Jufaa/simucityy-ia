import { useEffect, useRef, useState } from 'react';
import {
  latLonToWorldPixels,
  metersPerPixel,
  worldPixelsToLatLon,
  type LatLon,
} from './map-projection';
import type { OsmElementInput } from './real-city-model';
import { pick, useLanguage } from './language';

export interface ZoneSelection {
  center: LatLon;
  sideInMeters: number;
}

/** Fixed plane size: every imported zone is exactly this square. */
export const ZONE_SIDE_IN_METERS = 1000;

function zoomForSide(
  lat: number,
  sideInMeters: number,
  pixels: number,
): number {
  const needed = sideInMeters / Math.max(80, pixels);
  const zoom = Math.round(
    Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / needed),
  );
  return Math.max(12, Math.min(18, zoom));
}

/**
 * OSM tile map with a draggable fixed-size square selection. The square is
 * always ZONE_SIDE_IN_METERS per side: the user only chooses where it sits,
 * never its size, so every generated city uses the full plane exactly.
 */
export function ZonePicker(props: {
  viewCenter: LatLon;
  onViewCenterChange(center: LatLon): void;
  selection: ZoneSelection;
  onSelectionChange(selection: ZoneSelection): void;
  planElements?: OsmElementInput[];
}) {
  const language = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 320 });
  const [zoom, setZoom] = useState(() =>
    zoomForSide(props.selection.center.lat, ZONE_SIDE_IN_METERS, 220),
  );
  const dragRef = useRef<{
    mode: 'pan' | 'move';
    startX: number;
    startY: number;
    startView: { x: number; y: number };
    startSelection: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: container.clientWidth, height: container.clientHeight });
    });
    observer.observe(container);
    setSize({ width: container.clientWidth, height: container.clientHeight });
    return () => observer.disconnect();
  }, []);

  const viewWorld = latLonToWorldPixels(props.viewCenter, zoom);
  const toScreen = (point: LatLon) => {
    const world = latLonToWorldPixels(point, zoom);
    return {
      x: world.x - viewWorld.x + size.width / 2,
      y: world.y - viewWorld.y + size.height / 2,
    };
  };
  const selectionScreen = toScreen(props.selection.center);
  const scale = metersPerPixel(props.selection.center.lat, zoom);
  const sidePixels = ZONE_SIDE_IN_METERS / scale;

  const tiles: { key: string; left: number; top: number; src: string }[] = [];
  if (size.width > 0) {
    const minTileX = Math.floor((viewWorld.x - size.width / 2) / 256);
    const maxTileX = Math.floor((viewWorld.x + size.width / 2) / 256);
    const minTileY = Math.floor((viewWorld.y - size.height / 2) / 256);
    const maxTileY = Math.floor((viewWorld.y + size.height / 2) / 256);
    const maxTile = 2 ** zoom - 1;
    for (let tileX = minTileX; tileX <= maxTileX; tileX++)
      for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
        if (tileX < 0 || tileY < 0 || tileX > maxTile || tileY > maxTile)
          continue;
        tiles.push({
          key: `${tileX},${tileY}`,
          left: tileX * 256 - viewWorld.x + size.width / 2,
          top: tileY * 256 - viewWorld.y + size.height / 2,
          src: `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`,
        });
      }
  }

  const planPaths = { filled: '', stroked: '' };
  if (props.planElements && size.width > 0) {
    for (const element of props.planElements) {
      if (element.type !== 'way') continue;
      const geometry = element.geometry ?? [];
      if (geometry.length < 2) continue;
      const path = geometry
        .map((point, index) => {
          const screen = toScreen(point);
          return `${index === 0 ? 'M' : 'L'}${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
        })
        .join('');
      if (element.tags?.highway) planPaths.stroked += path;
      else planPaths.filled += `${path}Z`;
    }
  }

  const beginDrag = (event: React.PointerEvent, mode: 'pan' | 'move') => {
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startView: { ...viewWorld },
      startSelection: latLonToWorldPixels(props.selection.center, zoom),
    };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === 'pan') {
      props.onViewCenterChange(
        worldPixelsToLatLon(
          { x: drag.startView.x - dx, y: drag.startView.y - dy },
          zoom,
        ),
      );
    } else if (drag.mode === 'move') {
      props.onSelectionChange({
        center: worldPixelsToLatLon(
          { x: drag.startSelection.x + dx, y: drag.startSelection.y + dy },
          zoom,
        ),
        sideInMeters: ZONE_SIDE_IN_METERS,
      });
    }
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={pick(
        language,
        'Map to choose the zone to render',
        'Mapa para elegir la zona a representar',
      )}
      style={{
        position: 'relative',
        height: 320,
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid #b6c4c9',
        background: '#dfe8ec',
        touchAction: 'none',
        cursor: 'grab',
        userSelect: 'none',
      }}
      onPointerDown={(event) => beginDrag(event, 'pan')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: tile.left,
            top: tile.top,
            width: 256,
            height: 256,
            pointerEvents: 'none',
          }}
        />
      ))}
      {props.planElements && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          <path d={planPaths.filled} fill="#2f6f4fc0" stroke="#245c40" />
          <path
            d={planPaths.stroked}
            fill="none"
            stroke="#333"
            strokeWidth={2}
          />
        </svg>
      )}
      <div
        aria-label={pick(
          language,
          'Selected zone: drag to move',
          'Zona seleccionada: arrastrar para mover',
        )}
        style={{
          position: 'absolute',
          left: selectionScreen.x - sidePixels / 2,
          top: selectionScreen.y - sidePixels / 2,
          width: sidePixels,
          height: sidePixels,
          border: '2px solid #0b6e63',
          background: '#0b6e6326',
          cursor: 'move',
          boxSizing: 'border-box',
        }}
        onPointerDown={(event) => beginDrag(event, 'move')}
      ></div>
      <div
        style={{
          position: 'absolute',
          right: 6,
          top: 6,
          display: 'flex',
          gap: 4,
        }}
      >
        <button
          type="button"
          aria-label={pick(language, 'Zoom in', 'Acercar mapa')}
          onClick={() => setZoom((z) => Math.min(18, z + 1))}
        >
          +
        </button>
        <button
          type="button"
          aria-label={pick(language, 'Zoom out', 'Alejar mapa')}
          onClick={() => setZoom((z) => Math.max(12, z - 1))}
        >
          −
        </button>
      </div>
      <small
        style={{
          position: 'absolute',
          right: 6,
          bottom: 4,
          background: '#ffffffc9',
          padding: '0 4px',
          borderRadius: 4,
          fontSize: 10,
          pointerEvents: 'none',
        }}
      >
        © OpenStreetMap contributors
      </small>
    </div>
  );
}
