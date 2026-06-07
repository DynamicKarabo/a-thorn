package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Span is one simulated latency trace record.
type Span struct {
	TS        int64   `json:"ts"`
	Service   string  `json:"service"`
	Endpoint  string  `json:"endpoint"`
	LatencyMS float64 `json:"latency_ms"`
	Status    int     `json:"status"`
	TraceID   string  `json:"trace_id"`
}

type endpointModel struct {
	name  string
	mu    float64 // log-normal mu (log of median latency)
	sigma float64
}

type serviceModel struct {
	name      string
	endpoints []endpointModel
}

var (
	upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

	mSpans = promauto.NewCounter(prometheus.CounterOpts{
		Name: "thorn_spans_generated_total", Help: "Total spans generated.",
	})
	mClients = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "thorn_connected_clients", Help: "Currently connected WS clients.",
	})
	mBytes = promauto.NewCounter(prometheus.CounterOpts{
		Name: "thorn_frame_bytes_total", Help: "Total frame bytes written.",
	})
)

func logMu(medianMS float64) float64 { return math.Log(medianMS) }

func buildServices() []serviceModel {
	return []serviceModel{
		{"api-gateway", []endpointModel{
			{"GET /v1/route", logMu(80), 0.4}, {"POST /v1/auth", logMu(120), 0.5},
			{"GET /v1/health", logMu(50), 0.3}, {"POST /v1/proxy", logMu(200), 0.5},
		}},
		{"user-svc", []endpointModel{
			{"GET /users/:id", logMu(15), 0.4}, {"POST /users", logMu(40), 0.5},
			{"PATCH /users/:id", logMu(30), 0.4}, {"GET /users/search", logMu(50), 0.6},
		}},
		{"payment-svc", []endpointModel{
			{"POST /charge", logMu(350), 0.4}, {"POST /refund", logMu(450), 0.5},
			{"GET /balance", logMu(200), 0.4}, {"POST /capture", logMu(300), 0.5},
		}},
		{"search-svc", []endpointModel{
			{"GET /search", logMu(180), 0.5}, {"GET /suggest", logMu(100), 0.4},
			{"GET /index/:id", logMu(150), 0.5}, {"POST /reindex", logMu(300), 0.6},
		}},
	}
}

type injection struct {
	mu       sync.Mutex
	spikeTil time.Time
	errTil   time.Time
}

func (in *injection) trigger(kind string) {
	in.mu.Lock()
	defer in.mu.Unlock()
	now := time.Now()
	switch kind {
	case "spike":
		in.spikeTil = now.Add(5 * time.Second)
	case "error_burst":
		in.errTil = now.Add(5 * time.Second)
	}
}

func (in *injection) active() (spike, errBurst bool) {
	in.mu.Lock()
	defer in.mu.Unlock()
	now := time.Now()
	return now.Before(in.spikeTil), now.Before(in.errTil)
}

func genSpan(svcs []serviceModel, in *injection) Span {
	svc := svcs[rand.Intn(len(svcs))]
	ep := svc.endpoints[rand.Intn(len(svc.endpoints))]

	lat := math.Exp(ep.mu + ep.sigma*rand.NormFloat64())

	spikeWin, errWin := in.active()
	if spikeWin || rand.Float64() < 0.01 {
		lat *= 2 + rand.Float64()*3 // 2x–5x
	}
	status := 200
	errProb := 0.005
	if errWin {
		errProb = 0.4
	}
	if rand.Float64() < errProb {
		status = 500 + rand.Intn(4)
	}

	return Span{
		TS:        time.Now().UnixMilli(),
		Service:   svc.name,
		Endpoint:  ep.name,
		LatencyMS: lat,
		Status:    status,
		TraceID:   strconv.FormatUint(rand.Uint64(), 16),
	}
}

func encodeBinary(spans []Span) []byte {
	buf := make([]byte, 0, len(spans)*48)
	var hdr [4]byte
	binary.LittleEndian.PutUint32(hdr[:], uint32(len(spans)))
	buf = append(buf, hdr[:]...)

	putU16Str := func(s string) {
		var l [2]byte
		binary.LittleEndian.PutUint16(l[:], uint16(len(s)))
		buf = append(buf, l[:]...)
		buf = append(buf, s...)
	}
	for _, sp := range spans {
		var f [20]byte
		binary.LittleEndian.PutUint64(f[0:8], uint64(sp.TS))
		binary.LittleEndian.PutUint64(f[8:16], math.Float64bits(sp.LatencyMS))
		binary.LittleEndian.PutUint32(f[16:20], uint32(sp.Status))
		buf = append(buf, f[:]...)
		putU16Str(sp.Service)
		putU16Str(sp.Endpoint)
		putU16Str(sp.TraceID)
	}
	return buf
}

func main() {
	rate := flag.Int("rate", envInt("EMIT_RATE", 100), "spans per second")
	addr := flag.String("addr", envStr("ADDR", ":8080"), "listen address")
	jsonMode := flag.Bool("json", false, "send JSON frames instead of binary")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	svcs := buildServices()
	in := &injection{}

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/inject", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		kind := r.URL.Query().Get("type")
		if kind != "spike" && kind != "error_burst" {
			http.Error(w, "type must be spike|error_burst", http.StatusBadRequest)
			return
		}
		in.trigger(kind)
		slog.Info("anomaly injected", "type", kind)
		w.WriteHeader(http.StatusAccepted)
	})
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Error("upgrade failed", "err", err)
			return
		}
		mClients.Inc()
		defer func() { mClients.Dec(); _ = conn.Close() }()
		slog.Info("client connected", "remote", r.RemoteAddr)
		serveClient(r.Context(), conn, svcs, in, *rate, *jsonMode)
	})

	srv := &http.Server{Addr: *addr, Handler: mux}
	slog.Info("thorn span generator starting", "addr", *addr, "rate", *rate, "json", *jsonMode)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}

func serveClient(ctx context.Context, conn *websocket.Conn, svcs []serviceModel, in *injection, rate int, jsonMode bool) {
	const fps = 20
	perFrame := rate / fps
	if perFrame < 1 {
		perFrame = 1
	}
	ticker := time.NewTicker(time.Second / fps)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			spans := make([]Span, perFrame)
			for i := range spans {
				spans[i] = genSpan(svcs, in)
			}
			mSpans.Add(float64(perFrame))

			var (
				payload []byte
				typ     int
			)
			if jsonMode {
				payload, _ = json.Marshal(spans)
				typ = websocket.TextMessage
			} else {
				payload = encodeBinary(spans)
				typ = websocket.BinaryMessage
			}
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteMessage(typ, payload); err != nil {
				slog.Info("client write failed, dropping", "err", err)
				return
			}
			mBytes.Add(float64(len(payload)))
		}
	}
}

func envStr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
