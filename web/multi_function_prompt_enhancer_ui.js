import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

import {
  createLatestRequestQueue,
  mediaSeriesForFeature,
  modelLockFromWorkflow,
  modelSelectionAfterRefresh,
  persistModelLock,
  reconcileFeaturePorts,
  reconcileSeries,
} from "./multi_prompt_enhancer_policy.mjs";
import {
  normalizedSeedValue,
  skillControlsVisible,
  skillSelectionAfterRefresh,
  visibleWidgetNames,
} from "./multi_function_prompt_enhancer_policy.mjs";

const NODE_CLASSES = new Set([
  "Lingzhi_Multi_Function_Prompt_Enhancer",
  "LZ-Lingzhi_Multi_Function_Prompt_Enhancer",
]);
const DISPLAY_NAME = "✨LZ- 多功能提示词增强器";
const MODEL_ENDPOINT = "/lingzhi/multi_prompt_enhancer/models";
const SKILL_ENDPOINT = "/lingzhi/multi_function_prompt_enhancer/skills";
const API_APPLY_URL = "https://api.zhijia88.vip/api-access";
const MODEL_WIDGET = "模型选择";
const CHANNEL_WIDGET = "运行渠道";
const FEATURE_WIDGET = "功能类型";
const ADVANCED_WIDGET = "高级设置";
const FETCH_MODELS_WIDGET = "获取模型列表";
const MODEL_LIST_WIDGET = "可用模型列表";
const MODEL_STATUS_WIDGET = "模型获取状态";
const SKILL_WIDGET = "Skill选择";
const REFRESH_SKILLS_WIDGET = "刷新Skill列表";
const SKILL_STATUS_WIDGET = "Skill刷新状态";
const API_WIDGET = "打开API申请地址";
const WARNING_SUFFIX = "（当前不参与）";
const PANEL_CALLBACK_WIDGETS = new Set([
  FEATURE_WIDGET,
  CHANNEL_WIDGET,
  "生成模式",
  "歌词模式",
  "歌曲结构",
  ADVANCED_WIDGET,
]);

function isTarget(node) {
  return NODE_CLASSES.has(String(node?.comfyClass || node?.type || ""));
}

function findWidget(node, name) {
  return Array.isArray(node?.widgets)
    ? node.widgets.find((widget) => widget?.name === name)
    : null;
}

function widgetValues(node) {
  const values = {};
  for (const widget of node?.widgets || []) {
    if (widget?.name) values[widget.name] = widget.value;
  }
  values.__advancedExpanded = Boolean(findWidget(node, ADVANCED_WIDGET)?.value);
  return values;
}

function updateCombo(widget, values, fallback) {
  if (!widget) return;
  const options = [...new Set(values)];
  widget.options = widget.options || {};
  widget.options.values = options;
  if (!options.includes(String(widget.value))) widget.value = fallback ?? options[0];
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
  if (!widget) return;
  if (!widget.__lingzhiMultiFunctionDisplayState) {
    widget.__lingzhiMultiFunctionDisplayState = {
      type: widget.type,
      computeSize: widget.computeSize,
      elements: new Map(),
    };
  }
  const state = widget.__lingzhiMultiFunctionDisplayState;
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
    widget.type = "converted-widget";
    widget.computeSize = () => [0, -4];
    widget.hidden = true;
  }
  delete widget.computedHeight;
}

function resizeNode(node) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const computed = node.computeSize?.();
      const width = Math.max(420, Number(node.size?.[0]) || Number(computed?.[0]) || 420);
      const height = Math.max(200, Number(computed?.[1]) || 200);
      node.setSize?.([width, height]);
      node.setDirtyCanvas?.(true, true);
    });
  });
}

function desiredFixedPorts(feature, values) {
  if (feature === "Seedance") return ["首帧图", "尾帧图"];
  if (feature !== "H3") return [];
  const mode = String(values["生成模式"] || "自动");
  if (mode === "I2VA") return ["首帧图"];
  if (mode === "FL2VA" || mode === "自动") return ["首帧图", "尾帧图"];
  if (mode === "L2VA") return ["尾帧图"];
  return [];
}

