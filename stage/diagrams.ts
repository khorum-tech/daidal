/**
 * The stage data: invented teams and diagrams, written as `skope-backup` files (what the import API reads).
 * Stage is reset to this on every push.
 *
 * Everything here is original. The repository is public, so no real company's architecture and no real people:
 * addresses are on example.com. Its job is that every feature has something to show (docs/stage.md). When a
 * feature adds something to a diagram or its history, extend this so stage keeps exercising it.
 */

/** The prototype's palette (web/index.html `base()`), so tag colours look the same as the demo's. */
const P = ["#b5abfc", "#968ae0", "#796cbf", "#d2cefd", "#9690c9", "#9397ab", "#c9b9f7"];

/** Invented teammates. Priya runs the Payments workspace and shares it with the stage owner. */
export const PRIYA = { email: "priya@example.com", name: "Priya Okafor", title: "Payments engineer", settings: {} };
export const DEV = { email: "dev@example.com", name: "Dev Marsh", title: "SRE", settings: {} };
export const TEAMMATES = [PRIYA, DEV];
/** The stage owner's profile; their email comes from STAGE_OWNER_EMAIL. */
// The tour is marked turned down, so stage doesn't offer it again after every deploy resets the data; the account
// menu's Tutorial still starts it.
export const OWNER_PROFILE = { name: "Rowan Ellery", title: "Platform lead", settings: { theme: "dark", tutorial: { step: 0, dismissed: true } } };

type Json = Record<string, unknown>;

const tag = (label: string, color: string, group: string) => ({ label, color, group });

const node = (id: string, name: string, type: string, x: number, y: number, tags: string[], more: Json = {}) => ({
  id,
  name,
  type,
  tags,
  layout: { x, y, w: 190 },
  ...more,
});

const edge = (from: string, to: string, label?: string, more: Json = {}) => ({ from, to, ...(label ? { label } : {}), ...more });

/** A version 1 document in the shape the prototype's .skope.json export writes (web/index.html `buildConfig`). */
function diagramDoc(id: string, name: string, kind: string, view: string, parts: { tags: Json; views: Json[]; nodes: Json[]; edges: Json[]; boundaries?: Json[] }) {
  return { version: 1, diagram: { id, name, kind, view }, ...parts };
}

// ---- ledger-platform: a C4 container diagram that uses every node, edge and boundary option ----

const ledgerTags = {
  web: tag("Web", P[0], "Layer"),
  service: tag("Service", P[1], "Layer"),
  data: tag("Data", P[2], "Layer"),
  auth: tag("Auth", P[3], "Concern"),
  async: tag("Async", P[4], "Concern"),
  obs: tag("Observability", P[5], "Concern"),
};

const ledgerViews = [
  { name: "Full system", tags: Object.keys(ledgerTags) },
  { name: "Write path", tags: ["web", "service", "data", "auth"] },
  { name: "Events", tags: ["service", "async"] },
  { name: "On call", tags: ["service", "obs"] },
];

const ledgerNodes = [
  node("console", "Ledger Console", "web-app", 60, 150, ["web"], { subtitle: "Svelte · TypeScript", notes: "Where finance staff reconcile accounts and approve adjustments.", links: [{ label: "Runbook", url: "https://example.com/runbooks/ledger-console" }] }),
  node("edge", "Edge Router", "service", 340, 150, ["service"], { subtitle: "Envoy" }),
  node("identity", "Identity", "service", 340, 360, ["service", "auth"], { subtitle: "OIDC broker", notes: "Issues short-lived tokens; every internal call carries one." }),
  node("postings", "Postings Service", "service", 620, 150, ["service"], { subtitle: "Kotlin · Ktor", notes: "Double-entry postings. Rejects any batch that does not balance." }),
  node("balances", "Balances Service", "service", 620, 360, ["service", "async"], { subtitle: "Rust", flags: ["cache", "mq"] }),
  node("stream", "Ledger Stream", "queue", 560, 570, ["data", "async"], { subtitle: "8 partitions", layout: { x: 560, y: 570, w: 310 } }),
  node("journal", "Journal DB", "database", 900, 150, ["data"], { subtitle: "PostgreSQL", flags: ["db"], notes: "Append-only journal; corrections are new rows, never updates." }),
  node("snapshots", "Balance Cache", "database", 900, 360, ["data"], { subtitle: "In-memory" }),
  node("collector", "Collector", "telemetry", 60, 480, ["obs"], { subtitle: "OpenTelemetry", layout: { x: 60, y: 480, w: 190, h: 90 } }),
];

