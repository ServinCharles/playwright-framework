import fs from 'fs';
import path from 'path';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import {
  SpanStatusCode,
  context,
  trace,
  type Attributes,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

/** One finished span as written to the JSONL file the dashboard reads. */
export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startMs: number;
  durationMs: number;
  ok: boolean;
  attributes: Record<string, string | number | boolean>;
}

export function toRecord(span: ReadableSpan): SpanRecord {
  const attributes: SpanRecord['attributes'] = {};
  for (const [key, value] of Object.entries(span.attributes)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attributes[key] = value;
    }
  }
  return {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    parentSpanId: span.parentSpanContext?.spanId,
    name: span.name,
    startMs: span.startTime[0] * 1000 + span.startTime[1] / 1e6,
    durationMs: span.duration[0] * 1000 + span.duration[1] / 1e6,
    ok: span.status.code !== SpanStatusCode.ERROR,
    attributes,
  };
}

/** Appends one JSON line per span. Simple to read, grep and chart. */
export class JsonlSpanExporter implements SpanExporter {
  constructor(private readonly file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  export(spans: ReadableSpan[], done: (result: ExportResult) => void): void {
    try {
      fs.appendFileSync(this.file, spans.map((s) => JSON.stringify(toRecord(s))).join('\n') + '\n');
      done({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      done({ code: ExportResultCode.FAILED, error: error as Error });
    }
  }

  async shutdown(): Promise<void> {}
}

let tracer: Tracer = trace.getTracer('playwright-ai-framework');
let provider: BasicTracerProvider | undefined;
let contextReady = false;

export interface TracingHandle {
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Turn tracing on. Pass your own exporters (tests use an in-memory one), or let
 * initTracingFromEnv pick them from environment variables.
 */
export function initTracing(
  exporters: SpanExporter[],
  options: { batch?: boolean } = {},
): TracingHandle {
  if (!contextReady) {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    contextReady = true;
  }
  const processors: SpanProcessor[] = exporters.map((exporter) =>
    options.batch ? new BatchSpanProcessor(exporter) : new SimpleSpanProcessor(exporter),
  );
  const next = new BasicTracerProvider({ spanProcessors: processors });
  provider = next;
  tracer = next.getTracer('playwright-ai-framework');
  return {
    flush: () => next.forceFlush(),
    shutdown: async () => {
      await next.shutdown();
      if (provider === next) {
        provider = undefined;
        tracer = trace.getTracer('playwright-ai-framework');
      }
    },
  };
}

/**
 *   TRACE_FILE=reports/traces/spans.jsonl   write spans to a file (feeds the dashboard)
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   send to Jaeger, Grafana, Langfuse, etc.
 * With neither set, tracing stays off and costs nothing.
 */
export function initTracingFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TracingHandle | undefined {
  const exporters: SpanExporter[] = [];
  if (env.TRACE_FILE) exporters.push(new JsonlSpanExporter(path.resolve(env.TRACE_FILE)));
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    exporters.push(
      new OTLPTraceExporter({
        url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`,
      }),
    );
  }
  return exporters.length > 0 ? initTracing(exporters, { batch: true }) : undefined;
}

/** Names of errors that are control flow, not failures (LangGraph uses one to pause for approval). */
const CONTROL_FLOW = /^(GraphInterrupt|NodeInterrupt|GraphBubbleUp)$/;

/**
 * Run fn inside a span. Child spans started inside fn (even after an await) attach to it.
 * Never put customer text or secrets in attributes. Record sizes, names and outcomes only.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      const err = error as Error;
      if (!CONTROL_FLOW.test(err.name)) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      } else {
        span.setAttribute('paused', true);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
