/**
 * Prompt Dropdown UI - 共享的提示词下拉菜单渲染
 *
 * 供 PromptButtonManager（插入模式）和 MirrorSiteFloatButton（复制模式）共用，
 * 统一渲染逻辑，调用方只需提供行为回调。
 *
 * @param {Object} options
 * @param {Array}    options.prompts        - 提示词列表（已过滤）
 * @param {Function} options.onItemClick    - (prompt, itemElement) => void
 * @param {Function} options.onManageClick  - () => void  点击 "+" 按钮
 * @param {string}   [options.tooltipPlacement='right'] - tooltip 方向
 * @returns {HTMLElement} prompt-dropdown-container 元素（未添加到 DOM）
 */
function createPromptDropdownUI({ prompts, onItemClick, onManageClick, tooltipPlacement = 'right' }) {
    const container = document.createElement('div');
    container.className = 'prompt-dropdown-container';

    // ===== Header =====
    const header = document.createElement('div');
    header.className = 'prompt-dropdown-header';
    header.innerHTML = `
        <div class="prompt-dropdown-title-wrapper">
            <svg class="prompt-dropdown-title-icon" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span class="prompt-dropdown-title">${chrome.i18n.getMessage('hosegod')}</span>
        </div>
        <button class="prompt-dropdown-action-btn prompt-dropdown-manage-btn">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:14px!important;height:14px!important">
                <path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
    `;
    header.querySelector('.prompt-dropdown-manage-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (onManageClick) onManageClick();
    });
    container.appendChild(header);

    // ===== Sort =====
    const sortedPrompts = [...prompts].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
    });

    // ===== Search =====
    if (sortedPrompts.length >= 5) {
        const searchWrap = document.createElement('div');
        searchWrap.className = 'prompt-dropdown-search';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'prompt-dropdown-search-input';
        searchInput.placeholder = chrome.i18n.getMessage('searchPrompt') || '搜索提示词...';
        searchInput.autocomplete = 'off';
        searchInput.addEventListener('input', () => {
            _promptDropdownFilter(container, searchInput.value.trim().toLowerCase());
        });
        searchWrap.appendChild(searchInput);
        container.appendChild(searchWrap);
    }

    // ===== Body =====
    const body = document.createElement('div');
    body.className = 'prompt-dropdown-body';

    if (sortedPrompts.length > 0) {
        sortedPrompts.forEach(prompt => {
            body.appendChild(_promptDropdownCreateItem(prompt, onItemClick, tooltipPlacement));
        });
    } else {
        const empty = document.createElement('div');
        empty.className = 'prompt-dropdown-empty';
        empty.innerHTML = `
            <div class="prompt-dropdown-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
            </div>
            <span class="prompt-dropdown-empty-text">${chrome.i18n.getMessage('hsiwhwl')}</span>
        `;
        body.appendChild(empty);
    }

    container.appendChild(body);
    return container;
}

function _promptDropdownCreateItem(prompt, onItemClick, tooltipPlacement) {
    const item = document.createElement('div');
    item.className = 'prompt-dropdown-item';

    const name = prompt.name || '';
    const text = prompt.content || '';

    const pinHtml = prompt.pinned ? `
        <span class="prompt-dropdown-item-icon pinned-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5">
                <line x1="5" y1="3" x2="19" y2="3"/>
                <line x1="12" y1="7" x2="12" y2="21"/>
                <polyline points="8 11 12 7 16 11"/>
            </svg>
        </span>
    ` : '';

    const escaped = (t) => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };

    item.innerHTML = `
        <div class="prompt-dropdown-item-main">
            ${pinHtml}<span class="prompt-dropdown-item-name">${escaped(name)}</span>
        </div>
        <div class="prompt-dropdown-item-content">${escaped(text)}</div>
    `;

    item.addEventListener('click', () => {
        if (onItemClick) onItemClick(prompt, item);
    });

    const tooltipId = `prompt-dd-${prompt.id}`;
    item.addEventListener('mouseenter', () => {
        if (!window.globalTooltipManager || !prompt.content) return;
        const contentEl = item.querySelector('.prompt-dropdown-item-content');
        if (!contentEl || contentEl.scrollWidth <= contentEl.clientWidth) return;
        window.globalTooltipManager.show(tooltipId, 'button', item, prompt.content, {
            placement: tooltipPlacement,
            maxWidth: 300,
            showDelay: 300,
            gap: 14,
            color: {
                light: { backgroundColor: '#0d0d0d', textColor: '#ffffff', borderColor: '#0d0d0d' },
                dark: { backgroundColor: '#ffffff', textColor: '#1f2937', borderColor: '#e5e7eb' }
            }
        });
    });
    item.addEventListener('mouseleave', () => {
        if (window.globalTooltipManager) window.globalTooltipManager.hide();
    });

    return item;
}

function _promptDropdownFilter(container, query) {
    const body = container.querySelector('.prompt-dropdown-body');
    if (!body) return;
    const items = body.querySelectorAll('.prompt-dropdown-item');
    let visible = 0;
    items.forEach(item => {
        const n = item.querySelector('.prompt-dropdown-item-name')?.textContent || '';
        const c = item.querySelector('.prompt-dropdown-item-content')?.textContent || '';
        const ok = !query || n.toLowerCase().includes(query) || c.toLowerCase().includes(query);
        item.style.display = ok ? '' : 'none';
        if (ok) visible++;
    });
    let tip = body.querySelector('.prompt-dropdown-search-empty');
    if (visible === 0 && query) {
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'prompt-dropdown-search-empty';
            tip.textContent = chrome.i18n.getMessage('jwvnkp') || 'No results';
            body.appendChild(tip);
        }
        tip.style.display = '';
    } else if (tip) {
        tip.style.display = 'none';
    }
}
