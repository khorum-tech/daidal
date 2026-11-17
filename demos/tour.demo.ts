/**
 * The product tour: one freeform diagram, and the ways to show a slice of it. Tags switched off fade what isn't
 * needed, solo shows one tag alone, saved views are a click each, and any mix of tags becomes a new view.
 * (C4 drill-down has its own film, c4.demo.ts.)
 *
 * It runs against the stage data (docs/demo.md says how to load it), signed in through the localhost dev sign-in.
 * Silent: the captions in tour.scenes.json carry it. `test` must come from Argo, which supplies `narration`.
 */
import { test, showOverlay, createHumanCursor, resetCursor } from '@argo-video/cli';

const hold = (ms: number) => new Promise(r => setTimeout(r, ms));

test('tour', async ({ page, narration }) => {
  test.setTimeout(180_000);

  // ---- Off camera: find the stage data's richest diagram and make it freeform, so its cards are the usual ones.
  const workspaces = (await (await page.request.get('/api/workspaces')).json()) as { id: string; name: string }[];
  const ws = workspaces.find(w => w.name === 'Platform team');
  if (!ws) throw new Error('no "Platform team" workspace: load the stage data first (docs/demo.md)');
  const list = (await (await page.request.get(`/api/diagrams?workspace=${encodeURIComponent(ws.id)}`)).json()) as { id: string; name: string }[];
  const id = list.find(d => d.name === 'ledger-platform')?.id;
  if (!id) throw new Error('no "ledger-platform" diagram: load the stage data first (docs/demo.md)');
  const found = (await (await page.request.get(`/api/diagrams/${id}`)).json()) as { rev: number; doc: { diagram?: Record<string, unknown> } };
  if (found.doc.diagram?.kind !== 'freeform') {
    const res = await page.request.put(`/api/diagrams/${id}`, { data: { rev: found.rev, doc: { ...found.doc, diagram: { ...found.doc.diagram, kind: 'freeform' } } } });
    if (!res.ok()) throw new Error(`could not make the diagram freeform: ${res.status()}`);
  }
  await page.goto(`/app/d/${id}`);
  await page.getByRole('button', { name: 'Service: Postings Service' }).waitFor();
  const panel = page.getByRole('complementary', { name: 'Views and tags' });
  const tag = (name: RegExp) => panel.getByRole('checkbox', { name });
  const view = (name: RegExp) => panel.getByRole('button', { name });
  // A brisk pointer: the default travel and dwell suit a narrated film, and this one is silent.
  const quick = { durationMs: 420, dwellMs: 70, afterMs: 110 };

  await narration.startRecording(page);
  const cursor = await createHumanCursor(page, { seed: 'daidal-tour', size: 28, start: { x: 0.55, y: 0.7 } });
  try {
    // ---- 1. What it is.
    narration.mark('intro');
    await showOverlay(page, 'intro', 3000);

    // ---- 2. Everything at once: the pointer crosses the whole system.
    narration.mark('whole');
    showOverlay(page, 'whole', 3000);
    await cursor.moveTo(page.getByRole('button', { name: 'Web App: Ledger Console' }), { durationMs: 900 });
    await cursor.moveTo(page.getByRole('button', { name: 'Database: Journal DB' }), { durationMs: 1300 });
    await hold(300);

    // ---- 3. Hiding: tags off fade the nodes that carry only those tags.
    narration.mark('hide');
    showOverlay(page, 'hide', 4600);
    await cursor.click(tag(/Observability/), quick);
    await hold(900);
    await cursor.click(tag(/Async/), quick);
    await hold(900);
    await cursor.click(tag(/Auth/), quick);
    await hold(1300);

    // ---- 4. Solo: one tag alone, then everything back.
    narration.mark('solo');
    showOverlay(page, 'solo', 4200);
    await cursor.click(panel.getByRole('button', { name: 'Solo Data' }), quick);
    await hold(1900);
    await cursor.click(panel.getByRole('button', { name: 'Stop soloing Data' }), quick);
    await hold(300);
    await cursor.click(view(/^Everything/), quick);
    await hold(500);

    // ---- 5. Saved views: a click each.
    narration.mark('views');
    showOverlay(page, 'views', 5400);
    // One after the other, on purpose: each view holds the screen before the next click.
    const show = async (name: RegExp) => {
      await cursor.click(view(name), quick);
      await hold(1250);
    };
    await show(/^Write path/);
    await show(/^Events/);
    await show(/^On call/);

    // ---- 6. A new view from the tags on now.
    narration.mark('save');
    showOverlay(page, 'save', 6400);
    await cursor.click(view(/^Everything/), quick);
    await cursor.click(tag(/Web/), quick);
    await hold(300);
    await cursor.click(tag(/Observability/), quick);
    await hold(500);
    await cursor.click(panel.getByRole('button', { name: '+ Save the tags on now as a view' }), quick);
    await hold(400);
    await cursor.click(panel.getByRole('button', { name: /^Edit view/ }), quick);
    const name = panel.getByLabel('View name');
    await name.fill('');
    await name.pressSequentially('Backend only', { delay: 55 });
    await name.press('Enter');
    await hold(1200);

    // ---- 7. From a node: only the tags it carries.
    narration.mark('isolate');
    showOverlay(page, 'isolate', 4800);
    await cursor.click(view(/^Everything/), quick);
    await cursor.click(page.getByRole('button', { name: 'Service: Balances Service' }), quick);
    await hold(700);
    await cursor.click(page.getByRole('button', { name: 'Isolate its tags' }), quick);
    await hold(2000);

    // ---- 8. Close. The capture takes a frame when the page paints, so the pointer keeps moving under the card.
    narration.mark('outro');
    await cursor.click(view(/^Everything/), quick);
    showOverlay(page, 'outro', 4200);
    await cursor.moveTo(page.getByRole('link', { name: 'Daidal' }), { durationMs: 1500 });
    await cursor.moveTo(page.getByRole('link', { name: 'Daidal' }), { durationMs: 600 });
  } finally {
    await cursor.dispose();
    await resetCursor(page);
  }
});
