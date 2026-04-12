/**
 * Doubao Sidebar Starred Adapter
 *
 * 豆包侧边栏 DOM 结构：
 *   [data-history-container="true"] = 聊天历史列表容器
 *   收藏区域插在其上方
 *   会话链接：a[id^="conversation_"] href="/chat/xxx"
 *   标题：span[class*="overallTitle-"]
 *   三个点按钮区域：[class*="feed-list-item-tool-button"]
 *   菜单：Radix UI dropdown（[data-radix-popper-content-wrapper]）
 */

class DoubaoSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    matches() {
        return matchesPlatform(location.href, 'doubao');
    }

    findSidebarContainer() {
        const history = document.querySelector('[data-history-container="true"]');
        if (history?.parentElement) return history.parentElement;
        return null;
    }

    findInsertionPoint() {
        const history = document.querySelector('[data-history-container="true"]');
        if (history?.parentElement) {
            return { parent: history.parentElement, reference: history, position: 'before' };
        }
        return null;
    }

    getPlatformClass() {
        return 'doubao';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            const history = document.querySelector('[data-history-container="true"]');
            if (!history) return false;
            const link = history.querySelector(`a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        return document.querySelectorAll('a[id^="conversation_"]');
    }

    getConversationUrlPath(convEl) {
        try { return new URL(convEl.href).pathname; } catch { return ''; }
    }

    injectStarIcon(convEl) {
        const titleEl = convEl.querySelector('span[class*="overallTitle-"]');
        if (!titleEl || titleEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        titleEl.insertBefore(icon, titleEl.firstChild);
    }

    removeStarIcon(convEl) {
        const icon = convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
        if (icon) icon.remove();
    }

    // ==================== 原生菜单注入 ====================

    getClickDelegateSelector() {
        return '[class*="feed-list-item-tool-button"]';
    }

    getConversationFromClickTarget(el) {
        const convLink = el.closest('a[id^="conversation_"]');
        if (!convLink) return null;
        const titleEl = convLink.querySelector('span[class*="overallTitle-"]');
        return {
            url: convLink.href,
            title: titleEl?.textContent?.trim() || ''
        };
    }

    findCurrentMenuOverlay() {
        const wrappers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
        for (const w of wrappers) {
            if (w.querySelector('[role="menu"]')) return w;
        }
        return null;
    }

    _buildStarSvg(isStarred) {
        return isStarred
            ? '<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="rgb(255,125,3)" stroke="rgb(255,125,3)" stroke-width="0.5"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5"/></svg>';
    }

    createStarMenuItem(overlay, isStarred) {
        const menu = overlay.querySelector('[role="menu"]');
        if (!menu) return null;

        const items = menu.querySelectorAll('[role="menuitem"]');
        if (items.length === 0) return null;

        const refItem = items[0];
        const menuItem = refItem.cloneNode(true);
        menuItem.setAttribute('data-ait-star-folder', 'true');
        menuItem.removeAttribute('aria-disabled');
        menuItem.removeAttribute('data-disabled');
        menuItem.className = refItem.className;

        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        const iconDiv = menuItem.children[0];
        if (iconDiv) iconDiv.innerHTML = this._buildStarSvg(isStarred);

        const labelWrapper = menuItem.children[1];
        if (labelWrapper) {
            const innerDiv = labelWrapper.querySelector('div');
            if (innerDiv) innerDiv.textContent = label;
        }

        if (isStarred) menuItem.style.color = '#ef4444';

        const secondItem = items[1] || null;
        menu.insertBefore(menuItem, secondItem);
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        const iconDiv = menuItem.children[0];
        if (iconDiv) iconDiv.innerHTML = this._buildStarSvg(isStarred);

        const labelWrapper = menuItem.children[1];
        if (labelWrapper) {
            const innerDiv = labelWrapper.querySelector('div');
            if (innerDiv) innerDiv.textContent = label;
        }

        menuItem.style.color = isStarred ? '#ef4444' : '';
    }
}
