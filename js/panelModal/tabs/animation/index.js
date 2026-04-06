/**
 * Animation Tab - 电子宠物管理（含养成进度）
 */

class AnimationTab extends BaseTab {
    constructor() {
        super();
        this.id = 'animation';
        this.name = chrome.i18n.getMessage('animTabTitle') || 'Digital Pet';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>`;
    }

    getInitialState() {
        return { transient: {}, persistent: {} };
    }

    render() {
        const container = document.createElement('div');
        container.className = 'anim-tab-container';

        const desc = document.createElement('div');
        desc.className = 'anim-tab-desc';
        desc.textContent = chrome.i18n.getMessage('animTabDesc') || 'Displayed above the chat box. Cute animals walk around when AI replies.';
        container.appendChild(desc);

        const list = document.createElement('div');
        list.className = 'anim-tab-list';
        this.setDomRef('list', list);
        container.appendChild(list);

        return container;
    }

    async mounted() {
        super.mounted();
        this._renderList();
    }

    unmounted() {
        super.unmounted();
    }

    async _renderList() {
        const list = this.getDomRef('list');
        if (!list || !window.inputBoxAnimationManager) return;

        const mgr = window.inputBoxAnimationManager;
        const animations = mgr.getAll();
        const activeId = mgr.getActiveId();
        list.innerHTML = '';

        if (animations.length === 0) {
            list.innerHTML = `<div class="anim-tab-empty">${chrome.i18n.getMessage('animTabEmpty') || 'No animations available'}</div>`;
            return;
        }

        for (const anim of animations) {
            const item = document.createElement('div');
            item.className = 'anim-tab-item';

            const info = document.createElement('div');
            info.className = 'anim-tab-item-info';
            info.innerHTML = `<span class="anim-tab-item-icon">${anim.icon || ''}</span><span class="anim-tab-item-name">${anim.name}</span>`;

            const toggle = document.createElement('label');
            toggle.className = 'ait-toggle-switch';
            toggle.innerHTML = `<input type="checkbox" ${activeId === anim.id ? 'checked' : ''}><span class="ait-toggle-slider"></span>`;

            const checkbox = toggle.querySelector('input');
            this.addEventListener(checkbox, 'change', async () => {
                await mgr.toggle(anim.id);
                this._renderList();
                if (mgr.getActiveId()) {
                    setTimeout(() => window.panelModal?.hide(), 600);
                }
            });

            item.appendChild(info);
            item.appendChild(toggle);
            list.appendChild(item);
        }
    }
}
