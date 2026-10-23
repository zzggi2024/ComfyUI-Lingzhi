import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
    H3_MODE_FRAMES,
    H3_MODE_REFERENCE,
    H3_MODE_TEXT,
    getH3IncompatibleInputs,
    getH3MediaIndex,
    isH3MediaInput,
} from "./h3_video_policy_v2.mjs";

const NODE_TYPES = new Set(["Lingzhi_H3_Video", "LZ-Lingzhi_H3_Video"]);
const NODE_COLOR = "#0091EA";
const NODE_BACKGROUND = "#001A2E";

const MODE_WIDGET = "生成模式";
const ADVANCED_WIDGET = "高级设置";
const API_KEY_WIDGET = "API密钥";
const MODEL_WIDGET = "模型";
const MODEL_LIST_WIDGET = "可用模型列表";
const MODEL_FETCH_LABEL = "获取模型列表";
const API_APPLY_LABEL = "打开API申请地址";
const API_APPLY_URL = "https://api.zhijia88.vip/api-access";
const ADVANCED_WIDGETS = ["无声视频", "AIGC水印", "等待时间"];
const FRAME_INPUTS = ["首帧", "末帧"];
const REFERENCE_GROUPS = [
    { prefix: "参考图", type: "IMAGE", limit: 9 },
    { prefix: "参考视频", type: "VIDEO", limit: 3 },
    { prefix: "参考音频", type: "AUDIO", limit: 3 },
];

let lastPointer = { x: 640, y: 72 };
if (typeof window !== "undefined") {
    lastPointer = { x: window.innerWidth / 2, y: 72 };
    window.addEventListener(
        "pointerdown",
        (event) => {
            lastPointer = { x: event.clientX, y: event.clientY };
        },
        true,
    );
}


function findWidget(node, name) {
    return node?.widgets?.find((widget) => widget?.name === name || widget?.label === name) || null;
}

function findInput(node, name) {
    return node?.inputs?.find((input) => input?.name === name) || null;
}

function isLinked(input) {
    return input && input.link !== null && input.link !== undefined && input.link !== -1;
}

function selectedMode(node) {
    return String(findWidget(node, MODE_WIDGET)?.value || H3_MODE_TEXT).trim();
}

function setWidgetValue(widget, value) {
    if (!widget) return;
    widget.value = value;
    if (widget.inputEl) widget.inputEl.value = value;
}

function updateComboOptions(widget, options, fallback = "不使用") {
    if (!widget) return;
    const values = Array.from(new Set((options || []).map((item) => String(item)).filter(Boolean)));
    widget.options = widget.options || {};
    widget.options.values = values;
    if (widget.comboEl) {
        widget.comboEl.innerHTML = "";
        for (const value of values) widget.comboEl.add(new Option(value, value));
    }
    if (!values.includes(String(widget.value))) {
        setWidgetValue(widget, fallback ?? values[0]);
    }
}

function widgetElements(widget) {
    const candidates = [
        widget.inputEl,
        widget.element,
        widget.domElement,
        widget.inputElement,
        widget.inputEl?.closest?.(".dom-widget"),
        widget.element?.closest?.(".dom-widget"),
    ];
    return [...new Set(candidates.filter(Boolean))];
}

function setWidgetVisible(widget, visible) {
    if (!widget) return false;
    if (!widget.__lingzhiH3DisplayState) {
        widget.__lingzhiH3DisplayState = {
            visible: null,
            type: widget.type,
            computeSize: widget.computeSize,
            elements: new Map(),
        };
    }
    const state = widget.__lingzhiH3DisplayState;
    if (state.visible === visible) return false;
    state.visible = visible;

    for (const element of widgetElements(widget)) {
        if (!state.elements.has(element)) {
            state.elements.set(element, {
                display: element.style?.display || "",
                hidden: Boolean(element.hidden),
            });
        }
        const original = state.elements.get(element);
        if (element.dataset) element.dataset.shouldHide = visible ? "false" : "true";
        if (element.style) element.style.display = visible ? original.display : "none";
        element.hidden = visible ? original.hidden : true;
    }

    if (visible) {
        widget.type = state.type;
        if (state.computeSize) widget.computeSize = state.computeSize;
        else delete widget.computeSize;
        widget.hidden = false;
    } else {
        widget.type = "hidden";
        widget.computeSize = () => [0, -4];
        widget.hidden = true;
    }
    delete widget.computedHeight;
    return true;
}

