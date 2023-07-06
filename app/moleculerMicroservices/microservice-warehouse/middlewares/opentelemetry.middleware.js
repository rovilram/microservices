const _ = require("lodash");
const { tracing, node, resources, api } = require("@opentelemetry/sdk-node");
const { registerInstrumentations } = require("@opentelemetry/instrumentation");
const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
const {
	B3Propagator,
	B3InjectEncoding,
} = require("@opentelemetry/propagator-b3");
const {
	SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");
const { isFunction, isPlainObject, safetyObject } = require("moleculer").Utils;
const {
	OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const { MeterProvider } = require("@opentelemetry/sdk-metrics");
const { HostMetrics } = require("@opentelemetry/host-metrics");

//metrics
const metricsExporter = new PrometheusExporter({
	port: 3030,
	prefix: "warehouse",
});
const meterProvider = new MeterProvider({});
meterProvider.addMetricReader(metricsExporter);
const meter = meterProvider.getMeter("example-prometheus");

const hostMetrics = new HostMetrics({
	meterProvider,
});

hostMetrics.start();

//tracing
const traceExporter = new OTLPTraceExporter({
	url: "http://jaeger:4318/v1/traces",
});
const provider = new node.NodeTracerProvider({
	resource: new resources.Resource({
		[SemanticResourceAttributes.SERVICE_NAME]: "warehouse",
		[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: "dev",
	}),
});

// Configure span processor to send spans to the exporter
provider.addSpanProcessor(
	new tracing.SimpleSpanProcessor(new tracing.ConsoleSpanExporter())
);
provider.addSpanProcessor(new tracing.BatchSpanProcessor(traceExporter));
provider.register({
	propagator: new B3Propagator({
		injectEncoding: B3InjectEncoding.MULTI_HEADER,
	}),
});

registerInstrumentations({
	instrumentations: [new HttpInstrumentation()],
	//tracerProvider: tracerProvider, // optional, only if global TracerProvider shouldn't be used
	//meterProvider: meterProvider, // optional, only if global MeterProvider shouldn't be used
});

const tracer = api.trace.getTracer("warehouse");

module.exports = {
	name: "OpenTelemetryMiddleware",

	localAction(handler, action) {
		let opts = action.tracing;
		if (opts === true || opts === false) opts = { enabled: !!opts };
		opts = _.defaultsDeep({}, opts, { enabled: true });

		if (opts.enabled) {
			return function tracingLocalActionMiddleware(ctx) {
				// Get the active span
				let parentCtx;
				const parentSpan = api.trace.getSpan(api.context.active());
				parentCtx = api.trace.setSpan(api.context.active(), parentSpan);
				if (!parentSpan && ctx.meta.$otel) {
					parentCtx = api.propagation.extract(
						parentCtx,
						ctx.meta.$otel
					);
					delete ctx.meta.$otel;
				}

				let tags = {
					callingLevel: ctx.level,
					action: ctx.action
						? { name: ctx.action.name, rawName: ctx.action.rawName }
						: null,
					remoteCall: ctx.nodeID !== ctx.broker.nodeID,
					callerNodeID: ctx.nodeID,
					nodeID: ctx.broker.nodeID,
					options: {
						timeout: ctx.options.timeout,
						retries: ctx.options.retries,
					},
					requestID: ctx.requestID,
				};
				const globalActionTags = {}; //tracer.opts.tags.action;
				let actionTags;
				// local action tags take precedence
				if (isFunction(opts.tags)) {
					actionTags = opts.tags;
				} else if (!opts.tags && isFunction(globalActionTags)) {
					actionTags = globalActionTags;
				} else {
					// By default all params are captured. This can be overridden globally and locally
					actionTags = {
						...{ params: true },
						...globalActionTags,
						...opts.tags,
					};
				}

				if (isFunction(actionTags)) {
					const res = actionTags.call(ctx.service, ctx);
					if (res) Object.assign(tags, res);
				} else if (isPlainObject(actionTags)) {
					if (actionTags.params === true)
						tags.params =
							ctx.params != null && isPlainObject(ctx.params)
								? Object.assign({}, ctx.params)
								: ctx.params;
					else if (Array.isArray(actionTags.params))
						tags.params = _.pick(ctx.params, actionTags.params);

					if (actionTags.meta === true)
						tags.meta =
							ctx.meta != null
								? Object.assign({}, ctx.meta)
								: ctx.meta;
					else if (Array.isArray(actionTags.meta))
						tags.meta = _.pick(ctx.meta, actionTags.meta);
				}

				if (opts.safetyTags) {
					tags = safetyObject(tags);
				}

				let spanName = `action '${ctx.action.name}'`;
				if (opts.spanName) {
					switch (typeof opts.spanName) {
						case "string":
							spanName = opts.spanName;
							break;
						case "function":
							spanName = opts.spanName.call(ctx.service, ctx);
							break;
					}
				}

				const span = tracer.startSpan(
					spanName,
					{ attributes: tags, kind: api.SpanKind.CONSUMER },
					parentCtx
				);
				span.setAttribute(
					SemanticResourceAttributes.SERVICE_NAME,
					action.service.fullName
				);
				const spanContext = api.trace.setSpan(
					api.context.active(),
					span
				);
				return api.context.with(spanContext, () => {
					// Call the handler
					return handler(ctx)
						.then((res) => {
							span.setAttribute("fromCache", ctx.cachedResult);

							if (isFunction(actionTags)) {
								const r = actionTags.call(
									ctx.service,
									ctx,
									res
								);
								if (r) Object.assign(tags, r);
							} else if (isPlainObject(actionTags)) {
								if (actionTags.response === true)
									tags.response =
										res != null && isPlainObject(res)
											? Object.assign({}, res)
											: res;
								else if (Array.isArray(actionTags.response))
									tags.response = _.pick(
										res,
										actionTags.response
									);
							}

							Object.keys(tags).forEach((k) =>
								span.setAttribute(k, tags[k])
							);
							span.end();

							return res;
						})
						.catch((err) => {
							span.recordException(err);
							span.setStatus({ code: api.SpanStatusCode.ERROR });

							throw err;
						});
				});
			}.bind(this);
		}

		return handler;
	},

	remoteAction(handler, action) {
		return (ctx) => {
			const parentContext = api.context.active();
			const span = tracer.startSpan(
				`remote call ${ctx.action.name}`,
				{
					attributes: {
						action: {
							name: ctx.action.name,
						},
						nodeID: ctx.nodeID,
					},
					kind: api.SpanKind.PRODUCER,
				},
				parentContext
			);
			span.setAttribute(
				SemanticResourceAttributes.SERVICE_NAME,
				action.service.fullName
			);

			const spanContext = api.trace.setSpan(api.context.active(), span);
			ctx.meta.$otel = {};
			api.propagation.inject(spanContext, ctx.meta.$otel);

			return api.context.with(spanContext, () => {
				// Call the handler
				return handler(ctx)
					.then((res) => {
						span.end();
						return res;
					})
					.catch((err) => {
						span.recordException(err);
						span.setStatus({ code: api.SpanStatusCode.ERROR });
						throw err;
					});
			});
		};
	},
};