function inputLinked(input) {
  return input?.link !== null && input?.link !== undefined && input?.link !== -1;
}

function findInputIndex(node, name) {
  if (typeof node?.findInputSlot === "function") return node.findInputSlot(name);
  return (node?.inputs || []).findIndex((input) => input?.name === name);
}

function applyPortOperation(node, operation, conservative) {
  const index = findInputIndex(node, operation.name);
  if (operation.action === "add" && index < 0) {
    node.addInput?.(operation.name, operation.type);
    return true;
  }
  if (operation.action === "remove" && !conservative && index >= 0) {
    const input = node.inputs[index];
    if (!inputLinked(input)) {
      node.removeInput?.(index);
      return true;
    }
  }
  if (operation.action === "retain-warning" && index >= 0) {
    const input = node.inputs[index];
    if (input.label !== operation.label) {
      input.label = operation.label;
      return true;
    }
  }
  return false;
}

function reconcilePorts(node, feature, values, conservative = false) {
  if (!Array.isArray(node.inputs)) node.inputs = [];
  let changed = false;
  const dynamicName = /^(参考图片|参考视频|参考音频)\d+$/;
  for (const input of node.inputs) {
    if (
      (dynamicName.test(String(input?.name || "")) || ["首帧图", "尾帧图"].includes(input?.name))
      && input.label !== input.name
    ) {
      input.label = input.name;
      changed = true;
    }
  }

  for (const name of desiredFixedPorts(feature, values)) {
    changed = applyPortOperation(node, { action: "add", name, type: "IMAGE" }, conservative) || changed;
  }
  for (const series of mediaSeriesForFeature(feature)) {
    const snapshot = node.inputs.map((input) => ({ ...input, linked: inputLinked(input) }));
    for (const operation of reconcileSeries(snapshot, series, feature)) {
      changed = applyPortOperation(node, operation, conservative) || changed;
    }
  }
  const snapshot = node.inputs.map((input) => ({ ...input, linked: inputLinked(input) }));
  for (const operation of reconcileFeaturePorts(snapshot, feature, values)) {
    changed = applyPortOperation(node, operation, conservative) || changed;
  }
  return changed;
}

function updateWarningStatus(node) {
  const hasWarning = (node.inputs || []).some((input) => String(input?.label || "").endsWith(WARNING_SUFFIX));
  const baseTitle = node.__lingzhiMultiFunctionBaseTitle || node.title || DISPLAY_NAME;
  node.__lingzhiMultiFunctionBaseTitle = baseTitle.replace(/ · 已连接素材不参与$/, "");
  node.title = hasWarning
    ? `${node.__lingzhiMultiFunctionBaseTitle} · 已连接素材不参与`
    : node.__lingzhiMultiFunctionBaseTitle;
}

function ensureNativeSeedControl(node) {
  const seed = findWidget(node, "随机种");
  if (!seed) return;
  seed.value = normalizedSeedValue(seed.value);
  seed.options = seed.options || {};
  seed.options.control_after_generate = true;
  let control = findWidget(node, "control_after_generate");
  if (!control) {
    control = node.addWidget?.("combo", "control_after_generate", "randomize", () => {}, {
      values: ["fixed", "increment", "decrement", "randomize"],
    });
  }
  if (control && !Array.isArray(seed.linkedWidgets)) seed.linkedWidgets = [];
  if (control && !seed.linkedWidgets.includes(control)) seed.linkedWidgets.push(control);
  if (control && !["fixed", "increment", "decrement", "randomize"].includes(String(control.value))) {
    control.value = "randomize";
  }
}

function ensureAdvancedToggle(node) {
  let widget = findWidget(node, ADVANCED_WIDGET);
  if (widget) return widget;
  widget = node.addWidget?.("toggle", ADVANCED_WIDGET, false, () => applyNodePolicy(node), {
    on: "展开",
    off: "收起",
  });
  if (widget) widget.serialize = false;
  return widget;
}

