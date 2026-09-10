/**
 * Wizard Animation — 养成版
 * 默认 1 只大巫师，消息达标后新增小巫师跟班，最多 7 只
 * 每只巫师拥有独特的配色风格
 */
class WizardAnimation {
    constructor() {
        this.id = 'wizard';
        this.icon = '🧙';
        this.maxCount = 7;
        this.growAt = [10, 100, 300, 500, 700, 900, 1100];
        this._el = null;
        this.marchDuration = 40;
        this._leaderSize = 60;
        this._followerSize = 36;
        this._types = [
            // 0 Leader: 紫袍巫师 — 经典梅林风格
            { hat: '#5C2D91', brim: '#4A2075', robe: '#5C2D91', cape: '#7B3FA0',
              band: '#FFD700', skin: '#FFCCAA', boots: '#333',
              stars: ['#FFD700','#FFA726','#FFEE58'], hatDeco: '#FFD700' },
            // 1: 红袍巫师 — 火焰法师
            { hat: '#B71C1C', brim: '#8B0000', robe: '#B71C1C', cape: '#D32F2F',
              band: '#FFD700', skin: '#FFCCAA', boots: '#4A1010',
              stars: ['#FF6D00','#FF9100','#FFAB40'], hatDeco: '#FF6D00' },
            // 2: 蓝袍巫师 — 冰霜法师
            { hat: '#0D47A1', brim: '#0A3780', robe: '#0D47A1', cape: '#1565C0',
              band: '#B3E5FC', skin: '#FFE0CC', boots: '#1A237E',
              stars: ['#B3E5FC','#81D4FA','#4FC3F7'], hatDeco: '#B3E5FC' },
            // 3: 绿袍巫师 — 森林德鲁伊
            { hat: '#2E7D32', brim: '#1B5E20', robe: '#2E7D32', cape: '#388E3C',
              band: '#C8E6C9', skin: '#D4A574', boots: '#1B5E20',
              stars: ['#A5D6A7','#81C784','#66BB6A'], hatDeco: '#A5D6A7' },
            // 4: 白袍巫师 — 甘道夫风格
            { hat: '#E0E0E0', brim: '#BDBDBD', robe: '#E0E0E0', cape: '#F5F5F5',
              band: '#FFD700', skin: '#FFCCAA', boots: '#757575',
              stars: ['#FFF9C4','#FFF59D','#FFEE58'], hatDeco: '#FFD700' },
            // 5: 黑袍巫师 — 暗影法师
            { hat: '#212121', brim: '#1A1A1A', robe: '#212121', cape: '#424242',
              band: '#69F0AE', skin: '#C8B89A', boots: '#111',
              stars: ['#69F0AE','#00E676','#00C853'], hatDeco: '#69F0AE' },
            // 6: 金袍巫师 — 皇家大法师
            { hat: '#B8860B', brim: '#996515', robe: '#B8860B', cape: '#DAA520',
              band: '#FFF8E1', skin: '#FFCCAA', boots: '#8B6914',
              stars: ['#FFD700','#FFC107','#FFB300'], hatDeco: '#FFFFFF' }
        ];
    }

    get name() {
        return TimelineI18n.getMessage('animWizard') || 'Wizard Flight';
    }

