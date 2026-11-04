import { useState, type CSSProperties } from 'react';
import { parseCitySeed } from './city-generation-controls';
import type { AiCityPlanResult } from './ai-city';
import {
  LanguageToggle,
  pick,
  useLanguage,
  type AppLanguage,
} from './language';

const accent = '#2dd4bf';
const ink = '#e9f2f0';

const primaryButton: CSSProperties = {
  padding: '12px 16px',
  borderRadius: 10,
  border: 0,
  background: `linear-gradient(135deg, #0f766e, #14b8a6)`,
  color: '#fff',
  font: '600 13px/1 system-ui, sans-serif',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  marginTop: 'auto',
  width: '100%',
};

const ghostButton: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid rgba(233,242,240,0.25)',
  background: 'transparent',
  color: ink,
  font: '600 12px/1 system-ui, sans-serif',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

function Card(props: {
  index: string;
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={props.label}
      className="sc-card"
      style={{
        flex: '1 1 260px',
        maxWidth: 340,
        background: 'rgba(13, 27, 32, 0.72)',
        border: '1px solid rgba(233,242,240,0.14)',
        borderRadius: 18,
        padding: '26px 24px',
        color: ink,
        backdropFilter: 'blur(10px)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'left',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          font: '700 12px/1 ui-monospace, monospace',
          color: accent,
          letterSpacing: '0.3em',
        }}
      >
        {props.index}
      </span>
      <strong
        style={{
          fontSize: 20,
          fontWeight: 650,
          letterSpacing: '-0.01em',
          color: '#fff',
        }}
      >
        {props.title}
      </strong>
      {props.children}
    </section>
  );
}

const cardText: CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.55,
  margin: 0,
  color: 'rgba(233,242,240,0.72)',
};

export interface AiChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Conversational city creation: the user describes and refines the city
 * in plain language; each message asks the model for a revised validated
 * plan, and nothing is built until the user confirms the current plan.
 */
interface SpeechRecognitionLike {
  lang: string;
  onresult:
    | ((event: {
        results: {
          [index: number]: { [index: number]: { transcript: string } };
        };
      }) => void)
    | null;
  onend: (() => void) | null;
  start(): void;
}