function ensureModelControls(node) {
  let fetch = findWidget(node, FETCH_MODELS_WIDGET);
  if (!fetch) {
    fetch = node.addWidget?.("button", FETCH_MODELS_WIDGET, null, () => {
      void refreshModels(node);
    });
    if (fetch) fetch.serialize = false;
  }
  let list = findWidget(node, MODEL_LIST_WIDGET);
  if (!list) {
    list = node.addWidget?.("combo", MODEL_LIST_WIDGET, "", (value) => {
      const model = findWidget(node, MODEL_WIDGET);
      if (!model || !value) return;
      model.value = value;
      model.callback?.(value);
    }, { values: [] });
    if (list) list.serialize = false;
  }
  let status = findWidget(node, MODEL_STATUS_WIDGET);
  if (!status) {
    status = node.addWidget?.("text", MODEL_STATUS_WIDGET, "", () => {});
    if (status) status.serialize = false;
  }
}

function ensureSkillControls(node) {
  let refresh = findWidget(node, REFRESH_SKILLS_WIDGET);
  if (!refresh) {
    refresh = node.addWidget?.("button", REFRESH_SKILLS_WIDGET, null, () => {
      void refreshSkills(node);
    });
    if (refresh) refresh.serialize = false;
  }
  let status = findWidget(node, SKILL_STATUS_WIDGET);
  if (!status) {
    status = node.addWidget?.("text", SKILL_STATUS_WIDGET, "", () => {});
    if (status) status.serialize = false;
  }
}

function ensureApiButton(node) {
  let widget = findWidget(node, API_WIDGET);
  if (widget) return widget;
  widget = node.addWidget?.("button", API_WIDGET, null, () => {
    window.open(API_APPLY_URL, "_blank", "noopener,noreferrer");
  });
  if (widget) widget.serialize = false;
  return widget;
}

function setModelRefreshStatus(node, message) {
  const widget = findWidget(node, MODEL_STATUS_WIDGET);
  if (!widget) return;
  widget.value = String(message || "");
  node.__lingzhiMultiFunctionModelStatusVisible = Boolean(widget.value);
}

function setSkillRefreshStatus(node, message) {
  const widget = findWidget(node, SKILL_STATUS_WIDGET);
  if (!widget) return;
  widget.value = String(message || "");
  node.__lingzhiMultiFunctionSkillStatusVisible = Boolean(widget.value);
}

function labelH3Duration(node) {
  const widget = findWidget(node, "H3目标时长");
  if (widget) widget.label = "目标时长";
}

function applyNodePolicy(node, { conservative = false } = {}) {
  if (!node || node.__lingzhiMultiFunctionApplying) return;
  node.__lingzhiMultiFunctionApplying = true;
  try {
    ensureNativeSeedControl(node);
    ensureModelControls(node);
    ensureSkillControls(node);
    ensureAdvancedToggle(node);
    ensureApiButton(node);
    labelH3Duration(node);

    const values = widgetValues(node);
    const feature = String(values[FEATURE_WIDGET] || "H3");
    const visible = visibleWidgetNames(feature, values);
    const showSkills = skillControlsVisible(feature);
    for (const widget of node.widgets || []) {
      const shouldShow = widget.name === ADVANCED_WIDGET
        || widget.name === FETCH_MODELS_WIDGET
        || (widget.name === MODEL_LIST_WIDGET && node.__lingzhiMultiFunctionModelListLoaded)
        || (widget.name === MODEL_STATUS_WIDGET && node.__lingzhiMultiFunctionModelStatusVisible)
        || (widget.name === REFRESH_SKILLS_WIDGET && showSkills)
        || (widget.name === SKILL_STATUS_WIDGET
          && showSkills
          && node.__lingzhiMultiFunctionSkillStatusVisible)
        || widget.name === API_WIDGET
        || visible.has(widget.name);
      setWidgetVisible(widget, shouldShow);
    }

    const portsChanged = reconcilePorts(node, feature, values, conservative);
    updateWarningStatus(node);
    if (portsChanged) node.onResize?.(node.size);
    resizeNode(node);
  } finally {
    node.__lingzhiMultiFunctionApplying = false;
  }
}

