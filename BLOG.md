# Building A Thorn: A Real-Time Observability Dashboard in Pure Frontend

There's a particular kind of satisfaction in rebuilding a tool you could have just installed. Grafana exists. Datadog exists. Honeycomb has spent years perfecting high-cardinality querying. So why would anyone build an observability dashboard from scratch?

Because doing it yourself is where you actually learn how the thing works — and because "I can wire up a Grafana datasource" and "I understand how a render loop sustains 60fps while aggregating ten thousand events per second" are two very different sentences on a résumé.

A Thorn is a real-time observability dashboard that runs entirely in the browser. No backend. No external time-series database. Just a Web Worker simulating a production system, streaming metrics through a zero-copy pipeline, and rendering percentile charts, throughput graphs, and a latency heatmap that you can brush, link, and drill into. This article is about why each of those choices is more interesting than it sounds.

## The flex isn't the dashboard. It's the pipeline.

Anyone can draw a line chart. The hard part of observability tooling is the data plane: ingesting a firehose of events, aggregating them into something a human can read, and doing it continuously without dropping frames or leaking memory. Grafana hides all of this behind a datasource abstraction. Building from scratch forces you to confront it.

So the real artifact here isn't the pretty charts — it's the architecture that feeds them.

## Architecture: the Worker is the whole backend

The central design decision in A Thorn is that the **entire data pipeline lives in a single Web Worker**. The main thread does nothing but render. The worker is simultaneously the data generator, the aggregator, and the clock that drives the render loop.

This mirrors how real observability systems are structured — ingestion, aggregation, and serving are distinct stages — except collapsed into one isolated thread so the UI never blocks. The main thread's job is reduced to "receive arrays, paint pixels." When you keep aggregation off the main thread, you get a UI that stays responsive even when the simulated system is melting down at high event rates.

The worker runs a fixed-interval tick. On each tick it:

1. Generates a batch of synthetic request events.
2. Folds them into rolling aggregates (percentiles, throughput counters, a latency histogram).
3. Posts the aggregates back to the main thread for rendering.

That separation is the lesson. The data plane and the presentation plane communicate through a narrow, well-defined message protocol, and nothing else crosses the boundary.

## Why log-normal latency matters

Naive simulations use uniform or Gaussian random latency. Real systems don't behave that way. Request latency in production is overwhelmingly **log-normal**: a dense cluster of fast responses with a long, fat tail of slow ones. That tail is the entire reason p99 exists as a metric.

A Thorn generates latency by sampling from a log-normal distribution using the Box-Muller transform:

```ts
function logNormalLatency(mu: number, sigma: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(mu + sigma * z);
}
```

This matters because it makes the dashboard *honest*. If you simulate with a normal distribution, your p50 and p99 sit almost on top of each other and the percentile chart is boring and unrealistic. With a log-normal model, p99 visibly diverges from the median, the heatmap develops a believable tail, and a simulated latency spike actually looks like an incident. You can't demonstrate that you understand observability if your fake data doesn't behave like real data.

Each of the four simulated services — `api-gateway`, `user-svc`, `payment-svc`, `search-svc` — has its own latency profile tuned to realistic median response times and variance, so the dashboard reads differently depending on which service is under load.

## Zero-copy transfer with Float32Arrays

Here's where the performance engineering gets real. Every frame, the worker needs to ship aggregated time-series data to the main thread. The naive approach — `postMessage({ data: [...] })` — structured-clones the payload, which means a full serialize/deserialize round trip on every frame. At 60fps that's a measurable, frame-dropping cost.

Instead, A Thorn packs aggregates into `Float32Array` buffers and **transfers** them:

```ts
const p50 = new Float32Array(cols);
const p95 = new Float32Array(cols);
// ...fill with percentile data...

self.postMessage(frame, [
  frame.heatmap.values.buffer,
  frame.percentiles.p50.buffer,
  frame.percentiles.p95.buffer,
  frame.percentiles.p99.buffer,
  frame.throughput.spansPerSec.buffer,
  frame.throughput.errorsPerSec.buffer,
]);
```

The second argument is the transfer list. Instead of copying the underlying `ArrayBuffer`, the browser hands ownership to the main thread — a pointer move, not a memcpy. The buffer is neutered on the worker side afterward, so the worker allocates fresh ones next tick. For a dashboard pushing six arrays per frame at 60fps, zero-copy transfer is the difference between smooth and stuttering.

This is the kind of detail that separates "I've used Web Workers" from "I understand the memory model of Web Workers."

## uPlot + Canvas for the visuals

