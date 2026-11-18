import { app } from "/scripts/app.js";

import {
  IMAGE_PREFIX,
  MAX_IMAGE_INPUTS,
  SAMPLING_WIDGETS,
  WIDGET_DISPLAY_ORDER,
  imageInputIndexesToRemove,
  imageSlotTarget,
  promptOptimizerNodeSize,
  ratioDisplayOptions,
  reorderWidgetSlots,
  samplingControlsDisabled,
  setWidgetHiddenState,
} from "./prompt_optimizer_policy.mjs?v=20261115-reset1";
import {
  WIDGET_CONTROL_MODE_SETTING,
  readWidgetControlMode,
  seedControlLabel,
} from "./seed_control_mode.mjs?v=20261115-reset1";

const NODE_TYPES = new Set([
  "LZ-Lingzhi_PromptOptimizer",
  "Lingzhi_PromptOptimizer",
]);
const SAMPLING_MODE_WIDGET = "采样模式";
const SEED_WIDGET = "随机种";
const CONTROL_WIDGET = "control_after_generate";
const RATIO_WIDGET = "生成比例";

function isTarget(node) {
  return NODE_TYPES.has(String(node?.comfyClass || node?.type || ""));
}

function findWidget(node, name) {
  return Array.isArray(node?.widgets)
    ? node.widgets.find((widget) => widget?.name === name)
    : null;
}

function isLinked(input) {
  return input?.link !== null && input?.link !== undefined && input?.link !== -1;
}

function imageInputs(node) {
  return (node?.inputs || [])
    .map((input) => {
      const name = String(input?.name || "");
      if (!name.startsWith(IMAGE_PREFIX)) return null;
      const index = Number(name.slice(IMAGE_PREFIX.length));
      return Number.isInteger(index) && index > 0 ? { input, index } : null;
    })
    .filter(Boolean);
}

function setWidgetDisabled(widget, disabled) {
  if (!widget) return false;
  let changed = false;
  if (!widget.options) widget.options = {};
  if (widget.disabled !== disabled) {
    widget.disabled = disabled;
    changed = true;
  }
  if (widget.options.disabled !== disabled) {
    widget.options.disabled = disabled;
    changed = true;
  }
  if (widget.options.readOnly !== disabled) {
    widget.options.readOnly = disabled;
    changed = true;
  }
  return changed;
}

function ensureImageInputs(node, conservative = false) {
  if (!Array.isArray(node?.inputs)) node.inputs = [];
  const current = imageInputs(node);
  const linkedIndexes = current
    .filter(({ input }) => isLinked(input))
    .map(({ index }) => index - 1);
  const target = imageSlotTarget(linkedIndexes, MAX_IMAGE_INPUTS, 1);
  let changed = false;

  for (let index = 1; index <= target; index += 1) {
    const name = `${IMAGE_PREFIX}${index}`;
    if (!node.inputs.some((input) => String(input?.name || "") === name)) {
      node.addInput?.(name, "IMAGE");
      changed = true;
    }
  }

  if (!conservative) {
    const removals = imageInputIndexesToRemove(node.inputs, target).map(
      (index) => ({
        index,
        name: String(node.inputs[index]?.name || ""),
      }),
    );
    for (const removal of removals) {
      if (typeof node.removeInput === "function") {
        node.removeInput(removal.index);
      }
      const remainingIndex = node.inputs.findIndex(
        (input) => String(input?.name || "") === removal.name,
      );
      if (remainingIndex >= 0) node.inputs.splice(remainingIndex, 1);
      changed = true;
    }
  }
  return changed;
}

function syncSeedControl(node) {
  const seed = findWidget(node, SEED_WIDGET);
  if (!seed) return false;
  let changed = false;
  seed.options = seed.options || {};
  if (seed.options.control_after_generate !== true) {
    seed.options.control_after_generate = true;
    changed = true;
  }
  const control = seed.linkedWidgets?.find(
    (widget) => widget?.name === CONTROL_WIDGET,
  ) || findWidget(node, CONTROL_WIDGET);
  const label = seedControlLabel(readWidgetControlMode(app?.ui?.settings));
  if (control && label && control.label !== label) {
    control.label = label;
    changed = true;
  }
  return changed;
}