    _wizardSvg(w, typeIdx) {
        const t = this._types[typeIdx % this._types.length];
        const h = Math.round(w * 50 / 80);
        return `<svg viewBox="0 0 80 50" width="${w}" height="${h}" fill="none"><line x1="13" y1="38" x2="63" y2="36" stroke="#8D6E43" stroke-width="2" stroke-linecap="round"/><path d="M9 32Q6 38 10 44L18 38Z" fill="#C9A96E"/><path d="M12 31Q8 37 12 45L20 38Z" fill="#B8943C"/><path d="M7 34Q4 39 8 45L17 39Z" fill="#D4B87A"/><path d="M14 32Q11 36 13 43L19 37Z" fill="#C4A058"/><path d="M38 22L32 42L50 42L46 22Z" fill="${t.robe}"/><path d="M38 22Q30 28 28 40L32 42L38 24Z" fill="${t.cape}" class="wizard-cape"/><line x1="42" y1="28" x2="48" y2="36" stroke="${t.skin}" stroke-width="2" stroke-linecap="round"/><line x1="38" y1="30" x2="35" y2="37" stroke="${t.skin}" stroke-width="2" stroke-linecap="round"/><circle cx="42" cy="17" r="6" fill="${t.skin}"/><path d="M38 20Q40 28 42 28Q44 28 46 20" fill="#E0E0E0"/><path d="M39 20Q41 26 43 20" fill="#F5F5F5"/><circle cx="40" cy="16" r="0.8" fill="#333"/><circle cx="44" cy="16" r="0.8" fill="#333"/><path d="M34 17L42 1L50 17Z" fill="${t.hat}"/><ellipse cx="42" cy="17" rx="10" ry="2.5" fill="${t.brim}"/><rect x="36" y="14" width="12" height="2" rx="0.5" fill="${t.band}"/><polygon points="42,10 43,12 45,12 43.5,13.5 44,15.5 42,14 40,15.5 40.5,13.5 39,12 41,12" fill="${t.hatDeco}" class="wizard-hat-star"/><rect x="38" y="40" width="3" height="6" rx="1" fill="${t.robe}"/><rect x="43" y="40" width="3" height="6" rx="1" fill="${t.robe}"/><ellipse cx="39.5" cy="47" rx="2.5" ry="1.2" fill="${t.boots}"/><ellipse cx="44.5" cy="47" rx="2.5" ry="1.2" fill="${t.boots}"/><polygon points="18,30 19,32 21,32 19.5,33.5 20,35.5 18,34 16,35.5 16.5,33.5 15,32 17,32" fill="${t.stars[0]}" class="wizard-star-1"/><polygon points="12,34 12.8,35.5 14.5,35.5 13.2,36.6 13.6,38.3 12,37.2 10.4,38.3 10.8,36.6 9.5,35.5 11.2,35.5" fill="${t.stars[1]}" class="wizard-star-2"/><polygon points="22,36 22.6,37.2 24,37.2 23,38 23.3,39.3 22,38.5 20.7,39.3 21,38 20,37.2 21.4,37.2" fill="${t.stars[2]}" class="wizard-star-3"/><circle cx="8" cy="36" r="1" fill="${t.stars[0]}" class="wizard-star-4" opacity="0.7"/></svg>`;
    }

    create(count) {
        if (this._el) return;
        const n = Math.min(count || 1, this.maxCount);
        let items = '';
        for (let i = 0; i < n - 1; i++) {
            items += `<span class="wizard-item wizard-float" style="animation-delay:${i * 0.3}s">${this._wizardSvg(this._followerSize, i + 1)}</span>`;
        }
        items += `<span class="wizard-item wizard-float wizard-leader">${this._wizardSvg(this._leaderSize, 0)}</span>`;
        const el = document.createElement('div');
        el.className = 'ait-wizard-parade';
        el.innerHTML = `<div class="wizard-track"><div class="wizard-group">${items}</div></div>`;
        document.body.appendChild(el);
        this._el = el;
    }

    addFollower(newCount) {
        if (!this._el) return;
        const group = this._el.querySelector('.wizard-group');
        const leader = group?.querySelector('.wizard-leader');
        if (!group || !leader) return;
        const span = document.createElement('span');
        span.className = 'wizard-item wizard-float';
        span.style.animationDelay = `${(newCount - 2) * 0.3}s`;
        span.innerHTML = this._wizardSvg(this._followerSize, newCount - 1);
        group.insertBefore(span, leader);
    }

    updatePosition(referenceRect) {
        if (!this._el || !referenceRect?.width) return;
        const s = this._el.style;
        s.left = `${referenceRect.left}px`;
        s.width = `${referenceRect.width}px`;
        s.top = `${referenceRect.top - 48}px`;
        s.setProperty('--pw', `${referenceRect.width}px`);
        if (!this._el.classList.contains('ait-pet-visible')) this._el.classList.add('ait-pet-visible');
    }

    hide() { if (this._el?.classList.contains('ait-pet-visible')) this._el.classList.remove('ait-pet-visible'); }
    destroy() { if (this._el?.parentNode) { this._el.parentNode.removeChild(this._el); this._el = null; } }
}