const ledgerEdges = [
  edge("console", "edge", "HTTPS"),
  edge("edge", "postings", "gRPC", { route: "straight" }),
  edge("edge", "identity", "verify", { direction: "both" }),
  edge("postings", "journal", "SQL"),
  edge("postings", "balances", "post", { anchors: { from: "bottom:0.5", to: "top:0.5" } }),
  edge("balances", "snapshots", "cache", { route: "angled" }),
  edge("balances", "stream", "events", { line: "dashed" }),
  edge("collector", "identity", "traces", { line: "dotted", showLabel: false, width: 1 }),
  edge("stream", "platform", "replay", { direction: "back" }),
];

const ledgerBoundaries = [
  { id: "platform", label: "LEDGER CLUSTER · EU-WEST", layout: { x: 316, y: 112, w: 794, h: 546 } },
  { id: "store", label: "Storage", border: { style: "solid", width: 2 }, moveContents: false, layout: { x: 880, y: 120, w: 230, h: 340 }, labelPosition: "outside-tr" },
];

const ledger = (version: number) =>
  diagramDoc("ledger-platform", "ledger-platform", "c4", "Full system", {
    tags: ledgerTags,
    views: ledgerViews,
    // Version 1 had no cache yet; the cache and its edge arrive in version 2.
    nodes: version >= 2 ? ledgerNodes : ledgerNodes.filter(n => n.id !== "snapshots"),
    edges: version >= 2 ? ledgerEdges : ledgerEdges.filter(e => e.to !== "snapshots"),
    boundaries: ledgerBoundaries,
  });

// ---- edge-ingress: an infra diagram with a real history, so a follower has changes to review ----

const ingressTags = { edge: tag("Edge", P[3], "Layer"), compute: tag("Compute", P[1], "Layer"), security: tag("Security", P[6], "Concern") };

const ingress = (step: 1 | 2 | 3 | 4) => {
  const nodes = [
    node("dns", "Public DNS", "dns", 60, 200, ["edge"]),
    node("lb", "Load Balancer", "load-balancer", 320, 200, ["edge"], { subtitle: "L7" }),
    node("pool-a", "Web Pool A", "compute", 600, 120, ["compute"], { subtitle: "6 × small" }),
  ];
  const edges = [edge("dns", "lb", "A/AAAA"), edge("lb", "pool-a", "HTTP")];
  if (step >= 2) {
    nodes.splice(1, 0, node("waf", "Web Firewall", "security", 190, 360, ["edge", "security"], { notes: "Managed rule set plus two custom rate limits." }));
    edges.push(edge("lb", "waf", "inspect", { direction: "both", line: "dashed" }));
  }
  if (step >= 3) {
    nodes.push(node("pool-b", "Web Pool B", "compute", 600, 300, ["compute"], { subtitle: "second region" }));
    edges.push(edge("lb", "pool-b", "HTTP"));
  }
  if (step >= 4) nodes.push(node("health", "Health Checker", "service", 320, 420, ["compute"]));
  return diagramDoc("edge-ingress", "edge-ingress", "infra", "All", {
    tags: ingressTags,
    views: [{ name: "All", tags: Object.keys(ingressTags) }, { name: "Security", tags: ["edge", "security"] }],
    nodes,
    edges,
    boundaries: step >= 3 ? [{ id: "regions", label: "TWO REGIONS", layout: { x: 560, y: 80, w: 280, h: 360 } }] : [],
  });
};

// ---- small diagrams ----

const scratch = diagramDoc("scratch", "scratch-token-refresh", "freeform", "All", {
  tags: {},
  views: [{ name: "All", tags: [] }],
  nodes: [node("app", "Mobile App", "client", 80, 120, []), node("idp", "Identity", "service", 380, 120, [])],
  edges: [],
});

const payTags = { client: tag("Client", P[0], "Layer"), core: tag("Core", P[1], "Layer"), partner: tag("Partner", P[4], "Concern") };

