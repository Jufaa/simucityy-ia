export interface FrameMeasurement {
  fps: number;
  frameMilliseconds: number;
  renderMilliseconds: number;
  drawCalls: number;
  triangles: number;
}

/** Wall-clock frame cadence and CPU render-submission time, not GPU timing. */
export class FrameMetrics {
  private start: number | null = null;
  private frames = 0;
  private renderTime = 0;

  reset() {
    this.start = null;
    this.frames = 0;
    this.renderTime = 0;
  }

  sample(
    timestampInMilliseconds: number,
    renderMilliseconds: number,
    drawCalls: number,
    triangles: number,
  ): FrameMeasurement | null {
    if (this.start === null) {
      this.start = timestampInMilliseconds;
      return null;
    }
    this.frames++;
    this.renderTime += renderMilliseconds;
    const elapsed = timestampInMilliseconds - this.start;
    if (elapsed < 1000) return null;
    const result = {
      fps: (this.frames * 1000) / elapsed,
      frameMilliseconds: elapsed / this.frames,
      renderMilliseconds: this.renderTime / this.frames,
      drawCalls,
      triangles,
    };
    this.start = timestampInMilliseconds;
    this.frames = 0;
    this.renderTime = 0;
    return result;
  }
}
