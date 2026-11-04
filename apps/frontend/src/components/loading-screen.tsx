import { useEffect, useRef } from 'react';
import { pick, useLanguage } from './language';

const INK = '#535353';

// Pixel-art T-rex (Chrome offline runner style), drawn cell by cell.
// '.' is empty, '#' is body, 'o' is the eye cut-out.
const DINO_SPRITE = [
  '..........######..',
  '.........########.',
  '.........##o#####.',
  '.........########.',
  '.........#####....',
  '.#......######....',
  '.##....#######....',
  '..##..#########...',
  '...###########....',
  '....#########.....',
  '.....#######......',
  '......#####.......',
  '.......#.#........',
  '.......#..#.......',
  '......##...##.....',
] as const;

/** Draws one pixel of the runner at canvas scale. */
function drawDino(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  legFrame: boolean,
) {
  ctx.fillStyle = INK;
  for (let row = 0; row < DINO_SPRITE.length; row++) {
    const line = DINO_SPRITE[row]!;
    for (let col = 0; col < line.length; col++) {
      if (line[col] === '#')
        ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
    }
  }
  // Animated legs below the sprite body.
  const legY = y + DINO_SPRITE.length * cell;
  if (legFrame) {
    ctx.fillRect(x + 6 * cell, legY, cell, cell * 2);
    ctx.fillRect(x + 10 * cell, legY, cell, cell);
  } else {
    ctx.fillRect(x + 6 * cell, legY, cell, cell);
    ctx.fillRect(x + 10 * cell, legY, cell, cell * 2);
  }
}

function drawCactus(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  heightInPixels: number,
) {
  ctx.fillStyle = INK;
  const unit = 4;
  const stemWidth = unit * 2;
  const top = groundY - heightInPixels;
  // Main stem.
  ctx.fillRect(x, top, stemWidth, heightInPixels);
  // Left arm.
  ctx.fillRect(x - unit * 2, top + heightInPixels * 0.35, unit * 2, unit);
  ctx.fillRect(
    x - unit * 2,
    top + heightInPixels * 0.35,
    unit,
    heightInPixels * 0.3,
  );
  // Right arm.
  ctx.fillRect(x + stemWidth, top + heightInPixels * 0.5, unit * 2, unit);
  ctx.fillRect(
    x + stemWidth + unit,
    top + heightInPixels * 0.22,
    unit,
    heightInPixels * 0.3,
  );
}

/**
 * Full-screen loading screen that blocks all interaction while the app
 * works. Includes a Chrome-offline-style dino runner so long imports stay
 * bearable: click or press space to jump the cacti.
 */
export function LoadingScreen(props: { message: string }) {
  const language = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const groundY = height - 36;
    let dinoY = 0;
    let velocity = 0;
    let score = 0;
    let dead = false;
    let frame = 0;
    let raf = 0;
    let last = performance.now();
    const cacti: { x: number; h: number }[] = [];
    const clouds = [
      { x: width * 0.25, y: 34 },
      { x: width * 0.65, y: 22 },
      { x: width * 0.9, y: 44 },
    ];
    const jump = () => {
      if (dead) {
        dead = false;
        score = 0;
        cacti.length = 0;
        return;
      }
      if (dinoY === 0) velocity = 640;
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
        velocity -= 1900 * dt;
        dinoY = Math.max(0, dinoY + velocity * dt);
        if (dinoY === 0) velocity = 0;
        score += dt * 12;
        if (frame % 80 === 0)
          cacti.push({ x: width + 20, h: 30 + Math.random() * 16 });
        for (const cactus of cacti) cactus.x -= 275 * dt;
        for (const cloud of clouds) {
          cloud.x -= 22 * dt;
          if (cloud.x < -70) cloud.x = width + 30;
        }
        while (cacti.length && cacti[0]!.x < -30) cacti.shift();
        for (const cactus of cacti) {
          if (cactus.x < 78 && cactus.x > 30 && dinoY < cactus.h - 8)
            dead = true;
        }
      }
      // Chrome offline look: light page, grey ink.
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#9e9e9e';
      for (const cloud of clouds) {
        ctx.fillRect(cloud.x, cloud.y, 46, 6);
        ctx.fillRect(cloud.x + 10, cloud.y - 6, 24, 6);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();
      ctx.fillStyle = INK;
      for (let x = -((frame * 4) % 24); x < width; x += 24)
        ctx.fillRect(x, groundY + 7, 8, 2);
      drawDino(
        ctx,
        34,
        groundY - dinoY - 52,
        3,
        Math.floor(frame / 6) % 2 === 0,
      );
      for (const cactus of cacti) drawCactus(ctx, cactus.x, groundY, cactus.h);
      ctx.fillStyle = INK;
      ctx.font = '700 13px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.floor(score)).padStart(5, '0'), width - 12, 22);
      ctx.textAlign = 'left';
      if (dead) {
        ctx.font = '700 16px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('G A M E   O V E R', width / 2, 64);
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillText(
          pick(
            language,
            'Click or press space to retry',
            'Tocá o apretá espacio para reintentar',
          ),
          width / 2,
          86,
        );
        ctx.textAlign = 'left';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', jump);
    };
  }, [language]);

  return (
    <div
      role="alertdialog"
      aria-label={pick(language, 'Loading', 'Cargando')}
      aria-busy="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(247,247,247,0.96)',
        color: INK,
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
        {pick(
          language,
          'Please wait, we are preparing the city…',
          'No toques nada, estamos preparando la ciudad…',
        )}
      </span>
      <canvas
        ref={canvasRef}
        width={420}
        height={220}
        aria-label={pick(
          language,
          'Dino runner game: jump the cacti',
          'Mini-juego del dinosaurio: saltar los cactus',
        )}
        style={{
          width: 'min(420px, 86vw)',
          height: 220,
          borderRadius: 8,
          background: '#f7f7f7',
          border: '1px solid #d6d6d6',
          cursor: 'pointer',
        }}
      />
      <span style={{ fontSize: 12, opacity: 0.7 }}>
        {pick(
          language,
          'Click the game or press space to jump the cacti',
          'Tocá el juego o apretá espacio para saltar los cactus',
        )}
      </span>
    </div>
  );
}
