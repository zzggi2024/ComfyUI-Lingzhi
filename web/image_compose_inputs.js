import { app } from "/scripts/app.js";

const NODE_TYPES = new Set([
	"Lingzhi_ImageCompose",
	"LZ-Lingzhi_ImageCompose",
]);
const LIST_INPUT = "列表输入";
const IMAGE_PREFIX = "image_";
const TOTAL_WIDGET = "列表总数";
const HORIZONTAL_WIDGET = "横向";
const HORIZONTAL_MAX_WIDGET = "横向最大数";
const VERTICAL_WIDGET = "竖向";
const VERTICAL_MAX_WIDGET = "竖向最大数";

function findInput(node, name) {
	return node.inputs?.find((input) => input?.name === name);
}

function findWidget(node, name) {
	return node.widgets?.find((widget) => widget?.name === name);
}

function imageInputs(node) {
	return (node.inputs || []).filter((input) =>
		String(input?.name || "").startsWith(IMAGE_PREFIX),
	);
}

function isLinked(input) {
	return input?.link !== null && input?.link !== undefined && input?.link !== -1;
}

function setWidgetDisabled(widget, disabled) {
	if (!widget) {
		return;
	}
	widget.disabled = disabled;
	widget.options = widget.options || {};
	widget.options.disabled = disabled;
	widget.options.readOnly = disabled;
}

function syncInputMode(node) {
	if (!node?.inputs) {
		return;
	}
	const listInput = findInput(node, LIST_INPUT);
	const images = imageInputs(node);
	const listConnected = isLinked(listInput);
	const imageConnected = images.some(isLinked);

	if (listInput && listInput.disabled !== imageConnected) {
		listInput.disabled = imageConnected;
	}
	for (const input of images) {
		const disabled = listConnected;
		if (input.disabled !== disabled) {
			input.disabled = disabled;
		}
	}

	const totalWidget = findWidget(node, TOTAL_WIDGET);
	if (totalWidget) {
		setWidgetDisabled(totalWidget, !listConnected);
	}

	const horizontalWidget = findWidget(node, HORIZONTAL_WIDGET);
	const horizontalMaxWidget = findWidget(node, HORIZONTAL_MAX_WIDGET);
	if (horizontalWidget && horizontalMaxWidget) {
		setWidgetDisabled(horizontalMaxWidget, !horizontalWidget.value);
	}

	const verticalWidget = findWidget(node, VERTICAL_WIDGET);
	const verticalMaxWidget = findWidget(node, VERTICAL_MAX_WIDGET);
	if (verticalWidget && verticalMaxWidget) {
		setWidgetDisabled(verticalMaxWidget, !verticalWidget.value);
	}

	node.setDirtyCanvas?.(true, true);
}

function setupInputMode(node) {
	if (!node || node.__lingzhiImageComposeInputsReady) {
		return;
	}
	node.__lingzhiImageComposeInputsReady = true;
	syncInputMode(node);
}

app.registerExtension({
	name: "Lingzhi.ImageComposeInputs",
	async setup(comfyApp) {
		if (comfyApp.__lingzhiImageComposeInputsStarted) {
			return;
		}
		comfyApp.__lingzhiImageComposeInputsStarted = true;
		const scan = () => {
			for (const node of comfyApp.graph?._nodes || []) {
				setupInputMode(node);
				syncInputMode(node);
			}
		};
		setTimeout(scan, 100);
		window.setInterval(scan, 1000);
	},
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (!NODE_TYPES.has(nodeData.name)) {
			return;
		}

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
			setupInputMode(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
			setTimeout(() => syncInputMode(this), 50);
			return result;
		};

		const onConnectionsChange = nodeType.prototype.onConnectionsChange;
		nodeType.prototype.onConnectionsChange = function () {
			const result = onConnectionsChange
				? onConnectionsChange.apply(this, arguments)
				: undefined;
			setTimeout(() => syncInputMode(this), 50);
			return result;
		};

		const onWidgetChanged = nodeType.prototype.onWidgetChanged;
		nodeType.prototype.onWidgetChanged = function () {
			const result = onWidgetChanged
				? onWidgetChanged.apply(this, arguments)
				: undefined;
			syncInputMode(this);
			return result;
		};

		const onConnectInput = nodeType.prototype.onConnectInput;
		nodeType.prototype.onConnectInput = function (inputIndex) {
			const input = this.inputs?.[inputIndex];
			if (input?.disabled) {
				return false;
			}
			return onConnectInput
				? onConnectInput.apply(this, arguments)
				: true;
		};
	},
});