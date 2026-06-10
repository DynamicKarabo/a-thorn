// frontend/src/worker/generator.ts
// Simulated trace span generator — ported from the Go prototype.
// Produces realistic latency traces with occasional anomalies.

export interface Span {
  ts: number;        // unix ms
  service: string;
  endpoint: string;
  latencyMs: number;
  status: number;
  traceId: string;
}

interface EndpointModel {
  name: string;
  mu: number;    // log-normal mu
  sigma: number; // log-normal sigma
}

interface ServiceModel {
  name: string;
  endpoints: EndpointModel[];
}

function logMu(medianMs: number): number {
  return Math.log(medianMs);
}

const SERVICES: ServiceModel[] = [
  {
    name: "api-gateway",
    endpoints: [
      { name: "GET /v1/route", mu: logMu(80), sigma: 0.4 },
      { name: "POST /v1/auth", mu: logMu(120), sigma: 0.5 },
      { name: "GET /v1/health", mu: logMu(50), sigma: 0.3 },
      { name: "POST /v1/proxy", mu: logMu(200), sigma: 0.5 },
    ],
  },
  {
    name: "user-svc",
    endpoints: [
      { name: "GET /users/:id", mu: logMu(15), sigma: 0.4 },
      { name: "POST /users", mu: logMu(40), sigma: 0.5 },
      { name: "PATCH /users/:id", mu: logMu(30), sigma: 0.4 },
      { name: "GET /users/search", mu: logMu(50), sigma: 0.6 },
    ],
  },
  {
    name: "payment-svc",
    endpoints: [
      { name: "POST /charge", mu: logMu(350), sigma: 0.4 },
      { name: "POST /refund", mu: logMu(450), sigma: 0.5 },
      { name: "GET /balance", mu: logMu(200), sigma: 0.4 },
      { name: "POST /capture", mu: logMu(300), sigma: 0.5 },
    ],
  },
  {
    name: "search-svc",
    endpoints: [
      { name: "GET /search", mu: logMu(180), sigma: 0.5 },
      { name: "GET /suggest", mu: logMu(100), sigma: 0.4 },
      { name: "GET /index/:id", mu: logMu(150), sigma: 0.5 },
      { name: "POST /reindex", mu: logMu(300), sigma: 0.6 },
    ],
  },
];

// Box-Muller transform for normally-distributed random values.
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[(Math.random() * 16) | 0];
  return s;
}

export interface AnomalyState {
  spikeUntil: number;
  errorBurstUntil: number;
}

export class SpanGenerator {
  private anomaly: AnomalyState = { spikeUntil: 0, errorBurstUntil: 0 };
  private tick = 0;

  /** Trigger a 5-second anomaly window. */
  triggerAnomaly(kind: "spike" | "error_burst") {
    const until = performance.now() + 5000;
    if (kind === "spike") this.anomaly.spikeUntil = until;
    else this.anomaly.errorBurstUntil = until;
  }

  /** Generate a batch of spans. */
  generate(count: number): Span[] {
    const spans: Span[] = [];
    const now = performance.now();
    const inSpike = now < this.anomaly.spikeUntil;
    const inError = now < this.anomaly.errorBurstUntil;

    for (let i = 0; i < count; i++) {
      this.tick++;
      const svc = SERVICES[(Math.random() * SERVICES.length) | 0];
      const ep = svc.endpoints[(Math.random() * svc.endpoints.length) | 0];

      // Log-normal latency
      let lat = Math.exp(ep.mu + ep.sigma * randn());

      // Inject latency spikes
      if (inSpike || Math.random() < 0.01) {
        lat *= 2 + Math.random() * 3; // 2x–5x
      }

      // Error injection
      let status = 200;
      const errProb = inError ? 0.4 : 0.005;
      if (Math.random() < errProb) {
        status = 500 + (Math.random() * 4) | 0;
      }

      spans.push({
        ts: Date.now(),
        service: svc.name,
        endpoint: ep.name,
        latencyMs: Math.round(lat * 10) / 10,
        status,
        traceId: randomHex(12),
      });
    }

    return spans;
  }
}
