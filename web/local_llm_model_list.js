import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const NODE_TYPES = new Set(["Lingzhi_Local_LLM_App"]);
const MODEL_WIDGET = "模型选择";
const FETCH_BUTTON = "获取模型列表";
const MODEL_LIST_ENDPOINT = "/lingzhi/local_llm/models";

function findWidget(node, name) {
	return node.widgets?.find((widget) => widget.name === name);
}

function normalizeNodeType(name) {
	return String(name || "").replace(/^LZ-/, "");
}

function isLocalModelNode(node) {
	return NODE_TYPES.has(normalizeNodeType(node?.comfyClass || node?.type));
}

function showMessage(message, duration = 2400) {
	if (app?.ui?.dialog?.show) {
		app.ui.dialog.show(message);
		setTimeout(() => app.ui.dialog.close(), duration);
		return;
	}
	alert(message);
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

async function refreshModels(node, options = {}) {
	const combo = findWidget(node, MODEL_WIDGET);
	if (!combo || node.__lingzhiLocalModelsFetching) {
		return;
	}

	node.__lingzhiLocalModelsFetching = true;
	try {
		const response = await api.fetchApi(MODEL_LIST_ENDPOINT, { method: "POST" });
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data?.error || `模型列表获取失败：HTTP ${response.status}`);
		}

		const models = Array.isArray(data.models) ? data.models.filter(Boolean) : [];
		updateComboValues(combo, models.length ? models : [""]);
		const current = String(combo.value || "");
		combo.value = models.includes(current) ? current : models[0] || "";
		node.setDirtyCanvas?.(true, true);

		if (!models.length) {
			const dirs = Array.isArray(data.scan_dirs) && data.scan_dirs.length
				? data.scan_dirs.join("、")
				: "ComfyUI 的 models/LLM";
			showMessage(`未找到 .gguf 模型（已扫描：${dirs}）`, 4000);
		} else if (!options.silent) {
			showMessage(`已发现 ${models.length} 个模型`);
		}
	} catch (error) {
		showMessage(String(error?.message || error), 4000);
		console.warn("[Lingzhi-本地模型列表] 获取模型列表失败", error);
	} finally {
		node.__lingzhiLocalModelsFetching = false;
	}
}

function setupLocalModels(node) {
	if (!isLocalModelNode(node) || node.__lingzhiLocalModelsReady) {
		return;
	}
	const combo = findWidget(node, MODEL_WIDGET);
	if (!combo) {
		return;
	}

	node.__lingzhiLocalModelsReady = true;

	const button = node.addWidget("button", FETCH_BUTTON, FETCH_BUTTON, () => {
		refreshModels(node);
	});
	button.name = FETCH_BUTTON;
	button.label = `⟳ ${FETCH_BUTTON}`;
	button.serialize = false;
	button.tooltip = "重新扫描 ComfyUI 的 models/LLM 目录";

	setTimeout(() => refreshModels(node, { silent: true }), 100);
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
				setupLocalModels(node);
			}
		};
		setTimeout(scan, 100);
		window.setInterval(scan, 1000);
	},
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (!NODE_TYPES.has(normalizeNodeType(nodeData.name))) {
			return;
		}

		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
			setupLocalModels(this);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
			setupLocalModels(this);
			setTimeout(() => refreshModels(this, { silent: true }), 100);
			return result;
		};
	},
});
