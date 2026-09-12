import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const API_KEY_WIDGET = "API密钥";
const FETCH_BUTTON = "获取模型列表";
const MODEL_SELECT_WIDGET = "可用模型列表";
const FIXED_API_BASE = "https://api.zhijia88.vip";
const STORAGE_PREFIX = "Lingzhi.FixedApiModelList.v2";

const NODE_CONFIGS = {

	Lingzhi_APINode: { endpoint: "/lingzhi/test_api/models", modelWidget: "模型选择", defaults: ["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"] },
	Lingzhi_APINode_Batch: { endpoint: "/lingzhi/test_api/models", modelWidget: "模型选择", defaults: ["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"] },
	Lingzhi_GPT2Edits_Node: { endpoint: "/lingzhi/gpt_image/models", modelWidget: "模型选择", defaults: ["gpt-image-2", "gpt-image-2-all"] },
	Lingzhi_GPTImage2_Batch_Node: { endpoint: "/lingzhi/gpt_image/models", modelWidget: "模型选择", defaults: ["gpt-image-2", "gpt-image-2-all"] },

	Lingzhi_ConcurrentImageEdit_Sender: { endpoint: "/lingzhi/test_api/models", modelWidget: "模型选择", defaults: ["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"] },
	Lingzhi_GroupedConcurrentImageEdit: { endpoint: "/lingzhi/test_api/models", modelWidget: "模型选择", defaults: ["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"] },
	Lingzhi_Doubao_Image: { endpoint: "/lingzhi/doubao_image/models", modelWidget: "模型选择", defaults: ["doubao-seedream-5-0-260128", "doubao-seedream-4-0-250828", "doubao-seedream-4-5-251128"] },
	Lingzhi_Qwen_Image: { endpoint: "/lingzhi/qwen_image/models", modelWidget: "模型选择", defaults: ["LZ-qwen-image-3.0-pro"] },
	Lingzhi_Wan_Image: { endpoint: "/lingzhi/wan_image/models", modelWidget: "模型选择", defaults: ["LZ-wan2.7-image"] },

	Lingzhi_LLM_App: { endpoint: "/lingzhi/llm_test/models", modelWidget: "模型选择", defaults: ["gemini-2.5-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview", "gpt-5.4-mini"] },
	Lingzhi_Media_Reverse_Prompt: { endpoint: "/lingzhi/media_reverse/models", modelWidget: "模型名称", defaults: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview"] },
	Lingzhi_NanoBanana_Prompt: { endpoint: "/lingzhi/llm_test/models", modelWidget: "模型选择", defaults: ["gemini-2.5-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview"] },

	Lingzhi_Grok_Video: { endpoint: "/lingzhi/grok_video/models", modelWidget: "模型", defaults: ["grok-imagine-video-1.5-preview", "grok-imagine-1.0-video", "grok-imagine-1.0-video-20s", "grok-imagine-1.0-video-30s"] },


	Lingzhi_SD20_Video: { endpoint: "/lingzhi/sd20_video/models", modelWidget: "模型", defaults: ["doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128"] },
	Lingzhi_Seedance_Video: { endpoint: "/lingzhi/sd20_video/models", modelWidget: "模型", defaults: ["seedance-2.0-standard-t2v", "seedance-2.0-fast-t2v", "seedance-2.0-mini-t2v", "seedance-2.0-standard-i2v", "seedance-2.0-fast-i2v", "seedance-2.0-mini-i2v", "seedance-2.0-standard-multi", "seedance-2.0-fast-multi", "seedance-2.0-mini-multi", "seedance-2.0-global-standard-t2v", "seedance-2.0-global-fast-t2v", "seedance-2.0-global-mini-t2v", "seedance-2.0-global-standard-i2v", "seedance-2.0-global-fast-i2v", "seedance-2.0-global-mini-i2v", "seedance-2.0-global-standard-multi", "seedance-2.0-global-fast-multi", "seedance-2.0-global-mini-multi"] },

};

for (const [nodeName, config] of Object.entries(NODE_CONFIGS)) {
	NODE_CONFIGS[`LZ-${nodeName}`] = config;
}

let lastPointer = { x: window.innerWidth / 2, y: 72 };
window.addEventListener("pointerdown", (event) => {
	lastPointer = { x: event.clientX, y: event.clientY };
}, true);

function findWidget(node, name) {
	return node.widgets?.find((widget) => widget.name === name);
}

function showToast(message, isError = false) {
	const toast = document.createElement("div");
	toast.textContent = message;
	const left = Math.min(Math.max(lastPointer.x + 12, 12), window.innerWidth - 220);
	const top = Math.min(Math.max(lastPointer.y + 12, 12), window.innerHeight - 60);
	toast.style.cssText = [
		"position:fixed",
		`left:${left}px`,
		`top:${top}px`,
		"z-index:99999",
		"padding:8px 14px",
		"border-radius:8px",
		"font-size:13px",
		"color:#fff",
		`background:${isError ? "rgba(220,38,38,.94)" : "rgba(22,163,74,.94)"}`,
		"box-shadow:0 8px 24px rgba(0,0,0,.25)",
	].join(";");
	document.body.appendChild(toast);
	setTimeout(() => toast.remove(), 1000);
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

function getStorageKey(nodeTypeName) {
	return `${STORAGE_PREFIX}.${nodeTypeName}`;
}

function loadStoredModels(nodeTypeName) {
	try {
		const raw = localStorage.getItem(getStorageKey(nodeTypeName));
		const models = raw ? JSON.parse(raw) : [];
		return Array.isArray(models) ? models.filter(Boolean) : [];
	} catch (error) {
		console.warn("[Lingzhi-模型列表] 读取持久化模型列表失败", error);
		return [];
	}
}

function saveStoredModels(nodeTypeName, models) {
	const values = Array.from(new Set((models || []).filter(Boolean)));
	if (!values.length) {
		return;
	}
	localStorage.setItem(getStorageKey(nodeTypeName), JSON.stringify(values));
}


function setModelOptions(node, config, models, selectedValue) {

	const modelWidget = findWidget(node, config.modelWidget);
	const selectWidget = findWidget(node, MODEL_SELECT_WIDGET);
	const options = Array.from(new Set((models || []).filter(Boolean)));
	const values = options.length ? options : config.defaults;
	const currentModel = String(modelWidget?.value || "").trim();
	const selected = selectedValue || (currentModel && values.includes(currentModel) ? currentModel : values[0]);

	if (selectWidget) {
		updateComboValues(selectWidget, values);
		setWidgetValue(selectWidget, selected);
	}
	if (modelWidget && selected) {
		setWidgetValue(modelWidget, selected);
	}
}

function getLinkedWidgetValue(node, inputName) {
	const input = node.inputs?.find((item) => item.name === inputName);
	const linkId = input?.link;
	const graph = node?.graph || app.graph;
	const links = graph?.links;
	const link = linkId != null
		? (links instanceof Map ? (links.get(linkId) || links.get(String(linkId))) : links?.[linkId])
		: null;
	const sourceNode = link ? graph?.getNodeById?.(link.origin_id) : null;
	if (!sourceNode) {
		return "";
	}
	const widgets = sourceNode.widgets || [];
	const preferredNames = [inputName, "API密钥", "api_key", "API Key", "key", "value", "字符串", "文本"];
	for (const name of preferredNames) {
		const widget = widgets.find((item) => item.name === name);
		const value = String(widget?.value || "").trim();
		if (value) {
			return value;
		}
	}
	if (widgets.length === 1) {
		return String(widgets[0].value || "").trim();
	}
	return "";
}


function hasLinkedInput(node, name) {
	const input = node.inputs?.find((item) => item.name === name);
	return input?.link != null;
}

function getWidgetOrLinkedValue(node, name) {
	const linkedValue = hasLinkedInput(node, name) ? getLinkedWidgetValue(node, name) : "";
	if (linkedValue) {
		return linkedValue;
	}
	return String(findWidget(node, name)?.value || "").trim();
}


async function fetchModels(node, config, buttonWidget, nodeTypeName) {
	if (node.__lingzhiFetchingModels) {
		return;
	}
	const modelWidget = findWidget(node, config.modelWidget);

	const apiKey = getWidgetOrLinkedValue(node, API_KEY_WIDGET);
	if (!modelWidget) {
		showToast("请到后台查看具体错误", true);
		console.warn("[Lingzhi-模型列表] 未找到模型控件", config.modelWidget);
		return;
	}
	const oldName = buttonWidget.name;
	node.__lingzhiFetchingModels = true;
	buttonWidget.name = "正在获取...";
	node.setDirtyCanvas?.(true, true);


	try {
		const response = await api.fetchApi(config.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ api_key: apiKey, api_base: FIXED_API_BASE }),
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data?.error || `模型列表获取失败：HTTP ${response.status}`);
		}
		const models = Array.isArray(data.models) ? data.models.filter(Boolean) : [];
		if (!models.length) {
			throw new Error("请到后台查看具体错误");
		}
		saveStoredModels(nodeTypeName, models);

		setModelOptions(node, config, models, models[0]);
		showToast("模型更新成功");

	} catch (error) {
		showToast("请到后台查看具体错误", true);
		console.warn("[Lingzhi-模型列表]", error);
	} finally {
		node.__lingzhiFetchingModels = false;
		buttonWidget.name = oldName;
		node.setDirtyCanvas?.(true, true);
	}

}