function syncWidgetLabels(node) {
  let changed = false;
  const labels = new Map([
    ["Top_K", "Top K"],
    ["Top_P", "Top P"],
    ["RGBA透明图", "RGBA 透明图"],
  ]);
  for (const [name, label] of labels) {
    const widget = findWidget(node, name);
    if (widget && widget.label !== label) {
      widget.label = label;
      changed = true;
    }
  }
  return changed;
}

function syncRatioWidget(node) {
  let widget = findWidget(node, RATIO_WIDGET);
  if (!widget) return false;
  let changed = false;
  if (!String(widget.value ?? "").trim()) {
    widget.value = "空";
    changed = true;
  }

  if (!widget.__lingzhiPromptOptimizerRatioCombo) {
    const widgetIndex = node.widgets?.indexOf(widget) ?? -1;
    if (widgetIndex < 0) return changed;
    const originalCallback = widget.callback;
    const options = ratioDisplayOptions(widget.value);
    const normalizedValue = String(widget.value ?? "").trim();
    const selectedValue = options.includes(normalizedValue) ? normalizedValue : "空";
    const replacementWidget = node.addWidget?.(
      "combo",
      RATIO_WIDGET,
      selectedValue,
      () => {},
      { values: options },
    );
    if (!replacementWidget) return changed;
    const appendedIndex = node.widgets?.indexOf(replacementWidget) ?? -1;
    if (appendedIndex >= 0) node.widgets.splice(appendedIndex, 1);
    node.widgets.splice(widgetIndex, 1, replacementWidget);
    replacementWidget.label = widget.label || RATIO_WIDGET;
    replacementWidget.serialize = true;
    replacementWidget.callback = (value) => {
      const nextOptions = ratioDisplayOptions(value);
      replacementWidget.options = replacementWidget.options || {};
      replacementWidget.options.values = nextOptions;
      replacementWidget.value = nextOptions.includes(String(value ?? "").trim())
        ? String(value).trim()
        : "空";
      if (typeof originalCallback === "function") {
        originalCallback.call(replacementWidget, replacementWidget.value);
      }
      node.setDirtyCanvas?.(true, true);
    };
    replacementWidget.__lingzhiPromptOptimizerRatioCombo = true;
    widget = replacementWidget;
    changed = true;
  }

  widget.options = widget.options || {};
  const options = ratioDisplayOptions(widget.value);
  const normalizedValue = String(widget.value ?? "").trim();
  const selectedValue = options.includes(normalizedValue) ? normalizedValue : "空";
  const currentOptions = Array.isArray(widget.options.values)
    ? widget.options.values
    : [];
  if (
    currentOptions.length !== options.length
    || currentOptions.some((value, index) => value !== options[index])
  ) {
    widget.options.values = options;
    changed = true;
  }
  if (widget.value !== selectedValue) {
    widget.value = selectedValue;
    changed = true;
  }
  return changed;
}

function syncSamplingControls(node) {
  const mode = findWidget(node, SAMPLING_MODE_WIDGET)?.value;
  const disabled = samplingControlsDisabled(mode);
  let changed = false;
  for (const name of SAMPLING_WIDGETS) {
    const widget = findWidget(node, name);
    changed = setWidgetDisabled(widget, disabled) || changed;
    changed = setWidgetHiddenState(widget, disabled) || changed;
  }

  const seed = findWidget(node, SEED_WIDGET);
  const control = seed?.linkedWidgets?.find(
    (widget) => widget?.name === CONTROL_WIDGET,
  ) || findWidget(node, CONTROL_WIDGET);
  changed = setWidgetDisabled(seed, false) || changed;
  changed = setWidgetDisabled(control, false) || changed;
  changed = setWidgetHiddenState(seed, false) || changed;
  changed = setWidgetHiddenState(control, false) || changed;
  return changed;
}

