const { api } = require("@opentelemetry/sdk-node");
const {
	SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");

const tracer = api.trace.getTracer("moleculer");

module.exports = {
	hooks: {
		before: {
			"*": [
				async function addToContext(ctx) {
					ctx.trace = {
						emit: function (event, ...args) {
							const parentContext = api.context.active();
							const span = tracer.startSpan(
								`EVENT call ${ctx.action.name}`,
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
								ctx.action.service.fullName
							);

							const spanContext = api.trace.setSpan(
								api.context.active(),
								span
							);
							ctx.meta.$otel = {};
							api.propagation.inject(spanContext, ctx.meta.$otel);

							api.context.with(spanContext, () => {
								span.end();
							});
							ctx.emit(event, ...args);
						},
					};
				},
			],
		},
	},
};
