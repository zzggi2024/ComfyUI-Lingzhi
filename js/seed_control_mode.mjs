export const WIDGET_CONTROL_MODE_SETTING = "Comfy.WidgetControlMode";

const VALID_MODES = new Set(["before", "after"]);

export function readWidgetControlMode(settings) {
    try {
        const value = settings?.getSettingValue?.(WIDGET_CONTROL_MODE_SETTING);
        return VALID_MODES.has(value) ? value : null;
    } catch {
        return null;
    }
}

export function seedControlLabel(mode) {
    if (mode === "before") return "生成前控制";
    if (mode === "after") return "生成后控制";
    return null;
}
