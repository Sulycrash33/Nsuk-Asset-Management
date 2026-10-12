type Controls = { stop: () => void };
/** Discard late camera startup results after stop, restart or unmount. */
export class CameraSession {
  private generation = 0;
  private controls: Controls | null = null;
  start(): number { this.stop(); return this.generation; }
  isCurrent(generation: number): boolean { return generation === this.generation; }
  attach(generation: number, controls: Controls): boolean {
    if (!this.isCurrent(generation)) { controls.stop(); return false; }
    this.controls?.stop(); this.controls = controls; return true;
  }
  stop(): void { this.generation++; const controls = this.controls; this.controls = null; controls?.stop(); }
}