function applyStoredModelOptions(node, config, nodeTypeName) {
	const storedModels = loadStoredModels(nodeTypeName);
	if (!storedModels.length) {
		return;
	}
	setModelOptions(node, config, storedModels);
}

function setupModelFetcher(node, config, nodeTypeName) {

	const modelWidget = findWidget(node, config.modelWidget);
	if (!modelWidget || node.__lingzhiFixedApiModelFetcherReady) {
		return;
	}
	node.__lingzhiFixedApiModelFetcherReady = true;
	const storedModels = loadStoredModels(nodeTypeName);

	const values = storedModels.length ? storedModels : config.defaults;
	const selected = modelWidget.value || values[0];
	setModelOptions(node, config, values, selected);

	const buttonWidget = node.addWidget("button", FETCH_BUTTON, null, () => fetchModels(node, config, buttonWidget, nodeTypeName));

	buttonWidget.serialize = false;
	const selectWidget = node.addWidget("combo", MODEL_SELECT_WIDGET, selected, (value) => {
		setWidgetValue(modelWidget, value);
	}, { values });
	selectWidget.serialize = false;
}

function getNodeConfig(node) {
	const nodeTypeName = node?.comfyClass || node?.type || "";
	return {
		nodeTypeName,
		config: NODE_CONFIGS[nodeTypeName],
	};
}



app.registerExtension({
	name: "Lingzhi.FixedApiModelList",
	async setup(comfyApp) {
		if (comfyApp.__lingzhiFixedApiModelListStarted) {
			return;
		}
		comfyApp.__lingzhiFixedApiModelListStarted = true;
		const scan = () => {
			for (const node of comfyApp.graph?._nodes || []) {
				const { nodeTypeName, config } = getNodeConfig(node);
				if (config) {
					setupModelFetcher(node, config, nodeTypeName);
				}
			}
		};
		setTimeout(scan, 100);
		window.setInterval(scan, 500);
	},
	async beforeRegisterNodeDef(nodeType, nodeData) {
		const config = NODE_CONFIGS[nodeData.name];
		if (!config) {
			return;
		}

		const nodeTypeName = nodeData.name;
		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
			setupModelFetcher(this, config, nodeTypeName);
			return result;
		};

		const onConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
			setTimeout(() => applyStoredModelOptions(this, config, nodeTypeName), 50);
			return result;
		};

	},

});