const paymentFlow = (version: number) =>
  diagramDoc("payment-flow", "payment-flow", "c4", "Happy path", {
    tags: payTags,
    views: [{ name: "Happy path", tags: ["client", "core"] }, { name: "Partners", tags: ["core", "partner"] }],
    nodes: [
      node("checkout", "Checkout Page", "web-app", 60, 160, ["client"]),
      node("intents", "Payment Intents", "service", 340, 160, ["core"], { notes: "One intent per order; retries reuse the same intent id." }),
      node("acquirer", "Card Acquirer", "external", 620, 80, ["partner"]),
      ...(version >= 2 ? [node("wallets", "Wallet Gateway", "external", 620, 260, ["partner"])] : []),
    ],
    edges: [
      edge("checkout", "intents", "create intent"),
      edge("intents", "acquirer", "authorise", { line: "dashed" }),
      ...(version >= 2 ? [edge("intents", "wallets", "redirect")] : []),
    ],
  });

const fraudSignals = diagramDoc("fraud-signals", "fraud-signals", "freeform", "All", {
  tags: { signal: tag("Signal", P[2], "Kind") },
  views: [{ name: "All", tags: ["signal"] }],
  nodes: [
    node("velocity", "Velocity", "rule", 80, 80, ["signal"]),
    node("geo", "Geo mismatch", "rule", 80, 220, ["signal"]),
    node("score", "Risk Score", "model", 380, 150, ["signal"], { subtitle: "0–100" }),
  ],
  edges: [edge("velocity", "score"), edge("geo", "score")],
});

// ---- the files ----

const day = (d: string) => `2026-${d}T09:30:00.000Z`;

/** What the stage owner imports: their personal workspace and the Platform team they run. */
export function ownerBackup() {
  return {
    format: "skope-backup",
    version: 1,
    workspaces: [
      {
        personal: true,
        diagrams: [
          {
            id: "edge-ingress",
            doc: ingress(4), // the working copy has an edit not yet snapshotted
            updated: day("10-20"),
            snapshots: [
              { id: "ingress-1", label: "First sketch", doc: ingress(1), at: day("09-02") },
              { id: "ingress-2", label: "Add the web firewall", doc: ingress(2), at: day("09-16") },
              { id: "ingress-3", label: "Second region", doc: ingress(3), at: day("10-07") },
            ],
          },
          { id: "scratch", doc: scratch, updated: day("10-21") },
        ],
      },
      {
        name: "Platform team",
        diagrams: [
          {
            id: "ledger-platform",
            doc: ledger(2),
            updated: day("10-18"),
            snapshots: [
              { id: "ledger-1", label: "Container view", doc: ledger(1), at: day("08-28") },
              { id: "ledger-2", label: "Add the balance cache", doc: ledger(2), at: day("10-11") },
            ],
          },
          {
            // Synced to "Add the web firewall", so "Second region" waits for review. One of its changes (adding
            // Web Pool B) is already skipped; verdicts are keyed "<lead snapshot id>:<change>" (web/index.html diffSnaps).
            id: "ingress-platform",
            name: "edge-ingress (platform copy)",
            doc: ingress(2),
            updated: day("09-20"),
            follows: { diagram: "edge-ingress", synced: "ingress-2", decided: { "ingress-3:na:pool-b": "skipped" } },
          },
          {
            // Up to date with its lead, but paused: new upstream changes won't be offered.
            id: "ledger-dr",
            name: "ledger-platform (DR drill)",
            doc: ledger(2),
            updated: day("10-12"),
            follows: { diagram: "ledger-platform", synced: "ledger-2", paused: true },
          },
        ],
      },
    ],
  };
}

/** What Priya imports: the Payments workspace, later shared with the stage owner. */
export function priyaBackup() {
  return {
    format: "skope-backup",
    version: 1,
    workspaces: [
      {
        name: "Payments",
        diagrams: [
          {
            id: "payment-flow",
            doc: paymentFlow(2),
            updated: day("10-15"),
            snapshots: [{ id: "pay-1", label: "Cards only", doc: paymentFlow(1), at: day("09-24") }],
          },
          { id: "fraud-signals", doc: fraudSignals, updated: day("10-09") },
        ],
      },
    ],
  };
}