function syncSamplingModeTrigger(node) {
  const widget = findWidget(node, SAMPLING_MODE_WIDGET);
  if (!widget || widget.__lingzhiPromptOptimizerSamplingCallback) return false;
  const originalCallback = widget.callback;
  widget.callback = function (value) {
    const result =
      typeof originalCallback === "function"
        ? originalCallback.apply(this, arguments)
        : undefined;
    applyNodePolicy(node);
    return result;
  };
  widget.__lingzhiPromptOptimizerSamplingCallback = widget.callback;
  return true;
}

function reorderWidgets(node) {
  return reorderWidgetSlots(node.widgets, WIDGET_DISPLAY_ORDER);
}

function fitNodeToContent(node) {
  const run = () => {
    const [width, height] = promptOptimizerNodeSize(
      node.computeSize?.(),
      node.size,
    );
    const currentWidth = Number(node.size?.[0]);
    const currentHeight = Number(node.size?.[1]);
    if (
      Math.abs(currentWidth - width) <= 1
      && Math.abs(currentHeight - height) <= 1
    ) {
      return;
    }
    node.setSize?.([width, height]);
    node.onResize?.(node.size);
    node.setDirtyCanvas?.(true, true);
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    setTimeout(run, 0);
  }
}

function applyNodePolicy(node, { conservative = false } = {}) {
  if (!node || node.__lingzhiPromptOptimizerApplying) return;
  node.__lingzhiPromptOptimizerApplying = true;
  try {
    node.color = "#7D24A6";
    node.bgcolor = "#1E0A29";
    node.title_text_color = "#FF0000";
    const imagesChanged = ensureImageInputs(node, conservative);
    let changed = imagesChanged;
    changed = syncWidgetLabels(node) || changed;
    changed = syncRatioWidget(node) || changed;
    changed = reorderWidgets(node) || changed;
    changed = syncSamplingModeTrigger(node) || changed;
    changed = syncSeedControl(node) || changed;
    const samplingChanged = syncSamplingControls(node);
    changed = samplingChanged || changed;
    if (
      !conservative
      && (imagesChanged || samplingChanged || !node.__lingzhiPromptOptimizerSizeFitted)
    ) {
      fitNodeToContent(node);
      node.__lingzhiPromptOptimizerSizeFitted = true;
    }
    if (changed) {
      node.onResize?.(node.size);
      node.setDirtyCanvas?.(true, true);
    }
  } finally {
    node.__lingzhiPromptOptimizerApplying = false;
  }
}

function scheduleApply(node, options = {}) {
  setTimeout(() => applyNodePolicy(node, options), 0);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => applyNodePolicy(node, options));
    });
  }
}

function refreshSeedControlLabels() {
  for (const node of app?.graph?._nodes || []) {
    if (isTarget(node)) applyNodePolicy(node);
  }
}

app.registerExtension({
  name: "Lingzhi.PromptOptimizer",
  setup() {
    const settings = app?.ui?.settings;
    if (!settings || app.__lingzhiPromptOptimizerSettingsInstalled) return;
    settings.addEventListener?.(
      `${WIDGET_CONTROL_MODE_SETTING}.change`,
      refreshSeedControlLabels,
    );
    app.__lingzhiPromptOptimizerSettingsInstalled = true;
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (!NODE_TYPES.has(String(nodeData?.name || ""))) return;

    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created ? created.apply(this, arguments) : undefined;
      applyNodePolicy(this);
      scheduleApply(this);
      return result;
    };

    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = configured ? configured.apply(this, arguments) : undefined;
      scheduleApply(this);
      return result;
    };

    const connectionsChanged = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const result = connectionsChanged
        ? connectionsChanged.apply(this, arguments)
        : undefined;
      scheduleApply(this);
      return result;
    };

    const widgetChanged = nodeType.prototype.onWidgetChanged;
    nodeType.prototype.onWidgetChanged = function (name) {
      const result = widgetChanged
        ? widgetChanged.apply(this, arguments)
        : undefined;
      if (name === SAMPLING_MODE_WIDGET) applyNodePolicy(this);
      return result;
    };
  },
  nodeCreated(node) {
    if (isTarget(node)) {
      applyNodePolicy(node);
      scheduleApply(node);
    }
  },
});