For charting I chose [uPlot](https://github.com/leeoniya/uPlot), which is built on Canvas and is almost aggressively fast — it can render hundreds of thousands of points without breaking a sweat, and its memory footprint is tiny. SVG-based libraries (D3-with-DOM-nodes, Recharts) fall over at this data density because every point becomes a DOM node.

A Thorn uses uPlot for the percentile chart (p50/p95/p99 over time) and the throughput chart (requests/s + errors/s). The **heatmap** is hand-rolled on a raw `<canvas>` — uPlot doesn't do heatmaps, and writing it directly gives full control over the latency-bucket-by-time-bucket color mapping. Each cell's color is driven by event density within that latency band, producing that classic "where's the tail living right now" view.

```ts
ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // DPR-aware rendering
// ...for each cell, compute color based on normalized density...
ctx.fillStyle = interpolateDensity(v);
ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
```

The color scale runs through a five-stop gradient — deep blue → blue → yellow → orange → red — so low-density cells recede into the background while hot cells (high latency, high count) demand attention immediately.

Going down to raw Canvas for one component and using a library for the rest is a deliberate tradeoff: use the fast abstraction where it fits, drop to the metal where it doesn't.

## Linked brushing across charts

A dashboard where charts don't talk to each other is just a wall of unrelated graphs. A Thorn links them. Using uPlot's built-in cursor `sync` feature, hovering on the percentile chart moves the cursor on the throughput chart at the same timestamp. Selecting a time range with a brush triggers `setSelect` on the linked plots, so a drag on one chart narrows all of them to the same window.

The `setSelect` hook guards against feedback loops — only user-initiated interactions (checked via `u.cursor.event`) trigger the brush, so programmatic scale changes don't ripple back and cause infinite loops:

```ts
hooks: {
  setSelect: [
    (u) => {
      if (!u.cursor.event) return;         // ignore programmatic
      if (u.select.width <= 0) return;      // no selection
      const t0 = u.data[0][leftIdx];
      const t1 = u.data[0][rightIdx];
      setWindow({ startMs: t0 * 1000, endMs: t1 * 1000, follow: false });
      setFollow(false);
    },
  ],
},
```

This is the small touch that makes a dashboard feel like a real tool instead of a demo. When you're investigating an incident — "what was throughput doing during that latency spike" — it's a single gesture, not a manual eyeball-correlation across two graphs.

## The heatmap-to-drill-down pipeline

The most fun piece is the drill-down. The heatmap shows aggregate cells, but each cell hides individual events. Click a cell and you want the raw requests that landed in that latency-band/time-bucket.

Because the raw events live in the worker, this is a request/response over the message channel — a tiny `queryCell` protocol:

```ts
// Main thread
worker.postMessage({
  type: "query_cell",
  queryId: qid,
  timeRange: [tLo, tHi],
  latencyRange: [latLo, latHi],
});

// Worker replies
self.postMessage({
  type: "cell_result",
  queryId: msg.queryId,
  count: result.totalCount,
  spans: result.spans,
});
```

The main thread fires a query keyed by the clicked cell's bucket edges, the worker filters its retained ring buffer (100k events, newest-first with early-break), and up to 100 matching requests come back to populate a drill-down table. The store discards stale responses by tracking an incrementing `queryId` counter — if a slow response arrives after a newer query, it's silently dropped.

It's a miniature version of exactly what a real observability backend does: aggregate for the overview, retain detail for the drill-down, and serve detail on demand. Building it end-to-end — even in a single tab — teaches you the shape of the real problem.

## A theme that doesn't look like a school project

Visual polish is part of the pitch. A Thorn's dark theme is built on a small set of design tokens sourced from a Figma Make export — a near-black layered background, restrained accent colors, semantic latency colors (green → amber → red) that stay legible against the dark canvas, and consistent spacing/typography scales. The tokens live in a `:root` block and feed both the CSS and the Canvas color logic, so the heatmap and the chrome agree on what "p99 is bad" looks like.

## Why this demonstrates real frontend depth

Frontend interviews too often reduce to "build a to-do list" and "center this div." A Thorn is a deliberate argument that frontend engineering has a systems dimension:

- **Web Workers** used as an architectural boundary, not an afterthought.
- **The browser memory model**, exercised through transferable objects and zero-copy semantics.
- **Performance engineering** — sustaining a render loop under load, choosing Canvas over DOM at the right data density.
- **Protocol design** between threads, with a real typed query/response channel that handles stale responses.
- **Statistical modeling** — using log-normal distributions to simulate realistic system behavior.

None of that shows up when you reach for Grafana.

## Bridging frontend and platform engineering

I built A Thorn partly as a portfolio piece and partly as a bridge. The skills that observability and platform companies care about — understanding percentiles and tail latency, thinking about ingestion and aggregation as distinct stages, reasoning about throughput and backpressure — aren't separate from frontend; they live right at the seam where the UI meets the data plane.

This project sits exactly on that seam. It says: I can build the interface *and* I understand what it's visualizing, because I built the thing generating the data, the thing aggregating it, and the thing drawing it. If you're hiring for the frontend of a platform product, that combination is the whole point.

That's the flex. Not that I avoided Grafana — that I understand what Grafana is doing well enough to have built a small, honest version of it myself.
