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
const GAP_COLOR_WIDGET = "间隔颜色";
const GAP_COLOR_OPTIONS = [
	{ name: "白色", value: "#FFFFFF" },
	{ name: "黑色", value: "#000000" },
	{ name: "浅灰", value: "#D9D9D9" },
	{ name: "深灰", value: "#4D4D4D" },
	{ name: "红色", value: "#E53935" },
	{ name: "橙色", value: "#FB8C00" },
	{ name: "黄色", value: "#FDD835" },
	{ name: "绿色", value: "#43A047" },
	{ name: "青色", value: "#00ACC1" },
	{ name: "蓝色", value: "#1E88E5" },
	{ name: "紫色", value: "#8E24AA" },
	{ name: "粉色", value: "#EC407A" },
];

function ensureGapColorStyles() {
	if (document.getElementById("lingzhi-image-compose-gap-color-style")) {
		return;
	}
	const style = document.createElement("style");
	style.id = "lingzhi-image-compose-gap-color-style";
	style.textContent = `
		.lingzhi-gap-color {
			display: flex;
			flex-direction: column;
			gap: 5px;
			width: 100%;
			height: 100%;
			box-sizing: border-box;
			padding: 2px 8px 6px;
			color: var(--fg-color, #ddd);
			font-size: 12px;
		}
		.lingzhi-gap-color-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			line-height: 16px;
		}
		.lingzhi-gap-color-current {
			color: var(--fg-color, #ddd);
			opacity: 0.72;
		}
		.lingzhi-gap-color-grid {
			display: grid;
			grid-template-columns: repeat(6, minmax(0, 1fr));
			gap: 5px;
		}
		.lingzhi-gap-color-option {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 27px;
			padding: 0;
			border: 1px solid transparent;
			border-radius: 6px;
			background: transparent;
			cursor: pointer;
		}
		.lingzhi-gap-color-option:hover {
			background: rgba(255, 255, 255, 0.08);
		}
		.lingzhi-gap-color-option.is-selected {
			border-color: #5dc770;
			background: rgba(93, 199, 112, 0.14);
		}
		.lingzhi-gap-color-swatch {
			width: 21px;
			height: 21px;
			border: 1px solid rgba(255, 255, 255, 0.34);
			border-radius: 4px;
			box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16);
			box-sizing: border-box;
		}
		.lingzhi-gap-color-option.is-selected .lingzhi-gap-color-swatch {
			box-shadow: 0 0 0 2px rgba(93, 199, 112, 0.3);
		}
	`;
	document.head.appendChild(style);
}

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

function syncGapColorPalette(node) {
	const palette = node?.__lingzhiImageComposeGapPalette;
	if (!palette) {
		return;
	}
	const selected = GAP_COLOR_OPTIONS.find(
		(option) => option.name === palette.widget.value,
	) || GAP_COLOR_OPTIONS[0];
	palette.current.textContent = selected.name;
	for (const button of palette.buttons) {
		const isSelected = button.dataset.colorName === selected.name;
		button.classList.toggle("is-selected", isSelected);
		button.setAttribute("aria-pressed", String(isSelected));
	}
}

function setupGapColorPalette(node) {
	if (node?.__lingzhiImageComposeGapPalette) {
		syncGapColorPalette(node);
		return;
	}
	const widget = findWidget(node, GAP_COLOR_WIDGET);
	if (!widget || typeof node.addDOMWidget !== "function") {
		return;
	}

	ensureGapColorStyles();
	widget.hidden = true;
	widget.computeSize = () => [0, -4];

	const root = document.createElement("div");
	root.className = "lingzhi-gap-color";
	root.addEventListener("pointerdown", (event) => event.stopPropagation());

	const header = document.createElement("div");
	header.className = "lingzhi-gap-color-header";
	const label = document.createElement("span");
	label.textContent = GAP_COLOR_WIDGET;
	const current = document.createElement("span");
	current.className = "lingzhi-gap-color-current";
	header.append(label, current);

	const grid = document.createElement("div");
	grid.className = "lingzhi-gap-color-grid";
	grid.setAttribute("role", "group");
	grid.setAttribute("aria-label", GAP_COLOR_WIDGET);
	const buttons = [];
	for (const option of GAP_COLOR_OPTIONS) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "lingzhi-gap-color-option";
		button.dataset.colorName = option.name;
		button.title = option.name;
		button.setAttribute("aria-label", option.name);
		const swatch = document.createElement("span");
		swatch.className = "lingzhi-gap-color-swatch";
		swatch.style.background = option.value;
		button.appendChild(swatch);
		button.addEventListener("click", () => {
			widget.value = option.name;
			widget.callback?.(option.name);
			syncGapColorPalette(node);
			node.setDirtyCanvas?.(true, true);
		});
		grid.appendChild(button);
		buttons.push(button);
	}
	root.append(header, grid);

	const domWidget = node.addDOMWidget(
		"间隔颜色色块",
		"lingzhi_image_compose_gap_color",
		root,
		{ serialize: false },
	);
	domWidget.serialize = false;
	domWidget.computeSize = (width) => [Math.max(Number(width) || 0, 280), 88];

	const originalCallback = widget.callback;
	widget.callback = function () {
		const result = originalCallback
			? originalCallback.apply(this, arguments)
			: undefined;
		syncGapColorPalette(node);
		return result;
	};

	node.__lingzhiImageComposeGapPalette = {
		widget,
		buttons,
		current,
		domWidget,
	};
	syncGapColorPalette(node);
	const computedSize = node.computeSize?.();
	if (
		Array.isArray(computedSize) &&
		Array.isArray(node.size) &&
		node.size[1] < computedSize[1]
	) {
		node.setSize?.([node.size[0], computedSize[1]]);
	}
}

function setupInputMode(node) {
	if (!node || node.__lingzhiImageComposeInputsReady) {
		return;
	}
	node.__lingzhiImageComposeInputsReady = true;
	syncInputMode(node);
	setupGapColorPalette(node);
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
				syncGapColorPalette(node);
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
			setTimeout(() => {
				syncInputMode(this);
				syncGapColorPalette(this);
			}, 50);
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
