/**
 * Zombie Animation — 养成版
 * 默认 1 只大僵尸，消息达标后新增小僵尸跟班，最多 7 只
 * 每只僵尸拥有独特的形象
 */
class ZombieAnimation {
    constructor() {
        this.id = 'zombie';
        this.icon = '🧟';
        this.maxCount = 7;
        this.growAt = [10, 100, 300, 500, 700, 900, 1100];
        this._el = null;
        this.marchDuration = 50;
        this._leaderSize = 19;
        this._followerSize = 12;
        this._types = [
            // 0 Leader: 经典僵尸 — 蓬乱深绿头发，棕色破旧衣服
            { skin: '#7EA85E', shirt: '#6B5B4E', pants: '#4A5568', shoes: '#2D3748',
              hair: '<path d="M6 8Q4 2 10 3Q12 0 16 2Q20 0 22 4Q25 3 24 8" fill="#2F4F2F" stroke="#2F4F2F" stroke-width="0.5"/>',
              extra: '' },
            // 1: 海盗僵尸 — 红头巾 + 独眼眼罩
            { skin: '#5E9B8E', shirt: '#8B4513', pants: '#5A4030', shoes: '#3A2818',
              hair: '<rect x="5" y="2" width="18" height="6" rx="2" fill="#D32F2F"/><path d="M5 5Q14 1 23 5" fill="#D32F2F"/><line x1="6" y1="8" x2="22" y2="8" stroke="#B71C1C" stroke-width="0.5"/>',
              extra: '<line x1="16" y1="9" x2="20" y2="14" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><circle cx="18" cy="11" r="2.2" fill="#222"/>' },
            // 2: 科学怪人 — 方形平顶 + 脖子螺栓
            { skin: '#6B8E5E', shirt: '#4A4A4A', pants: '#3A3A3A', shoes: '#222',
              hair: '<rect x="5" y="1" width="18" height="7" rx="1" fill="#3A5A3A"/><line x1="5" y1="8" x2="23" y2="8" stroke="#2A4A2A" stroke-width="0.8"/>',
              extra: '<circle cx="4.5" cy="12" r="1.5" fill="#999" stroke="#666" stroke-width="0.4"/><circle cx="23.5" cy="12" r="1.5" fill="#999" stroke="#666" stroke-width="0.4"/>' },
            // 3: 木乃伊僵尸 — 绷带缠头
            { skin: '#D4C5A9', shirt: '#C8B890', pants: '#B8A880', shoes: '#A89870',
              hair: '<path d="M6 3Q14 0 22 3L22 8L6 8Z" fill="#E8DCC8"/><line x1="7" y1="4.5" x2="21" y2="4.5" stroke="#BDB09A" stroke-width="0.8"/><line x1="7" y1="6.5" x2="21" y2="6.5" stroke="#BDB09A" stroke-width="0.8"/>',
              extra: '<line x1="8" y1="13" x2="12" y2="15" stroke="#BDB09A" stroke-width="0.8"/><line x1="16" y1="13" x2="20" y2="15" stroke="#BDB09A" stroke-width="0.8"/>' },
            // 4: 牛仔僵尸 — 宽檐牛仔帽
            { skin: '#8EBB6E', shirt: '#A0522D', pants: '#4A6A8A', shoes: '#5C4033',
              hair: '<ellipse cx="14" cy="6" rx="14" ry="2.5" fill="#8B6914"/><rect x="7" y="-1" width="14" height="7" rx="2" fill="#A0842B"/><path d="M7 6Q14 4 21 6" fill="#8B6914"/>',
              extra: '' },
            // 5: 士兵僵尸 — 军绿钢盔
            { skin: '#6E9850', shirt: '#556B2F', pants: '#4A5540', shoes: '#2D3020',
              hair: '<ellipse cx="14" cy="5" rx="12" ry="5" fill="#4B5320"/><path d="M2 5Q14 3 26 5Q14 8 2 5Z" fill="#556B2F"/>',
              extra: '' },
            // 6: 国王僵尸 — 金色皇冠 + 紫色长袍
            { skin: '#9B8EC8', shirt: '#4A1A6B', pants: '#3A1058', shoes: '#2A0A48',
              hair: '<path d="M5 6L7 -1L10 4L14 -2L18 4L21 -1L23 6Z" fill="#FFD700" stroke="#DAA520" stroke-width="0.5"/><circle cx="10" cy="0" r="1" fill="#FF0000"/><circle cx="14" cy="-1" r="1" fill="#4169E1"/><circle cx="18" cy="0" r="1" fill="#50C878"/>',
              extra: '<path d="M4 19Q1 26 4 33L7 22Z" fill="#4A1A6B" opacity="0.7"/><path d="M24 19Q27 26 24 33L21 22Z" fill="#4A1A6B" opacity="0.7"/>' }
        ];
    }