function resizeNode(node) {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const computed = node.computeSize?.();
            const width = Math.max(420, Number(node.size?.[0]) || Number(computed?.[0]) || 420);
            const height = Math.max(220, Number(computed?.[1]) || 220);
            node.setSize?.([width, height]);
            node.setDirtyCanvas?.(true, true);
        });
    });
}

function ensureInput(node, name, type) {
    if (!node || !Array.isArray(node.inputs) || findInput(node, name)) return false;
    if (typeof node.addInput !== "function") return false;
    node.addInput(name, type);
    return true;
}

function removeInputIfUnlinked(node, name) {
    const input = findInput(node, name);
    if (!input || isLinked(input)) return false;
    const index = node.inputs.indexOf(input);
    if (index < 0 || typeof node.removeInput !== "function") return false;
    node.removeInput(index);
    return true;
}

function maxConnectedIndex(node, prefix) {
    let highest = 0;
    for (const input of node.inputs || []) {
        if (!isLinked(input)) continue;
        const index = getH3MediaIndex(input.name, prefix);
        if (index > highest) highest = index;
    }
    return highest;
}

function desiredReferenceCount(node, prefix, limit) {
    return Math.min(limit, Math.max(1, maxConnectedIndex(node, prefix) + 1));
}

function syncInputs(node) {
    if (!node || !Array.isArray(node.inputs)) return false;
    const mode = selectedMode(node);
    let changed = false;

    if (mode === H3_MODE_FRAMES) {
        for (const name of FRAME_INPUTS) {
            if (ensureInput(node, name, "IMAGE")) changed = true;
        }
        for (const group of REFERENCE_GROUPS) {
            for (let index = 1; index <= group.limit; index += 1) {
                if (removeInputIfUnlinked(node, `${group.prefix}${index}`)) changed = true;
            }
        }
    } else if (mode === H3_MODE_REFERENCE) {
        for (const name of FRAME_INPUTS) {
            if (removeInputIfUnlinked(node, name)) changed = true;
        }
        for (const group of REFERENCE_GROUPS) {
            const target = desiredReferenceCount(node, group.prefix, group.limit);
            for (let index = 1; index <= target; index += 1) {
                if (ensureInput(node, `${group.prefix}${index}`, group.type)) changed = true;
            }
            for (let index = group.limit; index > target; index -= 1) {
                if (removeInputIfUnlinked(node, `${group.prefix}${index}`)) changed = true;
            }
        }
    } else {
        for (const name of FRAME_INPUTS) {
            if (removeInputIfUnlinked(node, name)) changed = true;
        }
        for (const group of REFERENCE_GROUPS) {
            for (let index = 1; index <= group.limit; index += 1) {
                if (removeInputIfUnlinked(node, `${group.prefix}${index}`)) changed = true;
            }
        }
    }

    const connectedNames = (node.inputs || []).filter(isLinked).map((input) => String(input.name || ""));
    const incompatible = new Set(getH3IncompatibleInputs(mode, connectedNames));
    for (const input of node.inputs || []) {
        const name = String(input.name || "");
        if (!isH3MediaInput(name)) continue;
        const nextLabel = incompatible.has(name) ? `${name}（当前模式不使用，请断开）` : null;
        if (input.label !== nextLabel) {
            input.label = nextLabel;
            changed = true;
        }
    }

    if (mode === H3_MODE_REFERENCE) {
        for (const group of REFERENCE_GROUPS) {
            const target = desiredReferenceCount(node, group.prefix, group.limit);
            for (let index = 1; index <= target; index += 1) {
                if (ensureInput(node, `${group.prefix}${index}`, group.type)) changed = true;
            }
        }
    }

    if (changed) resizeNode(node);
    return changed;
}

function preserveSavedModelValue(node, config) {
    const serializableWidgets = (node.widgets || []).filter(
        (widget) => widget.serialize !== false,
    );
    const modelIndex = serializableWidgets.findIndex(
        (widget) => widget.name === MODEL_WIDGET,
    );
    if (modelIndex < 0) return;
    const savedValue = config?.widgets_values?.[modelIndex];
    if (savedValue === undefined || savedValue === null || savedValue === "") return;
    setWidgetValue(findWidget(node, MODEL_WIDGET), savedValue);
    const listWidget = findWidget(node, MODEL_LIST_WIDGET);
    if (listWidget) {
        updateComboOptions(listWidget, [savedValue], savedValue);
    }
}

