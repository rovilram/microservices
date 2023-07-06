"use strict";
const warehouseHelper = require("../helpers/warehouse");
const OpenTelemetry = require("../mixins/opentelemetry");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema Moleculer's Service Schema
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "warehouse",
	mixins: [OpenTelemetry],
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
		add: {
			async handler(ctx) {
				this.updateStock(ctx);
				return { ok: 1, order: ctx.params.order };
			},
		},
	},

	/**
	 * Events
	 */
	events: {
		"order.new": {
			async handler(ctx) {
				const resp = await warehouseHelper.updateStock(
					ctx.params.order
				);
				ctx.emit("stock.updated", { ...resp });
			},
		},
	},

	/**
	 * Methods
	 */
	methods: {
		async updateStock(ctx) {
			const resp = await warehouseHelper.updateStock(ctx.params.order);
			ctx.trace.emit("stock.updated", { ...resp });
		},
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {},

	/**
	 * Service started lifecycle event handler
	 */
	async started() {},

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {},
};
