import { useEffect, useRef, useState } from 'react';

/**
 * Full-screen loading screen that blocks all interaction while the game
 * works. Includes a tiny clicker mini-game so long imports stay fun.
 */
export function LoadingScreen(props: { message: string }) {
  const [score, setScore] = useState(0);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setPosition({
        x: 8 + Math.random() * 84,
        y: 10 + Math.random() * 74,
      });
    }, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      role="alertdialog"
      aria-label="Cargando"
      aria-busy="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#10222add',
        color: '#eef6f7',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        fontFamily: 'system-ui, sans-serif',
        touchAction: 'none',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <strong style={{ fontSize: 20 }}>{props.message}</strong>
      <span style={{ fontSize: 13, opacity: 0.85 }}>
        No toques nada, estamos cocinando la ciudad… 🍳
      </span>
      <div
        ref={areaRef}
        style={{
          position: 'relative',
          width: 'min(420px, 86vw)',
          height: 220,
          borderRadius: 14,
          background: '#ffffff14',
          border: '1px solid #ffffff2e',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          aria-label="Atrapar la gota"
          onClick={() => {
            setScore((value) => value + 1);
            setPosition({
              x: 8 + Math.random() * 84,
              y: 10 + Math.random() * 74,
            });
          }}
          style={{
            position: 'absolute',
            left: `${position.x}%`,
            top: `${position.y}%`,
            transform: 'translate(-50%, -50%)',
            fontSize: 34,
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          💧
        </button>
        <span
          style={{
            position: 'absolute',
            left: 10,
            bottom: 8,
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          Mini-juego: atrapá las gotas 💧 Puntos: {score}
        </span>
      </div>
      <span style={{ fontSize: 12, opacity: 0.7 }}>
        {score >= 10
          ? '¡Nivel plomero profesional! 🔧'
          : 'Cada gota que atrapás es una menos en la calle 😄'}
      </span>
    </div>
  );
}
