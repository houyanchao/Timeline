/**
 * Ant Animation — 养成版
 * 默认 1 只大蚂蚁，消息达标后新增小蚂蚁跟班，最多 6 只
 */
class AntAnimation {
    constructor() {
        this.id = 'ant';
        this.icon = '🐜';
        this.maxCount = 7;
        this.growAt = [10, 100, 300, 500, 700, 900, 1100];
        this._el = null;
        this.marchDuration = 40;
        this._leaderSize = 26;
        this._followerSize = 16;
        this._followerColors = ['#4A3728', '#5A4738', '#4A3728', '#5A4738', '#4A3728'];
    }

    get name() {
        return TimelineI18n.getMessage('animAnt') || 'Ant March';
    }

    _antSvg(w, color) {
        const h = Math.round(w * 28 / 36);
        return `<svg viewBox="0 0 36 28" width="${w}" height="${h}" fill="none"><ellipse cx="10" cy="18" rx="8" ry="6" fill="${color}"/><ellipse cx="10" cy="16" rx="6" ry="3" fill="${color}" opacity="0.3"/><ellipse cx="20" cy="17" rx="5" ry="4.5" fill="${color}"/><ellipse cx="29" cy="15" rx="5.5" ry="5" fill="${color}"/><circle cx="31.5" cy="13.5" r="1.3" fill="#fff"/><circle cx="31.8" cy="13.3" r="0.7" fill="#111"/><path d="M31 10Q34 4 36 2" stroke="${color}" stroke-width="1" fill="none" stroke-linecap="round" class="ant-antenna-r"/><path d="M29 10Q30 3 28 1" stroke="${color}" stroke-width="1" fill="none" stroke-linecap="round" class="ant-antenna-l"/><circle cx="36" cy="2" r="0.8" fill="${color}" class="ant-antenna-r"/><circle cx="28" cy="1" r="0.8" fill="${color}" class="ant-antenna-l"/><line x1="24" y1="20" x2="28" y2="26" stroke="${color}" stroke-width="1" stroke-linecap="round" class="ant-leg-1"/><line x1="20" y1="21" x2="22" y2="27" stroke="${color}" stroke-width="1" stroke-linecap="round" class="ant-leg-2"/><line x1="16" y1="21" x2="14" y2="27" stroke="${color}" stroke-width="1" stroke-linecap="round" class="ant-leg-3"/><line x1="24" y1="20" x2="26" y2="26" stroke="${color}" stroke-width="1" stroke-linecap="round" class="ant-leg-4"/><line x1="20" y1="21" x2="18" y2="27" stroke="${color}" stroke-width="1" stroke-linecap="round" class="ant-leg-5"/><line x1="16" y1="21" x2="12" y2="26" stroke="${color}" stroke-width="1" stroke-linecap="round" class="ant-leg-6"/></svg>`;
    }

    create(count) {
        if (this._el) return;
        const n = Math.min(count || 1, this.maxCount);
        let items = '';
        for (let i = 0; i < n - 1; i++) {
            items += `<span class="ant-item ant-bob-${(i % 3) + 1}">${this._antSvg(this._followerSize, this._followerColors[i % this._followerColors.length])}</span>`;
        }
        items += `<span class="ant-item ant-bob-${(n % 3) + 1} ant-leader">${this._antSvg(this._leaderSize, '#3A2718')}</span>`;
        const el = document.createElement('div');
        el.className = 'ait-ant-parade';
        el.innerHTML = `<div class="ant-track"><div class="ant-group">${items}</div></div>`;
        document.body.appendChild(el);
        this._el = el;
    }

    addFollower(newCount) {
        if (!this._el) return;
        const group = this._el.querySelector('.ant-group');
        const leader = group?.querySelector('.ant-leader');
        if (!group || !leader) return;
        const i = newCount - 2;
        const span = document.createElement('span');
        span.className = `ant-item ant-bob-${(i % 3) + 1}`;
        span.innerHTML = this._antSvg(this._followerSize, this._followerColors[i % this._followerColors.length]);
        group.insertBefore(span, leader);
    }

    updatePosition(referenceRect) {
        if (!this._el || !referenceRect?.width) return;
        const s = this._el.style;
        s.left = `${referenceRect.left}px`;
        s.width = `${referenceRect.width}px`;
        s.top = `${referenceRect.top - 26}px`;
        s.setProperty('--pw', `${referenceRect.width}px`);
        if (!this._el.classList.contains('ait-pet-visible')) this._el.classList.add('ait-pet-visible');
    }

    hide() { if (this._el?.classList.contains('ait-pet-visible')) this._el.classList.remove('ait-pet-visible'); }
    destroy() { if (this._el?.parentNode) { this._el.parentNode.removeChild(this._el); this._el = null; } }
}
