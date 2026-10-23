export const H3_MODE_TEXT = "文生视频";
export const H3_MODE_FRAMES = "首尾帧";
export const H3_MODE_REFERENCE = "参考素材";

export const H3_FRAME_INPUTS = ["首帧", "末帧"];
export const H3_REFERENCE_PREFIXES = {
    参考图: 9,
    参考视频: 3,
    参考音频: 3,
};

export function getH3MediaPolicy(mode) {
    const modeName = String(mode || H3_MODE_TEXT).trim();
    if (modeName === H3_MODE_FRAMES) {
        return { frames: [...H3_FRAME_INPUTS], images: 0, videos: 0, audios: 0 };
    }
    if (modeName === H3_MODE_REFERENCE) {
        return { frames: [], images: 9, videos: 3, audios: 3 };
    }
    return { frames: [], images: 0, videos: 0, audios: 0 };
}

export function isH3MediaInput(name) {
    const inputName = String(name || "").trim();
    if (H3_FRAME_INPUTS.includes(inputName)) return true;
    return Object.keys(H3_REFERENCE_PREFIXES).some((prefix) =>
        new RegExp(`^${prefix}\\d+$`).test(inputName),
    );
}

export function getH3MediaIndex(name, prefix) {
    const inputName = String(name || "").trim();
    if (!inputName.startsWith(prefix)) return 0;
    const value = Number.parseInt(inputName.slice(prefix.length), 10);
    return Number.isFinite(value) ? value : 0;
}

export function getH3IncompatibleInputs(mode, connectedNames) {
    const modeName = String(mode || H3_MODE_TEXT).trim();
    const names = Array.isArray(connectedNames)
        ? connectedNames.map((name) => String(name || "").trim()).filter(Boolean)
        : [];
    return names.filter((name) => {
        if (!isH3MediaInput(name)) return false;
        if (modeName === H3_MODE_TEXT) return true;
        if (modeName === H3_MODE_FRAMES) return !H3_FRAME_INPUTS.includes(name);
        if (modeName === H3_MODE_REFERENCE) {
            if (H3_FRAME_INPUTS.includes(name)) return true;
            return Object.entries(H3_REFERENCE_PREFIXES).some(([prefix, limit]) =>
                name.startsWith(prefix) && getH3MediaIndex(name, prefix) > limit,
            );
        }
        return true;
    });
}
