import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const NODE_TYPES = new Set([
	"Lingzhi_Local_LLM_App",
	"LZ-Lingzhi_Local_LLM_App",
]);
const MODEL_DIR_WIDGET = "模型目录";
const MODEL_SELECT_WIDGET = "模型选择";
const MODEL_LIST_WIDGET = "可用模型列表";
const MODEL_LIST_ENDPOINT = "/lingzhi/local_llm/models";

function findWidget(node, name) {
	return node.widgets?.find((widget) => widget.name === name);
}

function normalizeModelDirectory(value) {
	let text = String(value ?? "").trim();
	if (
		text.length >= 2 &&
		text[0] === text[text.length - 1] &&
		(text[0] === '"' || text[0] === "'")
	) {
		text = text.slice(1, -1).trim();
	}
	return text;
}

function setWidgetValue(widget, value) {
	widget.value = value;
	if (widget.inputEl) {
		widget.inputEl.value = value;
	}
}

function updateComboValues(widget, values) {
	widget.options = widget.options || {};
	widget.options.values = values;
	if (widget.comboEl) {
		widget.comboEl.options.length = 0;
		for (const value of values) {
			widget.comboEl.add(new Option(value, value));
		}
	}
}

async function refreshLocalModels(node) {
	if (node.__lingzhiLocalModelsFetching) {
		return;
	}
	const directoryWidget = findWidget(node, MODEL_DIR_WIDGET);
	const selectionWidget = findWidget(node, MODEL_SELECT_WIDGET);
	const listWidget = findWidget(node, MODEL_LIST_WIDGET);
	if (!directoryWidget || !selectionWidget || !listWidget) {
		return;
	}

	node.__lingzhiLocalModelsFetching = true;
	try {
		const response = await api.fetchApi(MODEL_LIST_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model_dir: normalizeModelDirectory(directoryWidget.value),
			}),
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data?.error || `模型列表获取失败：HTTP ${response.status}`);
		}

		const models = Array.isArray(data.models) ? data.models.filter(Boolean) : [];
		const options = models.length ? models : [""];
		updateComboValues(listWidget, options);

		const current = String(selectionWidget.value || "");
		const nextValue = models.includes(current) ? current : models[0] || "";
		setWidgetValue(selectionWidget, nextValue);
		listWidget.value = nextValue;
		node.setDirtyCanvas?.(true, true);
	} catch (error) {
		console.warn("[Lingzhi-本地模型列表] 获取模型列表失败", error);
	} finally {
		node.__lingzhiLocalModelsFetching = false;
	}
}

function setupLocalModelList(node) {
	if (!node || node.__lingzhiLocalModelsReady) {
		return;
	}
	const directoryWidget = findWidget(node, MODEL_DIR_WIDGET);
	const selectionWidget = findWidget(node, MODEL_SELECT_WIDGET);
	if (!directoryWidget || !selectionWidget) {
		return;
	}

	node.__lingzhiLocalModelsReady = true;
	const current = String(selectionWidget.value || "");
	let listWidget = findWidget(node, MODEL_LIST_WIDGET);
	if (!listWidget) {
		listWidget = node.addWidget(
			"combo",
			MODEL_LIST_WIDGET,
			current,
			(value) => setWidgetValue(selectionWidget, value),
			{ values: current ? [current] : [""] },
		);
		listWidget.serialize = false;
	}
	listWidget.name = MODEL_LIST_WIDGET;
	listWidget.label = MODEL_LIST_WIDGET;
	if (listWidget.options) {
		listWidget.options.label = MODEL_LIST_WIDGET;
	}

	const originalCallback = directoryWidget.callback;
	directoryWidget.callback = function () {
		const result = originalCallback?.apply(this, arguments);
		clearTimeout(node.__lingzhiLocalModelsTimer);
		node.__lingzhiLocalModelsTimer = setTimeout(
			() => refreshLocalModels(node),
			400,
		);
		return result;
	};

	setTimeout(() => refreshLocalModels(node), 100);
}

app.registerExtension({
	name: "Lingzhi.LocalLlmModelList",
	async setup(comfyApp) {
		if (comfyApp.__lingzhiLocalModelListStarted) {
			return;
		}
		comfyApp.__lingzhiLocalModelListStarted = true;
		const scan = () => {
			for (const node of comfyApp.graph?._nodes || []) {
				setupLocalModelList(node);
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
			setupLocalModelList(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
			setTimeout(() => refreshLocalModels(this), 100);
			return result;
		};
	},
});