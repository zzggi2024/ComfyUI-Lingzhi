const COMMON_WIDGETS = [
  "功能类型",
  "运行渠道",
  "模型选择",
  "API密钥",
  "超时时间",
  "创作需求",
  "输出语言",
  "随机种",
  "control_after_generate",
];

const FEATURE_WIDGETS = {
  H3: [
    "Skill选择",
    "生成模式",
    "H3目标时长",
    "画幅比例",
    "镜头数量",
    "改写幅度",
    "提示词模式",
    "场景预设",
    "原生音频",
  ],
  Seedance: [
    "任务意图",
    "目标时长",
    "镜头数量",
    "组织方式",
    "改写幅度",
    "提示词模式",
  ],
  "Music 3": [
    "歌词模式",
    "歌词语言",
    "目标时长",
    "创作幅度",
    "质量模式",
    "歌曲结构",
  ],
};

const ADVANCED_WIDGETS = {
  H3: ["参考模板", "素材补充", "硬性要求"],
  Seedance: ["参考模板", "素材用途", "素材补充", "硬性要求"],
  "Music 3": ["BPM", "调式", "拍号", "硬性要求与排除项"],
};

const ACTION_ORDER = [
  "随机种",
  "control_after_generate",
  "获取模型列表",
  "可用模型列表",
  "模型获取状态",
  "刷新Skill列表",
  "Skill刷新状态",
  "打开API申请地址",
];

export function visibleWidgetNames(feature, values = {}) {
  const visible = new Set(COMMON_WIDGETS);
  for (const name of FEATURE_WIDGETS[feature] || []) visible.add(name);

  if (feature === "Music 3") {
    const lyricsMode = String(values["歌词模式"] || "自动");
    const songStructure = String(values["歌曲结构"] || "自动");
    if (["严格保留", "按要求润色"].includes(lyricsMode)) visible.add("原歌词");
    if (lyricsMode === "按要求润色") visible.add("润色要求");
    if (songStructure === "自定义") visible.add("自定义结构标签");
  }

  if (values.__advancedExpanded === true || values["高级设置"] === true) {
    for (const name of ADVANCED_WIDGETS[feature] || []) visible.add(name);
  }
  return visible;
}

export function skillSelectionAfterRefresh(current, skills) {
  const available = new Set((skills || []).filter(Boolean));
  return available.has(String(current || "")) ? String(current) : "自动选择";
}

export function skillControlsVisible(feature) {
  return String(feature || "H3") === "H3";
}

export function normalizedSeedValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function orderedWidgetNames(names) {
  const priorities = new Map(ACTION_ORDER.map((name, index) => [name, index]));
  return [...names].sort((left, right) => {
    const leftPriority = priorities.get(left) ?? -1;
    const rightPriority = priorities.get(right) ?? -1;
    return leftPriority - rightPriority;
  });
}

export { ACTION_ORDER, ADVANCED_WIDGETS, COMMON_WIDGETS, FEATURE_WIDGETS };