export function AiChatPanel(props: {
  busy: boolean;
  plan: AiCityPlanResult | null;
  messages: AiChatMessage[];
  onSend(text: string): void;
  onBuild(): void;
  onBack(): void;
}) {
  const language = useLanguage();
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const dictate = () => {
    const ctor =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).SpeechRecognition ??
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).webkitSpeechRecognition;
    if (!ctor) {
      setVoiceNote(
        pick(
          language,
          'Voice dictation is not available in this browser. It works in Chrome; type your message here.',
          'El dictado por voz no esta disponible en este navegador. En Chrome funciona; acá escribí el mensaje.',
        ),
      );
      return;
    }
    setVoiceNote(null);
    const recognition = new ctor();
    recognition.lang = language === 'en' ? 'en-US' : 'es-AR';
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      if (transcript) setDraft((current) => `${current} ${transcript}`.trim());
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };
  const send = () => {
    const text = draft.trim();
    if (!text || props.busy) return;
    setDraft('');
    props.onSend(text);
  };
  return (
    <section
      aria-label={pick(
        language,
        'Chat to create your city with AI',
        'Chat para crear tu ciudad con IA',
      )}
      style={{
        width: '100%',
        maxWidth: 660,
        background: 'rgba(10, 22, 27, 0.82)',
        border: '1px solid rgba(233,242,240,0.14)',
        borderRadius: 20,
        padding: 24,
        color: ink,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        textAlign: 'left',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(233,242,240,0.12)',
          paddingBottom: 14,
        }}
      >
        <div>
          <strong style={{ fontSize: 17, color: '#fff', display: 'block' }}>
            {pick(
              language,
              'Create your city with AI',
              'Crear tu ciudad con IA',
            )}
          </strong>
          <span
            style={{
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: accent,
            }}
          >
            Meta AI · Muse Spark
          </span>
        </div>
        <button type="button" onClick={props.onBack} style={ghostButton}>
          {pick(language, 'Back', 'Volver')}
        </button>
      </div>
      <div
        aria-label={pick(language, 'Conversation', 'Conversación')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxHeight: '46vh',
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {props.messages.map((message, index) => (
          <div
            key={index}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background:
                message.role === 'user'
                  ? 'linear-gradient(135deg, #0f766e, #14b8a6)'
                  : 'rgba(233,242,240,0.08)',
              border:
                message.role === 'user'
                  ? 'none'
                  : '1px solid rgba(233,242,240,0.1)',
              color: message.role === 'user' ? '#fff' : ink,
              borderRadius:
                message.role === 'user'
                  ? '16px 16px 4px 16px'
                  : '16px 16px 16px 4px',
              padding: '10px 14px',
              fontSize: 13.5,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {message.text}
          </div>
        ))}
        {props.busy && (
          <p
            style={{
              fontSize: 12.5,
              margin: 0,
              color: 'rgba(233,242,240,0.6)',
              fontStyle: 'italic',
            }}
          >
            {pick(language, 'Meta AI is thinking…', 'Meta AI está pensando…')}
          </p>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        style={{ display: 'flex', gap: 10 }}
      >
        <input
          aria-label={pick(
            language,
            'Describe your city',
            'Escribí cómo querés tu ciudad',
          )}
          placeholder={pick(
            language,
            'Describe your city…',
            'Escribí cómo querés tu ciudad…',
          )}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 999,
            border: '1px solid rgba(233,242,240,0.2)',
            background: 'rgba(233,242,240,0.06)',
            color: '#fff',
            fontSize: 14,
            outline: 'none',
          }}
        />
        {
          <button
            type="button"
            onClick={dictate}
            disabled={props.busy}
            style={{
              ...primaryButton,
              width: 'auto',
              marginTop: 0,
              padding: '12px 16px',
              background: listening
                ? 'linear-gradient(135deg, #be123c, #e11d48)'
                : 'rgba(233,242,240,0.12)',
            }}
          >
            {listening
              ? pick(language, 'Listening…', 'Escuchando…')
              : pick(language, 'Dictate', 'Dictar')}
          </button>
        }
        <button
          type="submit"
          disabled={props.busy || !draft.trim()}
          style={{
            ...primaryButton,
            width: 'auto',
            marginTop: 0,
            padding: '12px 22px',
          }}
        >
          {pick(language, 'Send', 'Enviar')}
        </button>
      </form>
      {voiceNote && (
        <p style={{ fontSize: 12, margin: 0, color: '#fda4af' }} role="note">
          {voiceNote}
        </p>
      )}
      {props.plan && (
        <button
          type="button"
          onClick={props.onBuild}
          style={{
            ...primaryButton,
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            padding: '14px 16px',
          }}
        >
          {pick(language, 'Build this city', 'Construir esta ciudad')} ·{' '}
          {props.plan.name} ·{' '}
          {props.plan.source === 'meta'
            ? 'Meta AI'
            : pick(language, 'No AI (local)', 'Sin IA (local)')}
        </button>
      )}
    </section>
  );
}

/**
 * Entry screen: creating the city is the first decision. Nothing is
 * requested, generated or rendered until the user picks a path (Meta AI
 * chat, random/seed, or a specific real zone).
 */
