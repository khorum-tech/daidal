/**
 * The product tour: a diagram's typed nodes and tags, then a linked C4 set walked from Context down to Components.
 * It runs against the stage data (docs/demo.md says how to load it), signed in through the localhost dev sign-in.
 * Silent: the captions in tour.scenes.json carry it. `test` must come from Argo, which supplies `narration`.
 */
import { test, showOverlay, createHumanCursor, resetCursor, zoomTo } from '@argo-video/cli';

const hold = (ms: number) => new Promise(r => setTimeout(r, ms));

test('tour', async ({ page, narration }) => {
  test.setTimeout(120_000);

  // ---- Off camera: find the diagrams by name, and open the first one.
  const workspaces = (await (await page.request.get('/api/workspaces')).json()) as { id: string; name: string }[];
  const diagram = async (workspace: string, name: string) => {
    const ws = workspaces.find(w => w.name === workspace);
    if (!ws) throw new Error(`no workspace "${workspace}": load the stage data first (docs/demo.md)`);
    const list = (await (await page.request.get(`/api/diagrams?workspace=${encodeURIComponent(ws.id)}`)).json()) as { id: string; name: string }[];
    const d = list.find(x => x.name === name);
    if (!d) throw new Error(`no diagram "${name}" in "${workspace}"`);
    return d.id;
  };
  const platform = await diagram('Platform team', 'ledger-platform');
  const context = await diagram('Ledger C4', 'ledger-context');
  await page.goto(`/app/d/${platform}`);
  await page.getByRole('button', { name: 'Service: Postings Service' }).waitFor();

  await narration.startRecording(page);
  const cursor = await createHumanCursor(page, { seed: 'daidal-tour', size: 28, start: { x: 0.5, y: 0.6 } });
  try {
    // ---- 1. What it is.
    narration.mark('intro');
    await showOverlay(page, 'intro', 3200);

    // ---- 2. A node is a typed thing with details, not a loose shape.
    narration.mark('typed');
    showOverlay(page, 'typed', 5200);
    await cursor.click(page.getByRole('button', { name: 'Service: Postings Service' }));
    await hold(1600);
    await cursor.click(page.getByRole('button', { name: 'Database: Journal DB' }));
    await hold(1800);

    // ---- 3. Tags slice the same diagram.
    narration.mark('tags');
    showOverlay(page, 'tags', 5600);
    const tags = page.getByRole('complementary', { name: 'Views and tags' });
    await cursor.click(tags.getByRole('checkbox', { name: /Observability/ }));
    await hold(900);
    await cursor.click(tags.getByRole('checkbox', { name: /Async/ }));
    await hold(1500);
    await cursor.click(tags.getByRole('checkbox', { name: /Async/ }));
    await hold(700);

    // ---- 4. C4: the Context level…
    await page.goto(`/app/d/${context}`);
    await page.getByRole('button', { name: 'System: Ledger' }).waitFor();
    narration.mark('context');
    showOverlay(page, 'context', 4200);
    await cursor.moveTo(page.getByRole('button', { name: 'System: Ledger' }), { durationMs: 900 });
    await hold(1900);

    // ---- 5. …zooms into Containers, then Components.
    narration.mark('zoom');
    showOverlay(page, 'zoom', 6200);
    await page.getByRole('button', { name: 'System: Ledger' }).dblclick();
    await page.getByRole('button', { name: 'Service: Postings Service' }).waitFor();
    await hold(1400);
    await cursor.moveTo(page.getByRole('button', { name: 'Service: Postings Service' }), { durationMs: 900 });
    await hold(500);
    await page.getByRole('button', { name: 'Service: Postings Service' }).dblclick();
    await page.getByTestId('kind-badge').last().waitFor();
    await cursor.moveTo(page.getByRole('button', { name: 'Component: Postings API' }), { durationMs: 900 });
    await hold(1200);

    // ---- 6. The header keeps the way back: the camera goes in on it (a zoom added at export, so captions stay put).
    narration.mark('levels');
    // The caption comes first: the zoom crops the frame to the header, which would cut a caption off.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    showOverlay(page, 'levels', 1900);
    await cursor.moveTo(crumbs, { durationMs: 1500 });
    await hold(500);
    await zoomTo(page, crumbs, { narration, scale: 1.7, holdMs: 2400 });
    await cursor.moveTo(page.getByTestId('kind-badge').last(), { durationMs: 1200 });
    await hold(2600);

    // ---- 7. Close.
    narration.mark('outro');
    showOverlay(page, 'outro', 4600);
    // The capture takes a frame when the page paints, so the pointer keeps moving under the closing card: a still
    // screen would end the film where the card appears.
    await cursor.moveTo(page.getByRole('link', { name: 'Skope' }), { durationMs: 1800 });
    await hold(600);
    await cursor.moveTo(page.getByRole('navigation', { name: 'Breadcrumb' }), { durationMs: 1400 });
    await hold(900);
    await cursor.moveTo(page.getByRole('link', { name: 'Skope' }), { durationMs: 700 });
  } finally {
    await cursor.dispose();
    await resetCursor(page);
  }
});
