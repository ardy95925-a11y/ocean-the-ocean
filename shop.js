// ── SHOP.JS ── Upgrade shop data and management

const SHOP_DATA = {
  suit: [
    { id: 'air_tank_sm', name: 'Extra Tank', icon: '🫧', desc: '+30s air capacity', price: 80, stat: 'maxAir', value: 30 },
    { id: 'air_tank_lg', name: 'Pro Tank', icon: '💨', desc: '+60s air capacity', price: 220, stat: 'maxAir', value: 60, requires: 'air_tank_sm' },
    { id: 'fins', name: 'Speed Fins', icon: '🦈', desc: '+40% swim speed', price: 120, stat: 'swimSpeed', value: 1.4 },
    { id: 'fins_pro', name: 'Turbo Fins', icon: '⚡', desc: '+80% swim speed', price: 300, stat: 'swimSpeed', value: 1.8, requires: 'fins' },
    { id: 'suit_depth', name: 'Deep Suit', icon: '🤿', desc: 'Reach deeper depths', price: 150, stat: 'maxDepth', value: 1 },
    { id: 'suit_depth_pro', name: 'Abyss Suit', icon: '🌑', desc: 'Explore the abyss', price: 400, stat: 'maxDepth', value: 2, requires: 'suit_depth' },
    { id: 'magnet', name: 'Resource Magnet', icon: '🧲', desc: 'Auto-collect nearby items', price: 200, stat: 'magnetRange', value: 80 },
    { id: 'rebreather', name: 'Rebreather', icon: '♻️', desc: 'Slow air drain rate -25%', price: 180, stat: 'airDrain', value: 0.75 },
  ],
  boat: [
    { id: 'anchor', name: 'Anchor', icon: '⚓', desc: 'Boat stays in place', price: 60, stat: 'anchor', value: true },
    { id: 'engine', name: 'Better Engine', icon: '🔧', desc: 'Smoother boat handling', price: 100, stat: 'boatSmooth', value: true },
    { id: 'storage', name: 'Cargo Hold', icon: '📦', desc: 'Carry 2x more resources', price: 160, stat: 'cargoMulti', value: 2 },
    { id: 'sonar', name: 'Sonar', icon: '📡', desc: 'See resources through water', price: 250, stat: 'sonar', value: true },
    { id: 'autopilot', name: 'Autopilot', icon: '🤖', desc: 'Boat follows you', price: 350, stat: 'autopilot', value: true },
  ],
  items: [
    { id: 'flare', name: 'Flare Gun', icon: '🔴', desc: 'Signal & stun creatures', price: 90, stat: 'flare', value: true },
    { id: 'camera', name: 'Underwater Camera', icon: '📸', desc: 'Bonus money for rare finds', price: 130, stat: 'camera', value: true },
    { id: 'knife', name: 'Dive Knife', icon: '🔪', desc: 'Cut through seaweed faster', price: 70, stat: 'knife', value: true },
    { id: 'map', name: 'Treasure Map', icon: '🗺️', desc: 'Reveals treasure chests', price: 200, stat: 'treasureMap', value: true },
    { id: 'buddy', name: 'Diving Buddy', icon: '🐬', desc: 'Dolphin companion helps collect', price: 450, stat: 'buddy', value: true },
  ]
};

class ShopManager {
  constructor() {
    this.money = parseInt(localStorage.getItem('deepdive_money') || '0');
    this.owned = JSON.parse(localStorage.getItem('deepdive_owned') || '[]');
    this.upgrades = JSON.parse(localStorage.getItem('deepdive_upgrades') || '{}');
    this.currentTab = 'suit';
    this._initUI();
  }

  save() {
    localStorage.setItem('deepdive_money', this.money);
    localStorage.setItem('deepdive_owned', JSON.stringify(this.owned));
    localStorage.setItem('deepdive_upgrades', JSON.stringify(this.upgrades));
  }

  addMoney(amount) {
    this.money += amount;
    this.save();
    this.updateMoneyDisplays();
  }

  updateMoneyDisplays() {
    const els = document.querySelectorAll('#menu-money, #shop-money, #go-total');
    els.forEach(el => { if (el) el.textContent = this.money; });
    document.querySelectorAll('#money-display').forEach(el => el.textContent = this.money);
  }

  getStats() {
    const base = {
      maxAir: 30,        // seconds
      swimSpeed: 1.0,
      maxDepth: 0,       // tier
      magnetRange: 0,
      airDrain: 1.0,
      anchor: false,
      boatSmooth: false,
      cargoMulti: 1,
      sonar: false,
      autopilot: false,
      flare: false,
      camera: false,
      knife: false,
      treasureMap: false,
      buddy: false,
    };
    for (const id of this.owned) {
      const item = this._findItem(id);
      if (!item) continue;
      const s = item.stat;
      if (typeof item.value === 'boolean') {
        base[s] = item.value;
      } else if (s === 'maxAir') {
        base[s] += item.value;
      } else if (s === 'swimSpeed' || s === 'airDrain') {
        base[s] = item.value; // take highest (items designed this way)
      } else if (s === 'maxDepth') {
        base[s] += item.value;
      } else if (s === 'magnetRange') {
        base[s] = Math.max(base[s], item.value);
      } else if (s === 'cargoMulti') {
        base[s] = item.value;
      }
    }
    return base;
  }

  _findItem(id) {
    for (const cat of Object.values(SHOP_DATA)) {
      const f = cat.find(i => i.id === id);
      if (f) return f;
    }
    return null;
  }

  _initUI() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.renderShop();
      });
    });

    document.getElementById('btn-back-shop').addEventListener('click', () => {
      document.getElementById('shop-screen').classList.add('hidden');
      document.getElementById('menu-screen').classList.remove('hidden');
    });

    document.getElementById('btn-shop-menu').addEventListener('click', () => {
      this.openShop();
    });
  }

  openShop() {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('shop-screen').classList.remove('hidden');
    this.renderShop();
    this.updateMoneyDisplays();
  }

  renderShop() {
    const container = document.getElementById('shop-items-container');
    const items = SHOP_DATA[this.currentTab];
    container.innerHTML = '';

    for (const item of items) {
      const isOwned = this.owned.includes(item.id);
      const reqMet = !item.requires || this.owned.includes(item.requires);
      const canAfford = this.money >= item.price;

      const div = document.createElement('div');
      div.className = 'shop-item' + (isOwned ? ' owned' : '') + (!reqMet ? ' locked' : '');

      div.innerHTML = `
        <div class="shop-item-icon">${item.icon}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}${!reqMet ? '<br><i style="color:#ff9">🔒 Requires previous</i>' : ''}</div>
        <div class="shop-item-price ${isOwned ? 'owned-label' : ''}">
          ${isOwned ? '✓ OWNED' : '💰 ' + item.price}
        </div>
        ${isOwned
          ? `<button class="btn-buy owned-btn" disabled>OWNED</button>`
          : `<button class="btn-buy" ${(!canAfford || !reqMet) ? 'disabled' : ''} data-id="${item.id}">
              ${canAfford && reqMet ? 'BUY' : !canAfford ? 'NEED 💰' : 'LOCKED'}
            </button>`
        }
      `;
      container.appendChild(div);
    }

    // Buy handlers
    container.querySelectorAll('.btn-buy[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = this._findItem(id);
        if (!item || this.owned.includes(id)) return;
        if (this.money < item.price) return;
        this.money -= item.price;
        this.owned.push(id);
        this.save();
        this.updateMoneyDisplays();
        this.renderShop();
      });
    });
  }
}

window.ShopManager = ShopManager;
