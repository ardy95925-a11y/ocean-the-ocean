// shop.js

const SHOP_DATA = {
  suit: [
    { id:'air_sm',   name:'EXTRA TANK',    icon:'🫧', desc:'+25s air',             price:80,  stat:'maxAir',    value:25 },
    { id:'air_lg',   name:'PRO TANK',      icon:'💨', desc:'+50s air',             price:200, stat:'maxAir',    value:50, req:'air_sm' },
    { id:'air_xl',   name:'ABYSS TANK',    icon:'🌬️', desc:'+80s air',             price:450, stat:'maxAir',    value:80, req:'air_lg' },
    { id:'fins',     name:'SPEED FINS',    icon:'🦈', desc:'Swim 40% faster',      price:100, stat:'swimSpeed', value:1.4 },
    { id:'fins2',    name:'TURBO FINS',    icon:'⚡', desc:'Swim 90% faster',      price:280, stat:'swimSpeed', value:1.9, req:'fins' },
    { id:'rbreath',  name:'REBREATHER',    icon:'♻️', desc:'Air lasts 30% longer', price:160, stat:'airDrain',  value:0.7 },
    { id:'deep1',    name:'DEEP SUIT',     icon:'🤿', desc:'Access deep zone',     price:200, stat:'deepSuit',  value:1 },
    { id:'magnet',   name:'MAGNET',        icon:'🧲', desc:'Auto-collect nearby',  price:220, stat:'magnet',    value:90 },
  ],
  boat: [
    { id:'anchor',   name:'ANCHOR',        icon:'⚓', desc:'Boat stays put',       price:70,  stat:'anchor',    value:true },
    { id:'cargo',    name:'CARGO HOLD',    icon:'📦', desc:'Resources worth 2×',   price:150, stat:'cargoMult', value:2 },
    { id:'sonar',    name:'SONAR',         icon:'📡', desc:'See resources through water', price:260, stat:'sonar', value:true },
    { id:'autopilot',name:'AUTOPILOT',     icon:'🤖', desc:'Boat follows you',     price:340, stat:'autopilot', value:true },
    { id:'radar',    name:'DEPTH RADAR',   icon:'🎯', desc:'Shows depth zones',    price:180, stat:'radar',     value:true },
  ],
  items: [
    { id:'map',      name:'TREASURE MAP',  icon:'🗺️', desc:'Reveals chests',       price:120, stat:'tmap',      value:true },
    { id:'camera',   name:'CAMERA',        icon:'📸', desc:'+30% on rare finds',   price:140, stat:'camera',    value:true },
    { id:'knife',    name:'DIVE KNIFE',    icon:'🔪', desc:'Clear obstacles',      price:80,  stat:'knife',     value:true },
    { id:'light',    name:'DIVE LIGHT',    icon:'🔦', desc:'See farther in dark',  price:110, stat:'light',     value:true },
    { id:'buddy',    name:'DOLPHIN BUDDY', icon:'🐬', desc:'Companion collects items', price:500, stat:'buddy', value:true },
  ]
};

class ShopManager {
  constructor() {
    this.money   = parseInt(localStorage.getItem('dd_money')   || '0');
    this.owned   = JSON.parse(localStorage.getItem('dd_owned') || '[]');
    this._tab    = 'suit';
    this._initUI();
  }

  save() {
    localStorage.setItem('dd_money', String(this.money));
    localStorage.setItem('dd_owned', JSON.stringify(this.owned));
  }

  addMoney(n) {
    this.money += n;
    this.save();
    this._refreshMoney();
  }

  _refreshMoney() {
    document.querySelectorAll('#menu-money,#shop-money,#money-display').forEach(el => {
      if (el) el.textContent = this.money;
    });
  }

  getStats() {
    const s = {
      maxAir:   30,
      swimSpeed:1.0,
      airDrain: 1.0,
      deepSuit: 0,
      magnet:   0,
      anchor:   false,
      cargoMult:1,
      sonar:    false,
      autopilot:false,
      radar:    false,
      tmap:     false,
      camera:   false,
      knife:    false,
      light:    false,
      buddy:    false,
    };
    for (const id of this.owned) {
      const item = this._find(id);
      if (!item) continue;
      const { stat, value } = item;
      if (stat === 'maxAir')    s.maxAir    += value;
      else if (stat === 'swimSpeed') s.swimSpeed = Math.max(s.swimSpeed, value);
      else if (stat === 'airDrain')  s.airDrain  = Math.min(s.airDrain, value);
      else if (stat === 'deepSuit')  s.deepSuit  += value;
      else if (stat === 'magnet')    s.magnet    = Math.max(s.magnet, value);
      else if (stat === 'cargoMult') s.cargoMult = Math.max(s.cargoMult, value);
      else s[stat] = value;
    }
    return s;
  }

  _find(id) {
    for (const arr of Object.values(SHOP_DATA)) {
      const f = arr.find(i => i.id === id);
      if (f) return f;
    }
    return null;
  }

  _initUI() {
    document.querySelectorAll('.stab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.stab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        this._tab = t.dataset.tab;
        this._render();
      });
    });
    document.getElementById('btn-back-shop').addEventListener('click', () => {
      document.getElementById('shop-screen').classList.add('hidden');
      document.getElementById('menu-screen').classList.remove('hidden');
    });
    document.getElementById('btn-shop-menu').addEventListener('click', () => this.open());
  }

  open() {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('shop-screen').classList.remove('hidden');
    this._refreshMoney();
    this._render();
  }

  _render() {
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';
    for (const item of SHOP_DATA[this._tab]) {
      const owned = this.owned.includes(item.id);
      const reqOk = !item.req || this.owned.includes(item.req);
      const canBuy= !owned && reqOk && this.money >= item.price;

      const div = document.createElement('div');
      div.className = 'sitem' + (owned ? ' owned':'') + (!reqOk ? ' locked':'');
      div.innerHTML = `
        <div class="sitem-icon">${item.icon}</div>
        <div class="sitem-name">${item.name}</div>
        <div class="sitem-desc">${item.desc}${!reqOk ? '<br><small style="color:#ff9">🔒 Requires previous</small>':''}</div>
        <div class="sitem-price ${owned?'owned':''}">
          ${owned ? '✓ OWNED' : '💰 '+item.price}
        </div>
        <button class="btn-buy ${owned?'is-owned':''}" ${(owned||!canBuy)?'disabled':''} data-id="${item.id}">
          ${owned ? 'OWNED' : canBuy ? 'BUY' : !reqOk ? 'LOCKED' : 'NEED 💰'}
        </button>`;
      grid.appendChild(div);
    }
    grid.querySelectorAll('.btn-buy:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = this._find(btn.dataset.id);
        if (!item || this.owned.includes(item.id) || this.money < item.price) return;
        this.money -= item.price;
        this.owned.push(item.id);
        this.save();
        this._refreshMoney();
        this._render();
      });
    });
  }
}

window.ShopManager = ShopManager;
