export const IMAGE_PREFIX = "参考图";
export const MAX_IMAGE_INPUTS = 15;
export const RATIO_OPTIONS = ["空", "1:1", "3:4", "4:3", "9:16", "16:9"];
export const SAMPLING_WIDGETS = [
  "温度",
  "Top_K",
  "Top_P",
  "最小概率",
  "重复惩罚",
  "存在惩罚",
];
export const WIDGET_DISPLAY_ORDER = [
  "最大长度",
  "生成比例",
  "RGBA透明图",
  "思考模式",
  "使用默认模板",
  "MTP",
  "采样模式",
  ...SAMPLING_WIDGETS,
  "随机种",
  "control_after_generate",
];

export function imageSlotTarget(linkedIndexes, maxSlots = 15, minSlots = 1) {
  const highest = Math.max(
    -1,
    ...(Array.isArray(linkedIndexes)
      ? linkedIndexes.map((value) => Number(value)).filter(Number.isFinite)
      : []),
  );
  return Math.min(maxSlots, Math.max(minSlots, highest + 2));
}

export function imageInputIndexesToRemove(
  inputs,
  keepCount,
  prefix = IMAGE_PREFIX,
) {
  if (!Array.isArray(inputs)) return [];
  const indexes = [];
  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    const input = inputs[index];
    const name = String(input?.name || "");
    if (!name.startsWith(prefix)) continue;
    const inputIndex = Number(name.slice(prefix.length));
    if (!Number.isInteger(inputIndex) || inputIndex <= keepCount) continue;
    if (input.link !== null && input.link !== undefined && input.link !== -1) {
      continue;
    }
    indexes.push(index);
  }
  return indexes;
}

export function samplingControlsDisabled(mode) {
  const normalized = String(mode ?? "").trim().toLowerCase();
  return ["关闭", "off", "false"].includes(normalized);
}

export function ratioDisplayOptions(value) {
  const normalized = String(value ?? "").trim().replace("：", ":");
  if (
    normalized
    && normalized !== "空"
    && /^\d+\s*:\s*\d+$/.test(normalized)
    && !RATIO_OPTIONS.includes(normalized)
  ) {
    return [...RATIO_OPTIONS, normalized];
  }
  return [...RATIO_OPTIONS];
}

export function reorderWidgetSlots(widgets, order = WIDGET_DISPLAY_ORDER) {
  if (!Array.isArray(widgets) || !Array.isArray(order)) return false;
  const orderSet = new Set(order);
  const slots = [];
  const widgetsByName = new Map();
  for (let index = 0; index < widgets.length; index += 1) {
    const widget = widgets[index];
    if (!orderSet.has(widget?.name)) continue;
    slots.push(index);
    widgetsByName.set(widget.name, widget);
  }
  const orderedWidgets = order
    .map((name) => widgetsByName.get(name))
    .filter(Boolean);
  let changed = false;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (widgets[slot] === orderedWidgets[index]) continue;
    widgets[slot] = orderedWidgets[index];
    changed = true;
  }
  return changed;
}

export function setWidgetHiddenState(widget, hidden) {
  if (!widget) return false;
  let changed = false;
  if (!Object.hasOwn(widget, "__lingzhiPromptOptimizerOriginalType")) {
    widget.__lingzhiPromptOptimizerOriginalType = widget.type || "number";
  }
  if (!Object.hasOwn(widget, "__lingzhiPromptOptimizerHadOwnComputeSize")) {
    widget.__lingzhiPromptOptimizerHadOwnComputeSize = Object.hasOwn(
      widget,
      "computeSize",
    );
    widget.__lingzhiPromptOptimizerOriginalComputeSize = widget.computeSize;
  }
  if (!widget.__lingzhiPromptOptimizerHiddenComputeSize) {
    widget.__lingzhiPromptOptimizerHiddenComputeSize = () => [0, -4];
  }

  if (hidden) {
    if (widget.type !== "hidden") {
      widget.type = "hidden";
      changed = true;
    }
    if (widget.computeSize !== widget.__lingzhiPromptOptimizerHiddenComputeSize) {
      widget.computeSize = widget.__lingzhiPromptOptimizerHiddenComputeSize;
      changed = true;
    }
  } else {
    if (widget.type !== widget.__lingzhiPromptOptimizerOriginalType) {
      widget.type = widget.__lingzhiPromptOptimizerOriginalType;
      changed = true;
    }
    if (widget.__lingzhiPromptOptimizerHadOwnComputeSize) {
      const originalComputeSize = widget.__lingzhiPromptOptimizerOriginalComputeSize;
      if (widget.computeSize !== originalComputeSize) {
        widget.computeSize = originalComputeSize;
        changed = true;
      }
    } else if (
      Object.hasOwn(widget, "computeSize")
      && widget.computeSize === widget.__lingzhiPromptOptimizerHiddenComputeSize
    ) {
      delete widget.computeSize;
      changed = true;
    }
  }
  if (widget.hidden !== hidden) {
    widget.hidden = hidden;
    changed = true;
  }
  return changed;
}

export function promptOptimizerNodeSize(computedSize, currentSize) {
  const computedWidth = Number(Array.isArray(computedSize) ? computedSize[0] : NaN);
  const currentWidth = Number(Array.isArray(currentSize) ? currentSize[0] : NaN);
  const computedHeight = Number(Array.isArray(computedSize) ? computedSize[1] : NaN);
  const width = Math.max(
    420,
    Number.isFinite(computedWidth) ? computedWidth : 0,
    Number.isFinite(currentWidth) ? currentWidth : 0,
  );
  const height = Math.min(
    620,
    Math.max(320, Number.isFinite(computedHeight) ? computedHeight : 360),
  );
  return [Math.round(width), Math.round(height)];
}
