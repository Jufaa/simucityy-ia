import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CityResponse } from './city-types';
import { createRealCity } from './real-city-model';
import {
  deleteSavedZone,
  getSavedZone,
  listSavedZones,
  saveSavedZone,
  type SavedZoneSummary,
} from './saved-zones';
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
  ZONE_SIDE_IN_METERS,
  ZonePicker,
  type ZoneSelection,
} from './zone-picker';
import { LoadingScreen } from './loading-screen';

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
  initialTab?: 'search' | 'plan';
}) {
  const [tab, setTab] = useState<'search' | 'plan'>(
    props.initialTab ?? 'search',
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [placeName, setPlaceName] = useState(PRESETS[0]!.label);
  const [viewCenter, setViewCenter] = useState<LatLon>(PRESETS[0]!.center);
  const [selection, setSelection] = useState<ZoneSelection>({
    center: PRESETS[0]!.center,
    sideInMeters: ZONE_SIDE_IN_METERS,
  });
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [useRealDem, setUseRealDem] = useState(true);
  const [infill, setInfill] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedZones, setSavedZones] = useState<SavedZoneSummary[]>([]);
  const [planFileName, setPlanFileName] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refreshSavedZones = async () => {
    try {
      setSavedZones(await listSavedZones());
    } catch {
      // Local storage is a convenience; failing to read it must not block imports.
    }
  };
  useEffect(() => {
    void refreshSavedZones();
  }, []);

  const loadSavedZone = async (summary: SavedZoneSummary) => {
    if (busy) return;
    setBusy(true);
    setImportError(null);
    try {
      const saved = await getSavedZone(summary.id);
      if (!saved) throw new Error('La zona guardada ya no está disponible.');
      setStage(`Cargando «${saved.name}» guardada…`);
      const { city } = createRealCity(saved.source, {
        infillSyntheticHouses: saved.infillSyntheticHouses,
      });
      props.onImported(city);
      setStage(
        `Zona guardada lista: ${city.buildings.length} edificios, ${city.roads.length} tramos. La simulación ya corre sobre esta zona.`,
      );
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar la zona guardada.',
      );
    } finally {
      setBusy(false);
    }
  };

  const removeSavedZone = async (id: string) => {
    try {
      await deleteSavedZone(id);
      await refreshSavedZones();
    } catch {
      // Deleting is best-effort; the list refresh below reflects reality.
      void refreshSavedZones();
    }
  };

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
    setPlanFileName(file.name);
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
      const bbox = bboxAroundCenter(selection.center, ZONE_SIDE_IN_METERS);
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
      const { city } = createRealCity(source, {
        infillSyntheticHouses: infill,
      });
      if (request !== requestRef.current) return;
      props.onImported(city);
      // Keep the zone in this browser for one-click access next time.
      void saveSavedZone({
        name:
          tab === 'plan'
            ? planName || 'Plano subido'
            : placeName || 'Zona elegida',
        kind: tab === 'plan' ? 'plan' : 'osm',
        buildingCount: city.buildings.length,
        roadCount: city.roads.length,
        infillSyntheticHouses: infill,
        source,
      })
        .then(refreshSavedZones)
        .catch(() => {});
      setStage(
        `Zona lista: ${city.buildings.length} edificios, ${city.roads.length} tramos, ${city.citizens?.length ?? 0} personas sintéticas. La simulación ya corre sobre esta zona.` +
          (city.real && city.real.syntheticBuildings > 0
            ? ` Incluye ${city.real.syntheticBuildings} casas sintéticas de relleno (no son datos reales).`
            : '') +
          (city.buildings.length < 150
            ? ' Ojo: la fuente trae pocos edificios cargados para esta zona (la cobertura de OpenStreetMap varía mucho por ciudad); se representa lo que existe en los datos. Podés agrandar el cuadrado o activar el relleno sintético.'
            : '') +
          ' Quedó guardada en este navegador para acceso rápido.',
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
      {busy && <LoadingScreen message={stage ?? 'Importando la zona…'} />}
      <p style={{ fontSize: 12, marginTop: 0 }}>
        Buscá una ciudad o barrio, o subí tu plano GeoJSON. Arrastrá el cuadrado
        sobre el mapa para elegir dónde va la zona fija (1000 m por lado) y
        cargala en la simulación. Datos gratuitos: © OpenStreetMap (ODbL) y DEM
        Terrarium.
      </p>
      <div style={{ marginBottom: 10 }}>
        <strong style={{ fontSize: 12 }}>Zonas guardadas</strong>
        {savedZones.length === 0 ? (
          <p style={{ fontSize: 12, margin: '2px 0', color: '#425466' }}>
            Todavía no guardaste ninguna. Al importar una zona queda acá, en
            este navegador, para cargarla en un clic sin volver a subir ni
            descargar nada.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
            {savedZones.map((zone) => (
              <div
                key={zone.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid #d3dfdf',
                  borderRadius: 9,
                  padding: '5px 8px',
                  background: '#fff',
                }}
              >
                <span style={{ flex: 1, fontSize: 12 }}>
                  <strong>{zone.name}</strong>{' '}
                  <span style={{ color: '#60787a' }}>
                    {zone.kind === 'plan' ? 'Plano' : 'OSM'} ·{' '}
                    {zone.buildingCount} edificios ·{' '}
                    {new Date(zone.savedAt).toLocaleDateString('es')}
                  </span>
                </span>
                <button
                  type="button"
                  style={{
                    ...secondaryButtonStyle,
                    padding: '5px 9px',
                    fontSize: 12,
                  }}
                  disabled={busy}
                  onClick={() => void loadSavedZone(zone)}
                >
                  Cargar
                </button>
                <button
                  type="button"
                  aria-label={`Borrar ${zone.name}`}
                  style={{
                    ...secondaryButtonStyle,
                    padding: '5px 8px',
                    fontSize: 12,
                  }}
                  onClick={() => void removeSavedZone(zone.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
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
          <div>
            <label
              style={{
                ...primaryButtonStyle,
                display: 'block',
                width: 'auto',
                textAlign: 'center',
                padding: '10px 14px',
                fontSize: 13,
              }}
            >
              Elegir plano GeoJSON…
              <input
                type="file"
                hidden
                accept=".geojson,.json,application/geo+json,application/json"
                onClick={(event) => {
                  event.currentTarget.value = '';
                }}
                onChange={(event) => void onPlanFile(event.target.files?.[0])}
              />
            </label>
            <p style={{ fontSize: 12, margin: '4px 0', color: '#425466' }}>
              {planFileName
                ? `Archivo: ${planFileName}`
                : 'Ningún archivo elegido todavía (GeoJSON en WGS84, hasta 10 MB).'}
            </p>
          </div>
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
      <p style={{ fontSize: 12, marginTop: 6 }}>
        Zona fija: {ZONE_SIDE_IN_METERS} m por lado. Arrastrá el cuadrado para
        elegir dónde ubicarla; el tamaño no cambia.
      </p>
      <label style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
        <input
          type="checkbox"
          checked={infill}
          onChange={(event) => setInfill(event.target.checked)}
        />{' '}
        Completar huecos con casas sintéticas donde la fuente no tiene edificios
        (relleno visual estimado, no datos reales)
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