function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.textContent = message;
    const maxWidth = 360;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
    const left = Math.min(
        Math.max(lastPointer.x + 12, 8),
        Math.max(8, viewportWidth - maxWidth),
    );
    const top = Math.min(
        Math.max(lastPointer.y + 12, 8),
        Math.max(8, viewportHeight - 60),
    );
    toast.style.cssText = [
        "position:fixed",
        `left:${left}px`,
        `top:${top}px`,
        `max-width:${maxWidth}px`,
        "z-index:99999",
        "pointer-events:none",
        "padding:8px 14px",
        "border-radius:8px",
        "font-size:13px",
        "color:#fff",
        `background:${isError ? "rgba(220,38,38,.94)" : "rgba(22,163,74,.94)"}`,
        "box-shadow:0 8px 24px rgba(0,0,0,.25)",
    ].join(";");
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
}

function syncWidgets(node) {
    const advancedExpanded = Boolean(findWidget(node, ADVANCED_WIDGET)?.value);
    let changed = false;
    for (const name of ADVANCED_WIDGETS) {
        if (setWidgetVisible(findWidget(node, name), advancedExpanded)) changed = true;
    }
    if (changed) resizeNode(node);
    return changed;
}

function resolveNodeInputString(node, inputName) {
    const widget = findWidget(node, inputName);
    const widgetValue = String(widget?.value || "").trim();
    const input = findInput(node, inputName);
    if (!input || !isLinked(input)) return widgetValue;

    const links = node?.graph?.links;
    const link = Array.isArray(links)
        ? links.find((item) => item?.id === input.link) || links[input.link]
        : links?.[input.link];
    const originId = link?.origin_id;
    const origin =
        node?.graph?.getNodeById?.(originId) ||
        node?.graph?._nodes_by_id?.[originId] ||
        null;

    const values = [];
    for (const item of origin?.widgets || []) {
        const value = String(item?.value ?? "").trim();
        if (value) values.push({ name: String(item?.name || ""), value });
    }
    if (Array.isArray(origin?.widgets_values)) {
        for (const value of origin.widgets_values) {
            const textValue = String(value ?? "").trim();
            if (textValue) values.push({ name: "", value: textValue });
        }
    }

    const preferred = values.find((item) => /^(lz_api_|sk-)/i.test(item.value));
    if (preferred) return preferred.value;
    const named = values.find((item) => /api|key|text|string|value/i.test(item.name));
    if (named) return named.value;
    if (values.length === 1) return values[0].value;
    return widgetValue;
}

async function fetchModels(node) {
    if (!node || node.__lingzhiH3FetchingModels) return;
    const button = findWidget(node, MODEL_FETCH_LABEL);
    const oldLabel = button?.label || MODEL_FETCH_LABEL;
    const apiKey = resolveNodeInputString(node, API_KEY_WIDGET);
    node.__lingzhiH3FetchingModels = true;
    if (button) {
        button.label = "正在获取...";
        node.setDirtyCanvas?.(true, true);
    }
    try {
        const response = await api.fetchApi("/lingzhi/h3_video/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: apiKey }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error || `HTTP ${response.status}`);
        }
        const models = Array.isArray(data.models) ? data.models.filter(Boolean) : [];
        if (!models.length) {
            throw new Error("未找到 LZ-video-MiniMax 模型");
        }
        const modelWidget = findWidget(node, MODEL_WIDGET);
        const currentModel = String(modelWidget?.value || "").trim();
        const selectedModel = models.includes(currentModel) ? currentModel : models[0];
        updateComboOptions(findWidget(node, MODEL_LIST_WIDGET), models, selectedModel);
        setWidgetValue(modelWidget, selectedModel);
        showToast(`已获取 ${models.length} 个模型`);
    } catch (error) {
        console.warn("[Lingzhi-H3] 获取模型列表失败", error);
        const message = String(error?.message || "获取模型列表失败");
        showToast(
            message.startsWith("获取模型列表失败")
                ? message
                : `获取模型列表失败：${message}`,
            true,
        );
    } finally {
        node.__lingzhiH3FetchingModels = false;
        if (button) button.label = oldLabel;
        node.setDirtyCanvas?.(true, true);
    }
}

