import * as THREE from 'three';

function canvasTexture(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createUrbanTextures(includeFacades = true) {
  const facade = (color: string, brick = false) =>
    canvasTexture(128, 128, (c) => {
      c.fillStyle = color;
      c.fillRect(0, 0, 128, 128);
      if (brick) {
        c.strokeStyle = '#ffffff30';
        c.lineWidth = 1;
        for (let y = 0; y < 128; y += 12) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(128, y);
          c.stroke();
          for (let x = y % 24 ? 0 : 16; x < 128; x += 32)
            c.strokeRect(x, y, 32, 12);
        }
      }
      c.fillStyle = '#e5e4dc';
      c.fillRect(30, 20, 68, 88);
      c.fillStyle = '#334e5c';
      c.fillRect(34, 24, 60, 80);
      c.fillStyle = '#627e87';
      c.fillRect(38, 28, 22, 68);
      c.fillStyle = '#d5d5c9';
      c.fillRect(62, 24, 3, 80);
      c.fillRect(34, 62, 60, 3);
      c.fillStyle = '#a4a29a';
      c.fillRect(26, 108, 76, 5);
    });
  const surface = (r: number, g: number, b: number, joints = false) =>
    canvasTexture(64, 64, (c) => {
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const noise = ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 13) - 6;
          c.fillStyle = `rgb(${r + noise},${g + noise},${b + noise})`;
          c.fillRect(x, y, 1, 1);
        }
      if (joints) {
        c.strokeStyle = '#73797550';
        for (let v = 0; v < 64; v += 16) {
          c.beginPath();
          c.moveTo(v, 0);
          c.lineTo(v, 64);
          c.moveTo(0, v);
          c.lineTo(64, v);
          c.stroke();
        }
      }
    });
  const storefront = includeFacades
    ? canvasTexture(256, 128, (c) => {
        c.fillStyle = '#e8e5d8';
        c.fillRect(0, 0, 256, 128);
        c.fillStyle = '#315869';
        c.fillRect(8, 8, 152, 112);
        c.fillRect(168, 8, 80, 112);
        c.strokeStyle = '#9ac3ce';
        c.lineWidth = 3;
        c.strokeRect(15, 15, 138, 98);
        c.strokeRect(175, 15, 66, 98);
        c.fillStyle = '#e8e5d8';
        c.fillRect(204, 50, 4, 22);
      })
    : undefined;
  const signs = ['MERCADO', 'CAFÉ', 'LIBRERÍA'].map((label) =>
    includeFacades
      ? canvasTexture(512, 96, (c) => {
          c.fillStyle = '#253e47';
          c.fillRect(0, 0, 512, 96);
          c.fillStyle = '#fff4d1';
          c.font = 'bold 48px sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(label, 256, 50);
        })
      : undefined,
  );
  return {
    facades: {
      sand: includeFacades ? facade('#dbc9a5') : undefined,
      brick: includeFacades ? facade('#bd876c', true) : undefined,
      stone: includeFacades ? facade('#bdc8cc') : undefined,
    },
    asphalt: includeFacades ? undefined : surface(64, 68, 70),
    concrete: includeFacades ? undefined : surface(190, 190, 181, true),
    grass: includeFacades ? undefined : surface(98, 133, 77),
    storefront,
    signs,
  };
}