export function CityStartScreen(props: {
  aiBusy: boolean;
  onAiChat(description: string): Promise<AiCityPlanResult>;
  onBuildAi(plan: AiCityPlanResult): void;
  onRandom(): void;
  onImportZone(): void;
  onSeed(seed: number): void;
  onLanguageChange?(language: AppLanguage): void;
}) {
  const language = useLanguage();
  const [view, setView] = useState<'options' | 'chat'>('options');
  const [seed, setSeed] = useState('123');
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      role: 'assistant',
      text: pick(
        language,
        'Tell me about your city: coastal or with a river? Low buildings or towers? Lots of parks? When you like the plan, we build it.',
        'Contame cómo querés tu ciudad: ¿costera o con río? ¿Edificios bajos o torres? ¿Muchos parques? Cuando te guste el plan, lo construimos.',
      ),
    },
  ]);
  const [plan, setPlan] = useState<AiCityPlanResult | null>(null);
  const parsedSeed = parseCitySeed(seed);

  const handleSend = async (text: string) => {
    const userTexts = [
      ...messages.filter((m) => m.role === 'user').map((m) => m.text),
      text,
    ];
    setMessages((current) => [...current, { role: 'user', text }]);
    const nextPlan = await props.onAiChat(userTexts.join('. '));
    setPlan(nextPlan);
    setMessages((current) => [
      ...current,
      {
        role: 'assistant',
        text: `${nextPlan.name} (${nextPlan.source === 'meta' ? 'Meta AI' : pick(language, 'No AI (local)', 'Sin IA (local)')}): ${nextPlan.summary}\n${nextPlan.profile.buildingTarget} ${pick(language, 'buildings', 'edificios')} · ${nextPlan.profile.parkTarget} ${pick(language, 'parks', 'parques')} · ${pick(language, 'seed', 'semilla')} ${nextPlan.seed}. ${pick(language, 'Ask for changes or build it.', 'Pedime ajustes o construila.')}`,
      },
    ]);
  };

  return (
    <div
      role="dialog"
      aria-label={pick(language, 'Create your city', 'Crear tu ciudad')}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: ink,
        background:
          'radial-gradient(1000px 500px at 15% -10%, rgba(20,184,166,0.22), transparent 60%),' +
          'radial-gradient(900px 480px at 90% 110%, rgba(59,130,246,0.18), transparent 60%),' +
          'linear-gradient(rgba(233,242,240,0.045) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(233,242,240,0.045) 1px, transparent 1px),' +
          'linear-gradient(160deg, #0a141a 0%, #0d2027 55%, #081118 100%)',
        backgroundSize: 'auto, auto, 44px 44px, 44px 44px, auto',
      }}
    >
      <style>{`
        .sc-card { transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease; }
        .sc-card:hover { transform: translateY(-4px); border-color: rgba(45,212,191,0.45) !important; box-shadow: 0 26px 60px rgba(0,0,0,0.55); }
        .sc-card button { transition: filter .2s ease, transform .2s ease; }
        .sc-card button:hover:not(:disabled) { filter: brightness(1.12); }
        .sc-card button:active:not(:disabled) { transform: scale(0.98); }
      `}</style>
      {props.onLanguageChange && (
        <div style={{ alignSelf: 'flex-end', marginBottom: 18 }}>
          <LanguageToggle
            language={language}
            onChange={props.onLanguageChange}
          />
        </div>
      )}
      <p
        style={{
          margin: '0 0 14px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.34em',
          textTransform: 'uppercase',
          color: accent,
          textAlign: 'center',
        }}
      >
        {pick(
          language,
          'Interactive urban simulator',
          'Simulador urbano interactivo',
        )}
      </p>
      <h1
        style={{
          color: '#fff',
          fontSize: 'clamp(38px, 6vw, 58px)',
          fontWeight: 750,
          letterSpacing: '-0.03em',
          lineHeight: 1.02,
          margin: '0 0 14px',
          textAlign: 'center',
        }}
      >
        Simulicity IA
      </h1>
      <p
        style={{
          color: 'rgba(233,242,240,0.68)',
          fontSize: 16,
          lineHeight: 1.6,
          margin: '0 0 38px',
          textAlign: 'center',
          maxWidth: 600,
        }}
      >
        {pick(
          language,
          'Create a city, put it through a disaster and measure how its people respond. First: how is your city born?',
          'Creá una ciudad, sometela a una catástrofe y medí cómo responden sus habitantes. Primero: ¿cómo nace tu ciudad?',
        )}
      </p>
      {view === 'chat' ? (
        <AiChatPanel
          busy={props.aiBusy}
          plan={plan}
          messages={messages}
          onSend={handleSend}
          onBuild={() => plan && props.onBuildAi(plan)}
          onBack={() => setView('options')}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            justifyContent: 'center',
            width: '100%',
            maxWidth: 1080,
          }}
        >
          <Card
            index="01"
            title={pick(
              language,
              'Create a city with AI',
              'Crear ciudad con IA',
            )}
            label={pick(
              language,
              'Create a city with AI',
              'Crear ciudad con IA',
            )}
          >
            <p style={cardText}>
              {pick(
                language,
                'Open the chat and tell Meta AI what your city should be like. You can ask for changes before building it.',
                'Abrí el chat y contale a Meta AI cómo querés tu ciudad. Podés pedir ajustes antes de construirla.',
              )}
            </p>
            <button
              type="button"
              style={primaryButton}
              onClick={() => setView('chat')}
            >
              {pick(language, 'Open AI chat', 'Abrir chat con IA')}
            </button>
          </Card>

          <Card
            index="02"
            title={pick(
              language,
              'Random city / seed',
              'Ciudad random / semilla',
            )}
            label={pick(
              language,
              'Random city or by seed',
              'Ciudad random o por semilla',
            )}
          >
            <p style={cardText}>
              {pick(
                language,
                'A surprise city every run, or an exact one from its seed: the same seed always rebuilds the same city.',
                'Una ciudad sorpresa en cada partida, o una exacta por su semilla: la misma semilla siempre reconstruye la misma ciudad.',
              )}
            </p>
            <button
              type="button"
              style={primaryButton}
              onClick={props.onRandom}
            >
              {pick(language, 'Generate random', 'Generar random')}
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (parsedSeed !== null) props.onSeed(parsedSeed);
              }}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
            >
              <label
                style={{
                  fontSize: 11,
                  flex: 1,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(233,242,240,0.55)',
                }}
              >
                {pick(language, 'Seed', 'Semilla')}
                <input
                  aria-label={pick(
                    language,
                    'Specific city seed',
                    'Semilla de ciudad específica',
                  )}
                  inputMode="numeric"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(233,242,240,0.2)',
                    background: 'rgba(233,242,240,0.06)',
                    color: '#fff',
                    fontSize: 14,
                    letterSpacing: 'normal',
                    textTransform: 'none',
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={parsedSeed === null}
                style={{ ...primaryButton, width: 'auto', marginTop: 0 }}
              >
                {pick(language, 'Create', 'Crear')}
              </button>
            </form>
            {parsedSeed === null && (
              <p
                role="alert"
                style={{ fontSize: 12, margin: 0, color: '#fda4af' }}
              >
                {pick(
                  language,
                  'The seed must be an integer from 0 to 4294967295.',
                  'La semilla debe ser un entero de 0 a 4294967295.',
                )}
              </p>
            )}
          </Card>

          <Card
            index="03"
            title={pick(language, 'A specific city', 'Ciudad en específico')}
            label={pick(language, 'A specific city', 'Ciudad en específico')}
          >
            <p style={cardText}>
              {pick(
                language,
                'A real zone: search a city or neighborhood on the map, crop the 1000 m square, or upload your GeoJSON plan. It is converted with OpenStreetMap data.',
                'Una zona real: buscá una ciudad o barrio en el mapa, recortá el cuadrado de 1000 m, o subí tu plano GeoJSON. Se convierte con datos de OpenStreetMap.',
              )}
            </p>
            <button
              type="button"
              style={primaryButton}
              onClick={props.onImportZone}
            >
              {pick(language, 'Open the map', 'Abrir el mapa')}
            </button>
          </Card>
        </div>
      )}
      <p
        style={{
          marginTop: 34,
          fontSize: 11.5,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(233,242,240,0.38)',
          textAlign: 'center',
        }}
      >
        {pick(
          language,
          'Terrain · water · streets · buildings · services · people',
          'Terreno · agua · calles · edificios · servicios · habitantes',
        )}
      </p>
    </div>
  );
}