function applyConnectionsOnly(node, conservative = false) {
  const values = widgetValues(node);
  const feature = String(values[FEATURE_WIDGET] || "H3");
  const portsChanged = reconcilePorts(node, feature, values, conservative);
  updateWarningStatus(node);
  if (portsChanged) node.onResize?.(node.size);
  node.setDirtyCanvas?.(true, true);
}

function updateModelOptions(node, models) {
  const widget = findWidget(node, MODEL_WIDGET);
  if (!widget) return;
  const options = [...new Set(["智能选择", ...(models || []).filter(Boolean)])];
  const current = String(widget.value || "智能选择");
  updateCombo(widget, options, modelSelectionAfterRefresh(current, options));
  if (!options.includes(current)) setModelLocked(node, false);
}

function clearModelListOptions(node, { resetSelection = false } = {}) {
  const list = findWidget(node, MODEL_LIST_WIDGET);
  if (list) {
    list.options = list.options || {};
    list.options.values = [];
    list.value = "";
  }
  node.__lingzhiMultiFunctionModelListLoaded = false;
  if (resetSelection) {
    const model = findWidget(node, MODEL_WIDGET);
    if (model) updateCombo(model, ["智能选择"], "智能选择");
    setModelLocked(node, false);
  }
}

function updateModelListOptions(node, models) {
  const widget = findWidget(node, MODEL_LIST_WIDGET);
  if (!widget) return;
  const options = [...new Set((models || []).filter((model) => model && model !== "智能选择"))];
  if (!options.length) return;
  const selected = String(findWidget(node, MODEL_WIDGET)?.value || options[0]);
  updateCombo(widget, options, options.includes(selected) ? selected : options[0]);
  node.__lingzhiMultiFunctionModelListLoaded = true;
}

function setModelLocked(node, locked) {
  node.__lingzhiMultiFunctionModelLocked = Boolean(locked);
  node.properties = persistModelLock(node.properties, locked);
}

function restoreModelLock(node) {
  const current = String(findWidget(node, MODEL_WIDGET)?.value || "智能选择");
  setModelLocked(node, modelLockFromWorkflow(node.properties, current));
}

function modelRefreshQueue(node) {
  if (node.__lingzhiMultiFunctionModelQueue) return node.__lingzhiMultiFunctionModelQueue;
  node.__lingzhiMultiFunctionModelQueue = createLatestRequestQueue(async (request, isLatest) => {
    try {
      const response = await api.fetchApi(MODEL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: request.apiKey, channel: request.channel }),
      });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload?.models)) throw new Error("model discovery failed");
      if (!isLatest()) return null;
      updateModelOptions(node, payload.models);
      updateModelListOptions(node, payload.models);
      const models = payload.models.filter((model) => model !== "智能选择");
      setModelRefreshStatus(node, String(payload.warning || "") || `已获取 ${models.length} 个模型`);
      applyNodePolicy(node);
      return payload.models;
    } catch (_error) {
      if (!isLatest()) return null;
      updateModelOptions(node, ["智能选择"]);
      setModelRefreshStatus(node, "模型列表暂时不可用，请检查后台日志。");
      applyNodePolicy(node);
      console.warn("[Lingzhi] 多功能提示词增强器暂时无法刷新模型列表");
      return null;
    }
  });
  return node.__lingzhiMultiFunctionModelQueue;
}

function getLinkedWidgetValue(node, inputName) {
  const input = (node?.inputs || []).find((item) => item?.name === inputName);
  const link = input?.link != null ? app.graph?.links?.[input.link] : null;
  const sourceNode = link ? app.graph?.getNodeById?.(link.origin_id) : null;
  if (!sourceNode) return "";
  const names = [inputName, "API密钥", "api_key", "API Key", "key", "value", "字符串", "文本"];
  for (const name of names) {
    const value = String(sourceNode.widgets?.find((item) => item?.name === name)?.value || "").trim();
    if (value) return value;
  }
  for (const widget of sourceNode.widgets || []) {
    const value = String(widget?.value || "").trim();
    if (value) return value;
  }
  return "";
}

function getWidgetOrLinkedValue(node, inputName) {
  const input = (node?.inputs || []).find((item) => item?.name === inputName);
  const linked = input?.link != null ? getLinkedWidgetValue(node, inputName) : "";
  return linked || String(findWidget(node, inputName)?.value || "").trim();
}

