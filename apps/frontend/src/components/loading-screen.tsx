import { useEffect, useRef } from 'react';

/**
 * Full-screen loading screen that blocks all interaction while the game
 * works. Includes a Chrome-style dino runner so long imports stay fun:
 * click or press space to jump the cacti.
 */
export function LoadingScreen(props: { message: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const groundY = height - 28;
    let dinoY = 0;
    let velocity = 0;
    let score = 0;
    let dead = false;
    let frame = 0;
    let raf = 0;
    let last = performance.now();
    const cacti: { x: number; h: number }[] = [];
    const jump = () => {
      if (dead) {
        dead = false;
        score = 0;
        cacti.length = 0;
        return;
      }
      if (dinoY === 0) velocity = 620;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', jump);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame++;
      if (!dead) {
        velocity -= 1800 * dt;
        dinoY = Math.max(0, dinoY + velocity * dt);
        if (dinoY === 0) velocity = 0;
        if (frame % 75 === 0)
          cacti.push({ x: width + 20, h: 22 + Math.random() * 18 });
        for (const cactus of cacti) cactus.x -= 260 * dt;
        while (cacti.length && cacti[0]!.x < -30) {
          cacti.shift();
          score++;
        }
        for (const cactus of cacti) {
          if (cactus.x < 78 && cactus.x > 34 && dinoY < cactus.h - 6)
            dead = true;
        }
      }
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff14';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#ffffff55';
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();
      ctx.font = '34px system-ui';
      ctx.fillText('🦖', 38, groundY - dinoY - 2);
      ctx.font = '26px system-ui';
      for (const cactus of cacti) ctx.fillText('🌵', cactus.x, groundY - 2);
      ctx.fillStyle = '#eef6f7';
      ctx.font = '12px system-ui';
      ctx.fillText(`Puntos: ${score}`, 10, 18);
      if (dead) ctx.fillText('¡Chocaste! Tocá para reintentar', 130, 60);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', jump);
    };
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
      <canvas
        ref={canvasRef}
        width={420}
        height={220}
        aria-label="Mini-juego: dino saltando cactus"
        style={{
          width: 'min(420px, 86vw)',
          height: 220,
          borderRadius: 14,
          background: '#ffffff14',
          border: '1px solid #ffffff2e',
          cursor: 'pointer',
        }}
      />
      <span style={{ fontSize: 12, opacity: 0.7 }}>
        🦖 Tocá el juego o apretá espacio para saltar los cactus
      </span>
    </div>
  );
}