    get name() {
        return TimelineI18n.getMessage('animZombie') || 'Zombie Walk';
    }

    _zombieSvg(w, typeIdx) {
        const t = this._types[typeIdx % this._types.length];
        const h = Math.round(w * 50 / 28);
        const hasPatch = typeIdx % this._types.length === 1;
        const eyeL = hasPatch ? '' : `<circle cx="11" cy="11" r="2.2" fill="#fff"/><circle cx="11.3" cy="11.5" r="1.2" fill="#222"/>`;
        return `<svg viewBox="0 0 28 50" width="${w}" height="${h}" fill="none"><g transform="rotate(3, 14, 40)"><g class="z-arm-back"><line x1="8" y1="22" x2="2" y2="30" stroke="${t.skin}" stroke-width="2.5" stroke-linecap="round"/><circle cx="2" cy="30.5" r="1.8" fill="${t.skin}"/></g><rect x="7" y="32" width="5.5" height="11" rx="2" fill="${t.pants}" class="z-leg-l"/><rect x="14.5" y="32" width="5.5" height="11" rx="2" fill="${t.pants}" class="z-leg-r"/><ellipse cx="9.5" cy="43.5" rx="3.5" ry="1.8" fill="${t.shoes}" class="z-leg-l"/><ellipse cx="17.5" cy="43.5" rx="3.5" ry="1.8" fill="${t.shoes}" class="z-leg-r"/><rect x="6" y="19" width="16" height="14" rx="3" fill="${t.shirt}"/><g class="z-arm-front"><line x1="20" y1="21" x2="28" y2="19" stroke="${t.skin}" stroke-width="2.5" stroke-linecap="round"/><circle cx="28" cy="19" r="1.8" fill="${t.skin}"/></g><rect x="6" y="2" width="16" height="17" rx="4" fill="${t.skin}"/>${t.hair}${eyeL}<circle cx="18" cy="11" r="2.2" fill="#fff"/><circle cx="18.3" cy="11.5" r="1.2" fill="#222"/><path d="M10 16Q14 19 19 16" stroke="#3A4A2A" stroke-width="0.8" fill="#2A3A1A"/><line x1="12" y1="16.3" x2="12" y2="17.3" stroke="#fff" stroke-width="0.8"/><line x1="14.5" y1="16.8" x2="14.5" y2="17.8" stroke="#fff" stroke-width="0.8"/><line x1="17" y1="16.3" x2="17" y2="17.3" stroke="#fff" stroke-width="0.8"/>${t.extra}</g></svg>`;
    }

    create(count) {
        if (this._el) return;
        const n = Math.min(count || 1, this.maxCount);
        let items = '';
        for (let i = 0; i < n - 1; i++) {
            items += `<span class="zombie-item z-bob-${(i % 5) + 1}">${this._zombieSvg(this._followerSize, i + 1)}</span>`;
        }
        items += `<span class="zombie-item z-bob-1 zombie-leader">${this._zombieSvg(this._leaderSize, 0)}</span>`;
        const el = document.createElement('div');
        el.className = 'ait-zombie-parade';
        el.innerHTML = `<div class="zombie-track"><div class="zombie-group">${items}</div></div>`;
        document.body.appendChild(el);
        this._el = el;
    }

    addFollower(newCount) {
        if (!this._el) return;
        const group = this._el.querySelector('.zombie-group');
        const leader = group?.querySelector('.zombie-leader');
        if (!group || !leader) return;
        const i = newCount - 2;
        const span = document.createElement('span');
        span.className = `zombie-item z-bob-${(i % 5) + 1}`;
        span.innerHTML = this._zombieSvg(this._followerSize, i + 1);
        group.insertBefore(span, leader);
    }

    updatePosition(referenceRect) {
        if (!this._el || !referenceRect?.width) return;
        const s = this._el.style;
        s.left = `${referenceRect.left}px`;
        s.width = `${referenceRect.width}px`;
        s.top = `${referenceRect.top - 40}px`;
        s.setProperty('--pw', `${referenceRect.width}px`);
        if (!this._el.classList.contains('ait-pet-visible')) this._el.classList.add('ait-pet-visible');
    }

    hide() { if (this._el?.classList.contains('ait-pet-visible')) this._el.classList.remove('ait-pet-visible'); }
    destroy() { if (this._el?.parentNode) { this._el.parentNode.removeChild(this._el); this._el = null; } }
}
