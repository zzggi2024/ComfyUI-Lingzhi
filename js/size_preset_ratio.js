import { app } from "/scripts/app.js";

const SIZE_PRESET_NODE = "LZ-Lingzhi_SizePreset";
const REAL_RATIO_WIDGET = "比例";
const DISPLAY_RATIO_WIDGET = "图像比例";
const DISPLAY_RATIO_INTERNAL_NAME = "lingzhi_ratio_select";
const BASE_EDGE_WIDGET = "尺寸输入";
const REVERSE_WIDGET = "数值切换";
const DIMENSION_DOM_WIDGET = "lingzhi_size_preset_dimensions";
const BASE_RATIOS = ["1:1", "1:2", "1:3", "2:3", "3:4", "3:5", "4:5", "9:16", "9:21"];
const EDGE_VALUES = ["最长边", "最短边"];

function findWidget(node, name) {
    return Array.isArray(node?.widgets)
        ? node.widgets.find((widget) => widget?.name === name)
        : null;
}

function isValidRatio(value) {
    return /^\s*\d+\s*:\s*\d+\s*$/.test(String(value || ""));
}

function normalizeRatio(value) {
    const match = String(value || "").match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
    if (!match) return "1:1";
    const ratio = `${Math.max(1, Number(match[1]))}:${Math.max(1, Number(match[2]))}`;
    return BASE_RATIOS.includes(ratio) ? ratio : "1:1";
}

function invertRatio(value) {
    if (!isValidRatio(value)) return "1:1";
    const [width, height] = String(value)
        .split(":")
        .map((part) => Math.max(1, Number(part)));
    return `${height}:${width}`;
}

function effectiveRatio(value, reverse) {
    return reverse ? invertRatio(value) : normalizeRatio(value);
}

function storedRatio(value, reverse) {
    return reverse ? invertRatio(value) : normalizeRatio(value);
}

function ratioValues(reverse) {
    return BASE_RATIOS.map((ratio) => (reverse ? invertRatio(ratio) : ratio));
}

function hideNativeWidget(widget) {
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
}

function migrateLegacyRatio(realWidget, reverseWidget) {
    const current = String(realWidget.value || "").trim();
    if (BASE_RATIOS.includes(current)) return;
    if (isValidRatio(current)) {
        const inverse = invertRatio(current);
        if (BASE_RATIOS.includes(inverse)) {
            realWidget.value = inverse;
            reverseWidget.value = true;
            return;
        }
    }
    realWidget.value = "9:16";
}

function migrateEdgeValue(edgeWidget, effectiveValue) {
    const current = String(edgeWidget.value || "").trim();
    if (EDGE_VALUES.includes(current)) return;
    const [ratioWidth, ratioHeight] = effectiveValue.split(":").map(Number);
    const widthIsLongest = ratioWidth >= ratioHeight;
    edgeWidget.value = current === "高"
        ? (widthIsLongest ? "最短边" : "最长边")
        : (widthIsLongest ? "最长边" : "最短边");
}

function createOption(documentRef, value) {
    const option = documentRef.createElement("option");
    option.value = value;
    option.textContent = value;
    return option;
}

function ensureDimensionControl(node, numericWidget, edgeWidget) {
    if (node.__lingzhiSizePresetDimensionControl) {
        return node.__lingzhiSizePresetDimensionControl;
    }

    const documentRef = window.document;
    const root = documentRef.createElement("div");
    root.className = "lingzhi-size-preset-dimensions";
    root.style.display = "grid";
    root.style.gridTemplateColumns = "126px minmax(0, 1fr)";
    root.style.gap = "6px";
    root.style.width = "100%";
    root.style.alignItems = "center";
    root.style.boxSizing = "border-box";

    const edge = documentRef.createElement("select");
    edge.ariaLabel = "基准边";
    edge.style.width = "100%";
    edge.style.height = "28px";
    edge.style.padding = "0 8px";
    edge.style.background = "#252a31";
    edge.style.color = "#f4f5f7";
    edge.style.border = "1px solid #4c525c";
    edge.style.borderRadius = "6px";
    edge.style.boxSizing = "border-box";
    for (const value of EDGE_VALUES) {
        edge.appendChild(createOption(documentRef, value));
    }
    edge.value = EDGE_VALUES.includes(edgeWidget.value)
        ? edgeWidget.value
        : EDGE_VALUES[0];
    edge.addEventListener("change", () => {
        edgeWidget.value = EDGE_VALUES.includes(edge.value)
            ? edge.value
            : EDGE_VALUES[0];
        node.setDirtyCanvas?.(true, true);
    });

    const numeric = documentRef.createElement("input");
    numeric.type = "number";
    numeric.min = "1";
    numeric.max = "8192";
    numeric.step = "1";
    numeric.ariaLabel = "自定义数值";
    numeric.placeholder = "自定义数值";
    numeric.style.width = "100%";
    numeric.style.height = "28px";
    numeric.style.padding = "0 8px";
    numeric.style.background = "#252a31";
    numeric.style.color = "#f4f5f7";
    numeric.style.border = "1px solid #4c525c";
    numeric.style.borderRadius = "6px";
    numeric.style.boxSizing = "border-box";
    numeric.value = String(numericWidget.value ?? 1024);

    const applyNumeric = () => {
        const parsed = Math.trunc(Number(numeric.value));
        const next = Number.isFinite(parsed) ? Math.min(8192, Math.max(1, parsed)) : 1;
        numericWidget.value = next;
        numeric.value = String(next);
        node.setDirtyCanvas?.(true, true);
    };
    numeric.addEventListener("change", applyNumeric);
    numeric.addEventListener("focus", () => numeric.select());
    numeric.addEventListener("click", () => numeric.select());
    numeric.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            applyNumeric();
            numeric.blur();
        }
    });

    root.append(edge, numeric);
    const domWidget = node.addDOMWidget(
        DIMENSION_DOM_WIDGET,
        DIMENSION_DOM_WIDGET,
        root,
    );
    domWidget.name = DIMENSION_DOM_WIDGET;
    domWidget.label = "";
    domWidget.serialize = false;
    domWidget.computeSize = () => [0, 34];

    const control = {
        root,
        edge,
        numeric,
        domWidget,
        numericWidget,
        edgeWidget,
    };
    node.__lingzhiSizePresetDimensionControl = control;
    return control;
}

