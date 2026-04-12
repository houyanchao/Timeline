/**
 * Mirror Site Entry Point
 *
 * 检测当前页面是否为用户配置的镜像站，
 * 如果是，初始化浮窗按钮（提示词复制模式）。
 */

(async function initMirrorSite() {
    // 已适配的平台不需要镜像站模式
    if (typeof getCurrentPlatform === 'function' && getCurrentPlatform()) {
        return;
    }

    // 加载用户配置的镜像站域名
    if (typeof loadMirrorSiteDomains === 'function') {
        await loadMirrorSiteDomains();
    }

    if (typeof isCurrentMirrorSite === 'function' && isCurrentMirrorSite()) {
        console.log('[MirrorSite] Detected mirror site, initializing float button');
        const floatButton = new MirrorSiteFloatButton();
        await floatButton.init();
        window._mirrorSiteFloatButton = floatButton;
    }

    // 监听域名配置变化，动态响应
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName !== 'local' || !changes.mirrorSiteDomains) return;

        if (typeof loadMirrorSiteDomains === 'function') {
            await loadMirrorSiteDomains();
        }

        const wasActive = !!window._mirrorSiteFloatButton;
        const isNowMirror = typeof isMirrorSite === 'function' && !getCurrentPlatform() && isMirrorSite(location.href);

        if (isNowMirror && !wasActive) {
            const fb = new MirrorSiteFloatButton();
            fb.init();
            window._mirrorSiteFloatButton = fb;
        } else if (!isNowMirror && wasActive) {
            window._mirrorSiteFloatButton.destroy();
            window._mirrorSiteFloatButton = null;
        }
    });
})();
