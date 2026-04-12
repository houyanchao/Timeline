/**
 * Mirror Site Utils
 *
 * 镜像站点检测工具：加载用户配置的域名列表，判断当前页面是否为镜像站。
 * 依赖 constants.js 中的 getPlatformByUrl（排除已适配平台）。
 */

let _mirrorSiteDomains = null;

async function loadMirrorSiteDomains() {
    try {
        const result = await chrome.storage.local.get('mirrorSiteDomains');
        _mirrorSiteDomains = result.mirrorSiteDomains || [];
    } catch (e) {
        _mirrorSiteDomains = [];
    }
}

function getMirrorSiteDomains() {
    return _mirrorSiteDomains || [];
}

function isMirrorSite(url) {
    if (!_mirrorSiteDomains || _mirrorSiteDomains.length === 0) return false;
    if (getPlatformByUrl(url)) return false;

    try {
        const hostname = new URL(url).hostname;
        return _mirrorSiteDomains.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

function isCurrentMirrorSite() {
    return isMirrorSite(location.href);
}