function syncDimensionControl(control) {
    if (!control) return;
    control.edge.value = EDGE_VALUES.includes(control.edgeWidget.value)
        ? control.edgeWidget.value
        : EDGE_VALUES[0];
    control.numeric.value = String(control.numericWidget.value ?? 1024);
}

function setupSizePresetRatio(node) {
    const numericWidget = findWidget(node, "数值");
    const edgeWidget = findWidget(node, BASE_EDGE_WIDGET);
    const realRatio = findWidget(node, REAL_RATIO_WIDGET);
    const dividerWidget = findWidget(node, "整除倍数");
    const reverseWidget = findWidget(node, REVERSE_WIDGET);
    const batchWidget = findWidget(node, "批次大小");
    if (
        !numericWidget
        || !edgeWidget
        || !realRatio
        || !dividerWidget
        || !reverseWidget
        || !batchWidget
    ) {
        return;
    }

    edgeWidget.label = "基准边";
    edgeWidget.options = edgeWidget.options || {};
    edgeWidget.options.values = EDGE_VALUES;
    dividerWidget.label = "整除倍数";
    reverseWidget.label = "反转";
    batchWidget.label = "批次大小";
    const parsedBatchSize = Math.trunc(Number(batchWidget.value));
    batchWidget.value = Number.isFinite(parsedBatchSize)
        ? Math.min(4096, Math.max(1, parsedBatchSize))
        : 1;

    migrateLegacyRatio(realRatio, reverseWidget);
    hideNativeWidget(realRatio);

    let displayWidget = findWidget(node, DISPLAY_RATIO_INTERNAL_NAME);
    if (!displayWidget) {
        displayWidget = node.addWidget("combo", DISPLAY_RATIO_WIDGET, "9:16", () => {}, {
            values: ratioValues(Boolean(reverseWidget.value)),
        });
        displayWidget.name = DISPLAY_RATIO_INTERNAL_NAME;
        displayWidget.label = DISPLAY_RATIO_WIDGET;
    }
    displayWidget.label = DISPLAY_RATIO_WIDGET;
    displayWidget.serialize = false;
    displayWidget.options = displayWidget.options || {};

    const syncDisplay = () => {
        const reverse = Boolean(reverseWidget.value);
        displayWidget.options.values = ratioValues(reverse);
        displayWidget.value = effectiveRatio(realRatio.value, reverse);
    };

    displayWidget.callback = (value) => {
        const reverse = Boolean(reverseWidget.value);
        const values = ratioValues(reverse);
        const effectiveValue = values.includes(value) ? value : values[0];
        realRatio.value = storedRatio(effectiveValue, reverse);
        displayWidget.value = effectiveValue;
        node.setDirtyCanvas?.(true, true);
    };

    if (!reverseWidget.__lingzhiSizePresetOriginalCallback) {
        reverseWidget.__lingzhiSizePresetOriginalCallback = reverseWidget.callback;
    }
    reverseWidget.callback = (value) => {
        const originalCallback = reverseWidget.__lingzhiSizePresetOriginalCallback;
        if (typeof originalCallback === "function") {
            originalCallback.call(reverseWidget, value);
        }
        syncDisplay();
        node.setDirtyCanvas?.(true, true);
    };

    syncDisplay();
    migrateEdgeValue(edgeWidget, displayWidget.value);

    hideNativeWidget(numericWidget);
    hideNativeWidget(edgeWidget);
    const dimensionControl = ensureDimensionControl(node, numericWidget, edgeWidget);
    syncDimensionControl(dimensionControl);

    const ratioIndex = node.widgets.indexOf(realRatio);
    const ratioDisplayIndex = node.widgets.indexOf(displayWidget);
    if (
        ratioIndex >= 0
        && ratioDisplayIndex >= 0
        && ratioDisplayIndex !== ratioIndex + 1
    ) {
        node.widgets.splice(ratioDisplayIndex, 1);
        const nextRatioIndex = node.widgets.indexOf(realRatio);
        node.widgets.splice(nextRatioIndex + 1, 0, displayWidget);
    }

    const edgeIndex = node.widgets.indexOf(edgeWidget);
    const dimensionIndex = node.widgets.indexOf(dimensionControl.domWidget);
    if (
        edgeIndex >= 0
        && dimensionIndex >= 0
        && dimensionIndex !== edgeIndex + 1
    ) {
        node.widgets.splice(dimensionIndex, 1);
        const nextEdgeIndex = node.widgets.indexOf(edgeWidget);
        node.widgets.splice(nextEdgeIndex + 1, 0, dimensionControl.domWidget);
    }

    node.onResize?.(node.size);
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "lingzhi.SizePresetRatio",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== SIZE_PRESET_NODE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            setTimeout(() => setupSizePresetRatio(this), 50);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
            setTimeout(() => setupSizePresetRatio(this), 50);
            return result;
        };
    },
});