function ensureModelFetchButton(node) {
    if (!node || typeof node.addWidget !== "function") return;
    let button = findWidget(node, MODEL_FETCH_LABEL);
    if (!button) {
        button = node.addWidget("button", MODEL_FETCH_LABEL, null, () => fetchModels(node));
        button.serialize = false;
    }
    node.__lingzhiH3ModelFetchButton = button;

    let listWidget = findWidget(node, MODEL_LIST_WIDGET);
    if (!listWidget) {
        listWidget = node.addWidget(
            "combo",
            MODEL_LIST_WIDGET,
            "MiniMax-H3",
            (value) => {
                const modelWidget = findWidget(node, MODEL_WIDGET);
                if (modelWidget && value) setWidgetValue(modelWidget, value);
            },
            { values: ["MiniMax-H3", "minimax-h3-lite"] },
        );
        listWidget.serialize = false;
    }
    node.__lingzhiH3ModelListWidget = listWidget;
}

function ensureApiApplyButton(node) {
    if (!node || typeof node.addWidget !== "function") return;
    const exists = (node.widgets || []).some(
        (widget) =>
            widget?.name === "API申请地址" ||
            widget?.name === API_APPLY_LABEL ||
            widget?.label === API_APPLY_LABEL,
    );
    if (exists) return;
    const button = node.addWidget("button", "API申请地址", null, () =>
        window.open(API_APPLY_URL, "_blank"),
    );
    button.name = "API申请地址";
    button.label = API_APPLY_LABEL;
    button.tooltip = "打开 API 申请页面";
    button.serialize = false;
}

function orderBottomButtons(node) {
    const modelButton = findWidget(node, MODEL_FETCH_LABEL);
    const listWidget = findWidget(node, MODEL_LIST_WIDGET);
    const apiButton = (node.widgets || []).find(
        (widget) =>
            widget?.name === "API申请地址" || widget?.label === API_APPLY_LABEL,
    );
    const bottomWidgets = [modelButton, listWidget, apiButton].filter(Boolean);
    if (bottomWidgets.length < 2) return;
    node.widgets = node.widgets.filter(
        (widget) => !bottomWidgets.includes(widget),
    );
    node.widgets.push(...bottomWidgets);
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "Lingzhi.H3VideoUI",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NODE_TYPES.has(String(nodeData?.name || ""))) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated ? originalCreated.apply(this, arguments) : undefined;
            this.color = NODE_COLOR;
            this.bgcolor = NODE_BACKGROUND;
            this.title_text_color = "#FF0000";
            ensureModelFetchButton(this);
            ensureApiApplyButton(this);
            orderBottomButtons(this);
            syncInputs(this);
            syncWidgets(this);
            setTimeout(() => syncInputs(this), 30);
            return result;
        };

        const originalConfigured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (config) {
            preserveSavedModelValue(this, config);
            const result = originalConfigured
                ? originalConfigured.call(this, config)
                : undefined;
            this.color = NODE_COLOR;
            this.bgcolor = NODE_BACKGROUND;
            this.title_text_color = "#FF0000";
            ensureModelFetchButton(this);
            ensureApiApplyButton(this);
            orderBottomButtons(this);
            setTimeout(() => {
                syncInputs(this);
                syncWidgets(this);
            }, 50);
            return result;
        };

        const originalWidgetChanged = nodeType.prototype.onWidgetChanged;
        nodeType.prototype.onWidgetChanged = function (name, value, oldValue, widget) {
            const result = originalWidgetChanged
                ? originalWidgetChanged.apply(this, arguments)
                : undefined;
            if (name === MODE_WIDGET) {
                setTimeout(() => syncInputs(this), 0);
            } else if (name === ADVANCED_WIDGET) {
                setTimeout(() => syncWidgets(this), 0);
            }
            return result;
        };

        const originalConnectionsChanged = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = originalConnectionsChanged
                ? originalConnectionsChanged.apply(this, arguments)
                : undefined;
            setTimeout(() => syncInputs(this), 30);
            return result;
        };
    },
});



