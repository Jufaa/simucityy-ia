import { useRef, useState, type CSSProperties } from 'react';
import type { CityResponse } from './city-types';
import { createRealCity } from './real-city-model';
import {
  elementsFromGeoJson,
  fetchOsmSource,
  searchPlaces,
  sourceFromPlan,
  type ParsedPlan,
  type PlaceResult,
} from './real-city-import';
import { bboxAroundCenter, type LatLon } from './map-projection';
import {
  MAX_ZONE_SIDE_IN_METERS,
  MIN_ZONE_SIDE_IN_METERS,
  ZonePicker,
  type ZoneSelection,
} from './zone-picker';

const primaryButtonStyle: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  border: 'none',
  borderRadius: 10,
  background: '#24655e',
  color: '#fff',
  font: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
const secondaryButtonStyle: CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #b6c4c9',
  borderRadius: 9,
  background: '#fff',
  color: '#20353a',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};
const chipStyle: CSSProperties = {
  ...secondaryButtonStyle,
  padding: '5px 9px',
  fontSize: 12,
  marginRight: 4,
  marginBottom: 4,
};

const PRESETS: { label: string; center: LatLon }[] = [
  { label: 'Eixample, Barcelona', center: { lat: 41.3955, lon: 2.164 } },
  { label: 'Gràcia, Barcelona', center: { lat: 41.402, lon: 2.1565 } },
  { label: 'Centro, Madrid', center: { lat: 40.4168, lon: -3.7038 } },
  { label: 'Ciutat Vella, València', center: { lat: 39.4699, lon: -0.3763 } },
];

/**
 * Lets a visitor choose a real zone on a map (search or presets), or upload
 * a GeoJSON plan and crop it on the same map, then converts the selected
 * square into a simulable city with the local real-city converter.
 */
