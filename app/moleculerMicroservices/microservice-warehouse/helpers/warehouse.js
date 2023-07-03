const { v4: uuidv4 } = require("uuid");

const orders = [];
const registro = [];

function registerChange(order) {
	const registroObj = {
		id: uuidv4(),
		user: order.user,
		productName: order.productName,
		quantity: order.type === "in" ? +order.quantity : -order.quantity,
		order: order.id,
	};
	registro.push(registroObj);
}

async function updateStock(order) {
	const product = orders.find((el) => el.productName === order.productName);

	if (product) {
		if (order.type === "in") {
			product.stock += order.quantity;
			registerChange(order);
			return confirmJSON(order, product);
		} else {
			if (product.stock >= order.quantity) {
				product.stock -= order.quantity;
				registerChange(order);
				return confirmJSON(order, product);
			} else {
				return rejectJSON(order, product);
			}
		}
	} else {
		if (order.type === "in") {
			const productObj = {
				id: uuidv4(),
				productName: order.productName,
				stock: order.quantity,
			};
			orders.push(productObj);
			registerChange(order);

			return confirmJSON(order, productObj);
		} else {
			return rejectJSON(order, { stock: 0 });
		}
	}
}

function listProduct(id) {
	if (!id) return { products: orders };
	return orders.find((order) => order.id === id);
}

function confirmJSON(order, product) {
	return {
		ok: 1,
		message: "Stock updated",
		data: {
			productName: order.productName,
			stock: product.stock,
			orderId: order.id,
			sid: order.sid,
		},
	};
}

function rejectJSON(order, product) {
	return {
		ok: 0,
		message: "Not enough stock",
		data: {
			productName: order.productName,
			stock: product.stock,
			quantity: order.quantity,
			orderId: order.id,
			sid: order.sid,
		},
	};
}

module.exports = {
	updateStock,
	listProduct,
};
