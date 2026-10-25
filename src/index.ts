import { app } from './app';
import type { Env } from './env';
import { autoRelease } from './payments';

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      Promise.all([
        autoRelease(env),
        env.DB.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(Date.now()).run(),
        env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(Date.now() - 86_400_000).run(),
      ]),
    );
  },
} satisfies ExportedHandler<Env>;
