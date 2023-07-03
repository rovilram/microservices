const orders = [];

async function add(order) {
	const orderObj = {
		status: "pending",
		created: Date.now(),
		...order,
	};
	orders.push(orderObj);
	return { order: orderObj };
}

function list(id) {
	if (!id) {
		return { orders };
	}
	return orders.find((order) => order.id === id);
}

function setStatus(id, status) {
	const order = orders.find((el) => el.id === id);
	if (!order) return false;
	order.status = status;
	return true;
}

module.exports = {
	add,
	list,
	setStatus,
};