async function refreshModels(node) {
  node.__lingzhiMultiFunctionModelInitialized = true;
  const apiKey = getWidgetOrLinkedValue(node, "API密钥");
  const channel = String(findWidget(node, CHANNEL_WIDGET)?.value || "自动");
  setModelRefreshStatus(node, "正在获取模型列表...");
  applyNodePolicy(node);
  return modelRefreshQueue(node).run({ apiKey, channel });
}

async function refreshSkills(node) {
  setSkillRefreshStatus(node, "正在刷新Skill列表...");
  applyNodePolicy(node);
  try {
    const response = await api.fetchApi(SKILL_ENDPOINT, { method: "POST" });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload?.skills)) throw new Error("invalid skill catalog");
    const widget = findWidget(node, SKILL_WIDGET);
    if (widget) {
      const options = ["自动选择", ...new Set(payload.skills.filter(Boolean))];
      widget.options = widget.options || {};
      widget.options.values = options;
      widget.value = skillSelectionAfterRefresh(widget.value, payload.skills);
    }
    setSkillRefreshStatus(node, String(payload.warning || "") || `已获取 ${payload.skills.length} 个Skill`);
  } catch (_error) {
    setSkillRefreshStatus(node, "Skill列表暂时不可用，请检查后台日志。");
    console.warn("[Lingzhi] 多功能提示词增强器暂时无法刷新Skill列表");
  }
  applyNodePolicy(node);
}

function installCallbacks(node) {
  for (const widget of node.widgets || []) {
    if (!widget || widget.__lingzhiMultiFunctionCallbackInstalled) continue;
    if (widget.name !== MODEL_WIDGET && !PANEL_CALLBACK_WIDGETS.has(widget.name)) continue;
    widget.__lingzhiMultiFunctionCallbackInstalled = true;
    const original = widget.callback;
    widget.callback = function (value) {
      const result = original ? original.apply(this, arguments) : undefined;
      if (widget.name === MODEL_WIDGET) {
        setModelLocked(node, String(value || "") !== "智能选择");
      }
      if (widget.name === CHANNEL_WIDGET) {
        clearModelListOptions(node, { resetSelection: true });
        void refreshModels(node);
      }
      if (PANEL_CALLBACK_WIDGETS.has(widget.name)) applyNodePolicy(node);
      return result;
    };
  }
}

function initialize(node, { conservative = false } = {}) {
  if (!isTarget(node)) return;
  restoreModelLock(node);
  applyNodePolicy(node, { conservative });
  installCallbacks(node);
  scheduleInitialModelRefresh(node);
}

function scheduleInitialize(node, options = {}) {
  setTimeout(() => initialize(node, options), 0);
}

function scheduleInitialModelRefresh(node) {
  if (node.__lingzhiMultiFunctionModelInitialized) return;
  if (node.__lingzhiMultiFunctionModelInitTimer) {
    clearTimeout(node.__lingzhiMultiFunctionModelInitTimer);
  }
  node.__lingzhiMultiFunctionModelInitTimer = setTimeout(() => {
    delete node.__lingzhiMultiFunctionModelInitTimer;
    if (node.__lingzhiMultiFunctionModelInitialized) return;
    void refreshModels(node);
  }, 50);
}

app.registerExtension({
  name: "Lingzhi.MultiFunctionPromptEnhancerUI",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!NODE_CLASSES.has(nodeData?.name)) return;

    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created ? created.apply(this, arguments) : undefined;
      initialize(this, { conservative: true });
      scheduleInitialize(this);
      return result;
    };

    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = configured ? configured.apply(this, arguments) : undefined;
      scheduleInitialize(this);
      return result;
    };

    const connectionsChanged = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const result = connectionsChanged ? connectionsChanged.apply(this, arguments) : undefined;
      setTimeout(() => applyConnectionsOnly(this), 0);
      return result;
    };
  },
  nodeCreated(node) {
    if (isTarget(node)) initialize(node, { conservative: true });
  },
  loadedGraphNode(node) {
    if (isTarget(node)) scheduleInitialize(node);
  },
});
