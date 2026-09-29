export const H3_FAST_R2V_MODEL = "LZ-minimax-h3-ow-r2v-fast";
export const H3_AUDIO_MODELS = new Set([
    "LZ-minimax-h3-ow-fl2va-audio-drive-fast",
    "LZ-minimax-h3-ow-ref2va-audio-drive-fast",
]);

export function getH3InputPolicy(model) {
    const modelName = String(model || "").trim();
    return {
        imageCount: modelName === H3_FAST_R2V_MODEL ? 9 : 1,
        usesAudio: H3_AUDIO_MODELS.has(modelName),
    };
}

export function getH3IncompatibleInputs(model, connectedNames) {
    const policy = getH3InputPolicy(model);
    return [...connectedNames].filter((name) => {
        if (name === "audio") return !policy.usesAudio;
        const match = /^image(\d+)$/.exec(name);
        return match ? Number(match[1]) > policy.imageCount : false;
    });
}

export function migrateLegacyH3WidgetValues(values) {
    if (!Array.isArray(values) || typeof values[2] !== "boolean") {
        return values;
    }
    return [...values.slice(0, 2), ...values.slice(3)];
}
