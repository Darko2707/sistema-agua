import { dispatchPendingPushNotifications } from '@/lib/push-dispatcher';

const POLL_MS = Math.max(5_000, Number(process.env.WORKER_POLL_MS ?? 15_000));
let stopping = false;

async function runOnce(): Promise<void> {
  try {
    const result = await dispatchPendingPushNotifications({ notificationLimit: 100, deliveryLimit: 200 });
    if (result.claimed > 0 || result.failed > 0 || result.retrying > 0) {
      console.info('sisco.push_worker.dispatch', result);
    }
  } catch (error) {
    console.error('sisco.push_worker.error', error);
  }
}

async function main(): Promise<void> {
  console.info(`sisco.push_worker.started pollMs=${POLL_MS}`);
  while (!stopping) {
    await runOnce();
    if (!stopping) await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
  }
  console.info('sisco.push_worker.stopped');
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { stopping = true; });
}

void main().catch((error) => {
  console.error('sisco.push_worker.fatal', error);
  process.exitCode = 1;
});
