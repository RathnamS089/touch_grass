import { test, expect } from '@playwright/test';

// Browser contract tests: real React/orb/Leaflet with a controlled IPC boundary.
// Live Rust/network verification is provided separately by verify_connection.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    let nextId = 1;
    const callbacks = new Map<number, Function>();
    const listeners = new Map<number, { event: string; handler: number }>();
    let settings = { sessionThresholdMinutes: 45, breakDurationMinutes: 15, reminderFrequencyMinutes: 60, natureImagery: true, nearbyRecommendations: true };
    w.testCalls = [];
    w.failSave = false;
    w.emitBreak = () => w.emitTestEvent('break_ready', { name: 'Verified Park', category: 'Park', distance: 'Check the map for distance', reason: 'A quiet place to stretch.', lat: 12.9763, lon: 77.5929 });
    w.emitTestEvent = (event: string, payload: unknown) => {
      for (const [id, listener] of listeners) if (listener.event === event) callbacks.get(listener.handler)?.({ event, id, payload });
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event: string, id: number) => listeners.delete(id) };
    w.__TAURI_INTERNALS__ = {
      transformCallback: (fn: Function) => { const id = nextId++; callbacks.set(id, fn); return id; },
      invoke: async (command: string, args: any) => {
        w.testCalls.push(command);
        if (command === 'plugin:event|listen') { const id = nextId++; listeners.set(id, args); return id; }
        if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId); return; }
        if (command === 'get_settings') return settings;
        if (command === 'set_settings') { if (w.failSave) throw Error('save failed'); settings = args.settings; return; }
        if (command === 'get_screen_time_detail') return { source: 'grounded-engine', total_seconds: 3600, current_session_seconds: 300, is_active: true, sessions: 2, nudges: 1, hourly: [[9, 3600]] };
        if (command === 'get_backend_status') return { ok: true, backend: 'rust', message: 'ready' };
        if (command === 'test_break') { w.emitBreak(); return; }
        if (command === 'ask_llm') return `Reply to ${args.query}`;
        throw Error(`Unexpected command ${command}`);
      },
    };
  });
  await page.goto('/');
});

test('reminder from settings reaches orb and map without generating it twice', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Try a reminder' }).click();
  await expect(page.getByRole('button', { name: 'Show on map' })).toBeVisible();
  await expect(page.locator('.mo-root')).toHaveAttribute('data-phase', 'answered');
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: string) => c === 'ask_llm'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Show on map' }).click();
  await expect(page.getByRole('heading', { name: 'Verified Park' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Map showing Verified Park' })).toBeVisible();
  await page.evaluate(() => (window as any).emitTestEvent('history_save_status', 'Reminder saved to Supabase.'));
  await expect(page.getByText('Reminder saved to Supabase.')).toBeVisible();
});

test('Not now dismisses the reminder and a second reminder still works', async ({ page }) => {
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.evaluate(() => (window as any).emitBreak());
  await expect(page.locator('.mo-root')).toHaveAttribute('data-phase', 'answered');
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.locator('.mo-root')).toHaveAttribute('data-phase', 'idle');
  await page.evaluate(() => (window as any).emitBreak());
  await expect(page.locator('.mo-root')).toHaveAttribute('data-phase', 'answered');
  await expect(page.getByText('Verified Park', { exact: true })).toBeVisible();
});

test('failed settings save does not claim the engine accepted a new value', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(() => { (window as any).failSave = true; });
  await page.getByRole('button', { name: 'Decrease', exact: true }).first().click();
  await expect(page.getByText('Changes could not be saved. Please try again.')).toBeVisible();
  await expect(page.locator('.stepper strong').first()).toHaveText('45 min');
  await page.evaluate(() => { (window as any).failSave = false; });
  await page.getByRole('button', { name: 'Decrease', exact: true }).first().click();
  await expect(page.locator('.stepper strong').first()).toHaveText('40 min');
});

test('command question works after a completed answer', async ({ page }) => {
  for (const question of ['first question', 'second question']) {
    await page.getByRole('button', { name: 'Type "/" for commands, or ask anything' }).click();
    await page.getByRole('textbox', { name: 'Command or question' }).fill(question);
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await expect(page.locator('.mo-root')).toHaveAttribute('data-phase', 'answered');
    await expect(page.locator('.mo-a-body')).toContainText(`Reply to ${question}`);
  }
});
