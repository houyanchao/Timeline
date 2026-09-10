/**
 * Snail Animation — 养成版
 * 默认 1 只大蜗牛，消息达标后新增小蜗牛跟班，最多 3 只
 */
class SnailAnimation {
    constructor() {
        this.id = 'snail';
        this.icon = '🐌';
        this.maxCount = 7;
        this.growAt = [10, 100, 300, 500, 700, 900, 1100];
        this._el = null;
        this.marchDuration = 60;
        this._leaderSize = 45;
        this._followerSize = 28;
        this._colorIds = ['b', 'c', 'd', 'e', 'f', 'g'];
    }

    get name() {
        return TimelineI18n.getMessage('animSnail') || 'Snail Parade';
    }

    _snailSvg(id, w) {
        const colors = {
            a: ['#FF8A80','#FF5252','#D32F2F','#B71C1C'],
            b: ['#FFCC80','#FFA726','#EF6C00','#E65100'],
            c: ['#FFF59D','#FFEE58','#F9A825','#F57F17'],
            d: ['#A5D6A7','#66BB6A','#43A047','#1B5E20'],
            e: ['#81D4FA','#42A5F5','#1E88E5','#0D47A1'],
            f: ['#9FA8DA','#5C6BC0','#3949AB','#1A237E'],
            g: ['#CE93D8','#AB47BC','#8E24AA','#4A148C']
        };
        const h = Math.round(w * 36 / 52);
        const c = colors[id] || colors.a;
        return `<svg viewBox="0 0 52 36" width="${w}" height="${h}" fill="none"><defs><radialGradient id="ss${id}${w}" cx="42%" cy="35%"><stop offset="0%" stop-color="${c[0]}"/><stop offset="45%" stop-color="${c[1]}"/><stop offset="78%" stop-color="${c[2]}"/><stop offset="100%" stop-color="${c[3]}"/></radialGradient></defs><ellipse cx="22" cy="17" rx="13" ry="12" fill="url(#ss${id}${w})" stroke="${c[2]}" stroke-width="0.6"/><path d="M29 11Q34 17 29 23Q24 28 18 23Q13 18 18 13Q22 9 26 13Q29 16 25 19Q22 21 20 18Q18 15 21 14" stroke="${c[3]}" stroke-width="1.2" fill="none" opacity="0.35" stroke-linecap="round"/><path d="M13 21Q17 27 27 25" stroke="${c[0]}" stroke-width="0.7" fill="none" opacity="0.25"/><ellipse cx="18" cy="13" rx="3.5" ry="2.5" fill="#fff" opacity="0.22"/><circle cx="16" cy="11.5" r="1.2" fill="#fff" opacity="0.35"/><ellipse cx="28" cy="29" rx="18" ry="5" fill="#FFD166"/><ellipse cx="44" cy="24" rx="6" ry="5.5" fill="#FFD166"/><g class="snail-eye-l"><line x1="41" y1="19" x2="39" y2="13" stroke="#E8B830" stroke-width="1.5" stroke-linecap="round"/><circle cx="39" cy="12" r="2.2" fill="#fff" stroke="#333" stroke-width=".8"/><circle cx="39.5" cy="11.8" r="1" fill="#333"/></g><g class="snail-eye-r"><line x1="47" y1="19" x2="49" y2="13" stroke="#E8B830" stroke-width="1.5" stroke-linecap="round"/><circle cx="49" cy="12" r="2.2" fill="#fff" stroke="#333" stroke-width=".8"/><circle cx="49.5" cy="11.8" r="1" fill="#333"/></g><path d="M42 27Q44 29 46 27" stroke="#C77B35" stroke-width=".8" fill="none" stroke-linecap="round"/></svg>`;
    }

    create(count) {
        if (this._el) return;
        const n = Math.min(count || 1, this.maxCount);
        let items = '';
        for (let i = 0; i < n - 1; i++) {
            items += `<span class="snail-item snail-bob-${(i % 3) + 1}">${this._snailSvg(this._colorIds[i % this._colorIds.length], this._followerSize)}</span>`;
        }
        items += `<span class="snail-item snail-bob-3 snail-leader">${this._snailSvg('a', this._leaderSize)}</span>`;
        const el = document.createElement('div');
        el.className = 'ait-snail-parade';
        el.innerHTML = `<div class="snail-parade-track"><div class="snail-parade-group">${items}</div></div>`;
        document.body.appendChild(el);
        this._el = el;
    }

    addFollower(newCount) {
        if (!this._el) return;
        const group = this._el.querySelector('.snail-parade-group');
        const leader = group?.querySelector('.snail-leader');
        if (!group || !leader) return;
        const i = newCount - 2;
        const span = document.createElement('span');
        span.className = `snail-item snail-bob-${(i % 3) + 1}`;
        span.innerHTML = this._snailSvg(this._colorIds[i % this._colorIds.length], this._followerSize);
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
