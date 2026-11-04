import type { CityResponse } from './city-types';
import { RealCityImporter } from './real-city-importer';
import {
  LanguageToggle,
  pick,
  useLanguage,
  type AppLanguage,
} from './language';

/**
 * Standalone full-screen step for choosing a real zone. It renders only
 * the importer: no synthetic city is requested, generated or drawn until
 * the visitor imports a zone and enters the simulation.
 */
export function RealCityImportScreen(props: {
  onImported(city: CityResponse): void;
  onBack(): void;
  onLanguageChange?(language: AppLanguage): void;
}) {
  const language = useLanguage();
  return (
    <main
      aria-label={pick(language, 'Choose a real zone', 'Elegir una zona real')}
      style={{
        width: '100vw',
        height: '100vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '28px 20px 40px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#e9f2f0',
        background:
          'radial-gradient(1000px 500px at 15% -10%, rgba(20,184,166,0.22), transparent 60%),' +
          'radial-gradient(900px 480px at 90% 110%, rgba(59,130,246,0.18), transparent 60%),' +
          'linear-gradient(rgba(233,242,240,0.045) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(233,242,240,0.045) 1px, transparent 1px),' +
          'linear-gradient(160deg, #0a141a 0%, #0d2027 55%, #081118 100%)',
        backgroundSize: 'auto, auto, 44px 44px, 44px 44px, auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1040, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <div style={{ maxWidth: 680 }}>
            <p
              style={{
                margin: '0 0 10px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.34em',
                textTransform: 'uppercase',
                color: '#2dd4bf',
              }}
            >
              {pick(language, 'A specific city', 'Ciudad en específico')}
            </p>
            <h1
              style={{
                margin: '0 0 10px',
                color: '#fff',
                fontSize: 'clamp(32px, 5vw, 48px)',
                fontWeight: 750,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
              }}
            >
              {pick(language, 'Choose a real zone', 'Elegí una zona real')}
            </h1>
            <p
              style={{
                margin: 0,
                color: 'rgba(233,242,240,0.72)',
                fontSize: 15,
                lineHeight: 1.6,
              }}
            >
              {pick(
                language,
                'Search a city or neighborhood, move the 1000 m square on the map or upload a GeoJSON plan. The simulation city is only created when you render the zone.',
                'Buscá una ciudad o barrio, mové el cuadrado de 1000 m sobre el mapa o subí un plano GeoJSON. Recién al representar la zona se crea la ciudad de la simulación.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onBack}
            style={{
              padding: '11px 16px',
              borderRadius: 10,
              border: '1px solid rgba(233,242,240,0.28)',
              background: 'rgba(233,242,240,0.06)',
              color: '#e9f2f0',
              font: '600 12px/1 system-ui, sans-serif',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {pick(language, 'Back to options', 'Volver a las opciones')}
          </button>
          {props.onLanguageChange && (
            <LanguageToggle
              language={language}
              onChange={props.onLanguageChange}
            />
          )}
        </div>
        <section
          aria-label={pick(
            language,
            'Map and import options',
            'Mapa y opciones de importación',
          )}
          style={{
            background: 'rgba(255,255,255,0.97)',
            color: '#17252a',
            borderRadius: 20,
            padding: '22px 22px 18px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}
        >
          <RealCityImporter onImported={props.onImported} />
        </section>
      </div>
    </main>
  );
}
