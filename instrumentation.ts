// Next.js calls register() once when the server starts. We use it to start the
// daily briefing scheduler inside the Node.js server process.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
