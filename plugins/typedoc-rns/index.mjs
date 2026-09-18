import { RnsRouter } from './router.mjs';

export function load(app) {
  app.renderer.defineRouter('rns', RnsRouter);
}
