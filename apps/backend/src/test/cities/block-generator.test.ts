import { describe, it, expect } from 'vitest';
import { generateBlocks } from '../../modules/cities/block-generator';

describe('generateBlocks', () => {
  it('genera 4 manzanas correctas para una ciudad de 100x100 con espaciado de 50', () => {
    const blocks = generateBlocks({
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    });

    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toEqual({
      id: 'block-0-0',
      minCorner: { x: 0, y: 0 },
      maxCorner: { x: 50, y: 50 },
    });
    expect(blocks[3]).toEqual({
      id: 'block-1-1',
      minCorner: { x: 50, y: 50 },
      maxCorner: { x: 100, y: 100 },
    });
  });

  it('produce IDs únicos y áreas con superficie positiva', () => {
    const blocks = generateBlocks({
      widthInMeters: 200,
      heightInMeters: 200,
      streetSpacingInMeters: 50,
    });

    const ids = blocks.map((b) => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    blocks.forEach((block) => {
      const width = block.maxCorner.x - block.minCorner.x;
      const height = block.maxCorner.y - block.minCorner.y;
      expect(width * height).toBeGreaterThan(0);
    });
  });
});