export function RealCityImporter(props: {
  onImported(city: CityResponse): void;
}) {
  const [tab, setTab] = useState<'search' | 'plan'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [placeName, setPlaceName] = useState(PRESETS[0]!.label);
  const [viewCenter, setViewCenter] = useState<LatLon>(PRESETS[0]!.center);
  const [selection, setSelection] = useState<ZoneSelection>({
    center: PRESETS[0]!.center,
    sideInMeters: 1000,
  });
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [useRealDem, setUseRealDem] = useState(true);
  const [stage, setStage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);

  const goTo = (center: LatLon, name: string) => {
    setViewCenter(center);
    setSelection((current) => ({ ...current, center }));
    setPlaceName(name);
  };

  const runSearch = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchPlaces(query.trim());
      setResults(found);
      if (!found.length) setSearchError('Sin resultados para esa búsqueda.');
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : 'La búsqueda falló.',
      );
    } finally {
      setSearching(false);
    }
  };

  const onPlanFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error('El plano supera los 10 MB.');
      const parsed = elementsFromGeoJson(JSON.parse(await file.text()));
      setPlan(parsed);
      setPlanName(file.name.replace(/\.(geo)?json$/i, ''));
      const centre = {
        lat: (parsed.bounds.south + parsed.bounds.north) / 2,
        lon: (parsed.bounds.west + parsed.bounds.east) / 2,
      };
      setViewCenter(centre);
      setSelection((current) => ({ ...current, center: centre }));
      setStage(
        `Plano cargado: ${parsed.elements.length} elementos (${parsed.skippedCount} omitidos). Arrastrá el cuadrado para recortar la zona.`,
      );
    } catch (error) {
      setPlan(null);
      setImportError(
        error instanceof Error ? error.message : 'No se pudo leer el plano.',
      );
    }
  };

  const runImport = async () => {
    if (busy) return;
    const request = ++requestRef.current;
    setBusy(true);
    setImportError(null);
    try {
      const bbox = bboxAroundCenter(selection.center, selection.sideInMeters);
      const source =
        tab === 'plan'
          ? await sourceFromPlan(
              plan!,
              bbox,
              planName || 'Plano subido',
              useRealDem,
              setStage,
            )
          : await fetchOsmSource(bbox, placeName || 'Zona elegida', setStage);
      if (request !== requestRef.current) return;
      setStage('Convirtiendo a ciudad simulable…');
      const { city } = createRealCity(source);
      if (request !== requestRef.current) return;
      props.onImported(city);
      setStage(
        `Zona lista: ${city.buildings.length} edificios, ${city.roads.length} tramos, ${city.citizens?.length ?? 0} personas sintéticas. La simulación ya corre sobre esta zona.`,
      );
    } catch (error) {
      if (request !== requestRef.current) return;
      setImportError(
        error instanceof Error ? error.message : 'No se pudo importar la zona.',
      );
      setStage(null);
    } finally {
      if (request === requestRef.current) setBusy(false);
    }
  };

  return (
    <section aria-label="Importar zona real" style={{ margin: '4px 0' }}>
      <p style={{ fontSize: 12, marginTop: 0 }}>
        Buscá una ciudad o barrio, o subí tu plano GeoJSON. Arrastrá el cuadrado
        sobre el mapa para elegir la zona (250–1500 m por lado) y cargala en la
        simulación. Datos gratuitos: © OpenStreetMap (ODbL) y DEM Terrarium.
      </p>
      <div
        role="group"
        aria-label="Fuente de la zona"
        style={{ display: 'flex', marginBottom: 8 }}
      >
        {(
          [
            ['search', 'Buscar ciudad/barrio'],
            ['plan', 'Subir plano'],
          ] as const
        ).map(([value, label], index) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            style={{
              ...secondaryButtonStyle,
              flex: 1,
              borderRadius: index === 0 ? '9px 0 0 9px' : '0 9px 9px 0',
              background: tab === value ? '#24655e' : '#fff',
              color: tab === value ? '#fff' : '#20353a',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'search' ? (
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              aria-label="Ciudad o barrio a buscar"
              placeholder="Ej.: Gracia, Barcelona"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch();
              }}
              style={{ flex: '1 1 140px' }}
            />
            <button
              type="button"
              style={secondaryButtonStyle}
              disabled={searching}
              onClick={() => void runSearch()}
            >
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {searchError && (
            <p role="alert" style={{ fontSize: 12 }}>
              {searchError}
            </p>
          )}
          {results.length > 0 && (
            <div style={{ margin: '6px 0', display: 'grid', gap: 4 }}>
              {results.map((result) => (
                <button
                  key={`${result.lat},${result.lon},${result.displayName}`}
                  type="button"
                  style={{
                    ...secondaryButtonStyle,
                    textAlign: 'left',
                    fontWeight: 500,
                    fontSize: 12,
                  }}
                  onClick={() =>
                    goTo(
                      { lat: result.lat, lon: result.lon },
                      result.displayName.split(',').slice(0, 2).join(','),
                    )
                  }
                >
                  {result.displayName}
                </button>
              ))}
            </div>
          )}
          <p style={{ fontSize: 12, margin: '6px 0' }}>
            Ciudades ofrecidas:{' '}
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                style={chipStyle}
                onClick={() => goTo(preset.center, preset.label)}
              >
                {preset.label}
              </button>
            ))}
          </p>
        </div>
      ) : (
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>
            Plano GeoJSON (WGS84){' '}
            <input
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={(event) => void onPlanFile(event.target.files?.[0])}
            />
          </label>
          {plan && (
            <p style={{ fontSize: 12 }}>
              {planName}: {plan.elements.length} elementos listos. El plano se
              dibuja en verde sobre el mapa.
            </p>
          )}
          <label style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            <input
              type="checkbox"
              checked={useRealDem}
              onChange={(event) => setUseRealDem(event.target.checked)}
            />{' '}
            Usar relieve real (DEM) bajo el plano; si no, terreno plano a cota 0
          </label>
          <details style={{ fontSize: 12, marginTop: 4 }}>
            <summary>¿Cómo debe ser el plano?</summary>
            <p>
              GeoJSON en coordenadas lon/lat (WGS84). Polígonos = edificios o
              parques; líneas = calles. Propiedades aceptadas: <code>kind</code>
              : <code>building</code>/<code>road</code>/<code>park</code> (o
              etiquetas OSM <code>building</code>, <code>highway</code>,{' '}
              <code>leisure</code>), altura con <code>levels</code>,{' '}
              <code>building:levels</code> o <code>height</code>. Las calles que
              se cruzan deben compartir un punto extremo para quedar conectadas
              en el grafo de evacuación. Un DXF/PDF en coordenadas locales
              primero hay que georreferenciarlo (p. ej. en QGIS) y exportarlo a
              GeoJSON.
            </p>
          </details>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <ZonePicker
          viewCenter={viewCenter}
          onViewCenterChange={setViewCenter}
          selection={selection}
          onSelectionChange={setSelection}
          {...(tab === 'plan' && plan ? { planElements: plan.elements } : {})}
        />
      </div>
      <label style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
        Tamaño de la zona: {Math.round(selection.sideInMeters)} m por lado{' '}
        <input
          type="range"
          min={MIN_ZONE_SIDE_IN_METERS}
          max={MAX_ZONE_SIDE_IN_METERS}
          step={50}
          value={selection.sideInMeters}
          onChange={(event) =>
            setSelection((current) => ({
              ...current,
              sideInMeters: Number(event.target.value),
            }))
          }
          style={{ width: '100%' }}
        />
      </label>
      <button
        type="button"
        disabled={busy || (tab === 'plan' && !plan)}
        onClick={() => void runImport()}
        style={{
          ...primaryButtonStyle,
          marginTop: 8,
          position: 'sticky',
          bottom: 8,
          boxShadow: '0 4px 14px #193c4340',
          opacity: busy || (tab === 'plan' && !plan) ? 0.55 : 1,
          cursor: busy || (tab === 'plan' && !plan) ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Importando…' : 'Representar esta zona en la simulación'}
      </button>
      {stage && (
        <p role="status" style={{ fontSize: 12 }}>
          {stage}
        </p>
      )}
      {importError && (
        <p role="alert" style={{ fontSize: 12 }}>
          {importError}
        </p>
      )}
    </section>
  );
}
