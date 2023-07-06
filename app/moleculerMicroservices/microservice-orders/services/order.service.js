"use strict";

const orderHelper = require("../helpers/order");

const { api } = require("@opentelemetry/sdk-node");
const {
	SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");

const tracer = api.trace.getTracer("moleculer");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema Moleculer's Service Schema
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "order",

	/**
	 * Settings
	 */
	settings: {},

	/**
	 * Dependencies
	 */
	dependencies: [],

	/**
	 * Actions
	 */
	actions: {
		/**
		 * Add an order
		 * @params user
		 * @params quantity
		 * @params type
		 * @params productName
		 *
		 * @returns order
		 */
		add: {
			rest: {
				method: "POST",
				path: "/",
			},
			params: {
				user: { type: "email" },
				quantity: {
					type: "number",
					interger: "true",
					positive: "true",
				},
				type: { type: "string", enum: ["in", "out"] },
				productName: { type: "string" },
				sid: { type: "string" },
				$$strict: true,
			},
			async handler(ctx) {
				const order = await orderHelper.add({
					...ctx.params,
					id: ctx.meta.id,
				});
				// this.broker.emit("order.new", order);
				ctx.call("warehouse.add", order);
				return { ok: 1, order };
			},
		},
		list: {
			rest: {
				method: "GET",
				path: "/",
			},
			async handler() {
				return orderHelper.list();
			},
		},
		listOrder: {
			rest: {
				method: "GET",
				path: "/:id",
			},
			params: {
				id: { type: "string" },
			},
			async handler(ctx) {
				return orderHelper.list(ctx.params.id);
			},
		},
	},

	/**
	 * Events
	 */
	events: {
		"stock.updated": {
			async handler(ctx) {
				const input = {};
				let parentContext = api.propagation.extract(
					api.context.active(),
					input
				);

				const span = tracer.startSpan(
					"EVENT LISTENER stock.updated",
					{
						attributes: {
							action: {
								name: this.name,
							},
							nodeID: ctx.nodeID,
						},
						kind: api.SpanKind.PRODUCER,
					},
					parentContext
				);
				span.setAttribute(
					SemanticResourceAttributes.SERVICE_NAME,
					this.name
				);

				const spanContext = api.trace.setSpan(
					api.context.active(),
					span
				);
				ctx.meta.$otel = {};
				api.propagation.inject(spanContext, ctx.meta.$otel);
				const { ok } = ctx.params;
				const { orderId, sid, productName, stock } = ctx.params.data;

				if (ok) {
					this.setOrderStatus(orderId, "confirmed", sid);
					this.broker.metrics.set("product.stock.total", stock, {
						product: productName,
					});
					span.end();
				} else {
					this.setOrderStatus(orderId, "rejected", sid);
					this.broker.metrics.increment(
						"product.insuffient.stock.error.total",
						{
							product: productName,
						}
					);
					span.end();
				}
			},
		},
	},

	/**
	 * Methods
	 */
	methods: {
		setOrderStatus(id, status, sid) {
			const resp = orderHelper.setStatus(id, status);
			if (resp) {
				this.broker.emit("order.status", { id, status, sid });
			}
		},
	},

	/**
	 * Service created lifecycle event handler
	 */
	// created() {},

	/**
	 * Service started lifecycle event handler
	 */
	async started() {},

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {},
};
