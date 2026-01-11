const Engine = {
  // ============================================
  // СОСТОЯНИЕ
  // ============================================
  player: { 
    name: "", 
    race: "", 
    cls: "", 
    hp: 12, 
    maxHp: 12, 
    gold: 0, 
    inv: [] 
  },
  flags: {},
  sceneId: "start",
  adventure: null,
  adventureUrl: null,
  startTime: 0,
  elapsed: 0,
  appliedEffects: new Set(),
  timer: null,
  
  // ============================================
  // РАСЫ
  // ============================================
  races: [
    { 
      id: "human", 
      name: "Человек", 
      desc: "Сбалансированный", 
      stats: { str: 10, dex: 10, cha: 10 }
    },
    { 
      id: "elf", 
      name: "Эльф", 
      desc: "Ловкий от природы", 
      stats: { str: 8, dex: 14, cha: 8 }
    },
    { 
      id: "tiefling", 
      name: "Тифлинг", 
      desc: "Харизматичный", 
      stats: { str: 12, dex: 6, cha: 12 }
    }
  ],
  
  // ============================================
  // КЛАССЫ
  // ============================================
  classes: [
    { 
      id: "warrior", 
      name: "Воин", 
      desc: "Сила и доблесть", 
      hp: 14, 
      statBonus: { str: 4, dex: 0, cha: 0 }
    },
    { 
      id: "rogue", 
      name: "Разбойник", 
      desc: "Скрытность и хитрость", 
      hp: 10, 
      statBonus: { str: 0, dex: 4, cha: 0 }
    },
    { 
      id: "bard", 
      name: "Бард", 
      desc: "Музыка и магия", 
      hp: 10, 
      statBonus: { str: 0, dex: 2, cha: 2 }
    }
  ],
  
  tempChar: { name: "", race: null, cls: null },
  currentStep: 1,
  adventures: [],

  // ============================================
  // СТАТЫ И МОДИФИКАТОРЫ
  // ============================================
  
  parseItemBonuses(itemName) {
    const bonuses = {};
    const regex = /\(\+(\d+)\s*(str|dex|cha|wis|int|con)\)/gi;
    let match;
    while ((match = regex.exec(itemName)) !== null) {
      const value = parseInt(match[1]);
      const skill = match[2].toLowerCase();
      bonuses[skill] = (bonuses[skill] || 0) + value;
    }
    return bonuses;
  },

  getInventoryBonuses() {
    const totalBonuses = {};
    this.player.inv.forEach(item => {
      const itemBonuses = this.parseItemBonuses(item);
      for (const [skill, value] of Object.entries(itemBonuses)) {
        totalBonuses[skill] = (totalBonuses[skill] || 0) + value;
      }
    });
    return totalBonuses;
  },

  getStat(skill) {
    let stat = 10;
    
    if (this.tempChar.race?.stats?.[skill]) {
      stat = this.tempChar.race.stats[skill];
    }
    
    if (this.tempChar.cls?.statBonus?.[skill]) {
      stat += this.tempChar.cls.statBonus[skill];
    }
    
    const invBonuses = this.getInventoryBonuses();
    if (invBonuses[skill]) {
      stat += invBonuses[skill];
    }
    
    return stat;
  },

  getModifier(skill) {
    const stat = this.getStat(skill);
    return Math.floor((stat - 10) / 2);
  },

  // ============================================
  // ФЛАГИ И ПРЕДМЕТЫ
  // ============================================

  hasFlag(flag) {
    return this.flags[flag] === true;
  },

  setFlag(flag) {
    this.flags[flag] = true;
  },

  hasItem(itemName) {
    return this.player.inv.some(item => item.includes(itemName));
  },

  removeItem(itemName) {
    const index = this.player.inv.findIndex(item => item.includes(itemName));
    if (index !== -1) {
      this.player.inv.splice(index, 1);
    }
  },

  checkRequirements(choice) {
    if (!choice.requires) return true;
    const requirements = Array.isArray(choice.requires) ? choice.requires : [choice.requires];
    
    for (const req of requirements) {
      if (req.startsWith('!')) {
        if (this.hasFlag(req.slice(1))) return false;
      } else if (req.startsWith('inv:')) {
        if (!this.hasItem(req.slice(4))) return false;
      } else if (req.startsWith('gold:')) {
        if (this.player.gold < parseInt(req.slice(5))) return false;
      } else {
        if (!this.hasFlag(req)) return false;
      }
    }
    return true;
  },

  // ============================================
  // СОХРАНЕНИЯ
  // ============================================
  
  SAVE_KEY: 'dnd_express_save',
  SAVE_VERSION: 5,

  save() {
    const saveData = {
      version: this.SAVE_VERSION,
      player: { ...this.player },
      flags: { ...this.flags },
      sceneId: this.sceneId,
      adventureUrl: this.adventureUrl,
      adventureTitle: this.adventure?.title || '',
      elapsed: this.elapsed + (Date.now() - this.startTime),
      appliedEffects: Array.from(this.appliedEffects),
      tempChar: {
        name: this.tempChar.name,
        raceId: this.tempChar.race?.id || null,
        clsId: this.tempChar.cls?.id || null
      },
      savedAt: Date.now()
    };
    
    try {
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(saveData));
    } catch (e) {
      console.error('Save error:', e);
    }
  },

  getSave() {
    try {
      const data = localStorage.getItem(this.SAVE_KEY);
      if (!data) return null;
      const save = JSON.parse(data);
      if (save.version !== this.SAVE_VERSION) {
        this.deleteSave();
        return null;
      }
      return save;
    } catch (e) {
      return null;
    }
  },

  deleteSave() {
    localStorage.removeItem(this.SAVE_KEY);
  },

  async loadGame() {
    const save = this.getSave();
    if (!save) return false;
    
    this.player = save.player;
    this.flags = save.flags || {};
    this.sceneId = save.sceneId;
    this.adventureUrl = save.adventureUrl;
    this.elapsed = save.elapsed;
    this.appliedEffects = new Set(save.appliedEffects);
    
    this.tempChar.name = save.tempChar.name;
    this.tempChar.race = this.races.find(r => r.id === save.tempChar.raceId) || null;
    this.tempChar.cls = this.classes.find(c => c.id === save.tempChar.clsId) || null;
    
    try {
      const resp = await fetch(save.adventureUrl);
      if (!resp.ok) throw new Error('Network error');
      this.adventure = await resp.json();
    } catch(e) {
      alert("Ошибка загрузки!");
      this.deleteSave();
      return false;
    }
    
    this.startTime = Date.now();
    this.showScreen('game');
    this.render();
    return true;
  },

  formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  },

  formatDate(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Только что';
    if (mins < 60) return `${mins} мин. назад`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours} ч. назад`;
    return `${Math.floor(diff / 86400000)} дн. назад`;
  },

  // ============================================
  // ЭКРАНЫ
  // ============================================

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  },

  // ============================================
  // МЕНЮ
  // ============================================

  initMenu(adventures) {
    this.adventures = adventures;
    this.renderMenu();
    window.addEventListener('beforeunload', () => {
      if (this.adventure && this.sceneId) this.save();
    });
  },

  renderMenu() {
    const container = document.getElementById("menuContent");
    const save = this.getSave();
    
    let html = '';
    
    if (save) {
      html += `
        <div class="save-card">
          <h3>💾 Сохранённая игра</h3>
          <div class="save-info"><strong>${save.player.name}</strong> • ${save.player.race} ${save.player.cls}</div>
          <div class="save-info">📜 ${save.adventureTitle}</div>
          <div class="save-info">❤️ ${save.player.hp}/${save.player.maxHp} HP • 💰 ${save.player.gold}</div>
          <div class="save-time">⏱ ${this.formatTime(save.elapsed)} • ${this.formatDate(save.savedAt)}</div>
          <button class="continue-btn" id="continueBtn">▶️ Продолжить</button>
          <button class="delete-save" id="deleteSaveBtn">🗑️ Удалить</button>
        </div>
      `;
    }
    
    this.adventures.forEach((adv, i) => {
      html += `<button class="adventure-btn" data-index="${i}">${adv.title}</button>`;
    });
    
    container.innerHTML = html;
    
    document.getElementById('continueBtn')?.addEventListener('click', () => this.loadGame());
    document.getElementById('deleteSaveBtn')?.addEventListener('click', () => {
      if (confirm('Удалить сохранение?')) {
        this.deleteSave();
        this.renderMenu();
      }
    });
    
    document.querySelectorAll('.adventure-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const adv = this.adventures[btn.dataset.index];
        this.beginCharacterCreation(`adventures/${adv.id}.json`);
      });
    });
  },

  // ============================================
  // СОЗДАНИЕ ПЕРСОНАЖА
  // ============================================
  
  async beginCharacterCreation(adventureUrl) {
    const save = this.getSave();
    if (save && !confirm('Начать новую игру? Сохранение будет потеряно.')) return;
    this.deleteSave();
    
    this.adventureUrl = adventureUrl;
    this.tempChar = { name: "", race: null, cls: null };
    this.currentStep = 1;
    this.elapsed = 0;
    this.flags = {};
    
    this.showScreen('charCreate');
    this.renderCharacterStep();
  },

  renderCharacterStep() {
    const container = document.getElementById("charCreate");
    
    let html = `
      <div class="steps-indicator">
        ${[1,2,3,4].map(n => 
          `<div class="step-dot ${this.currentStep >= n ? 'active' : ''} ${this.currentStep > n ? 'done' : ''}"></div>`
        ).join('')}
      </div>
    `;
    
    if (this.currentStep === 1) {
      html += `
        <div class="step active">
          <h2>⚔️ Кто ты воин?</h2>
          <h3>Введи имя героя</h3>
          <input type="text" class="name-input" id="nameInput" 
                 placeholder="Имя..." value="${this.tempChar.name}"
                 maxlength="20" autocomplete="off">
          <button id="nameSubmitBtn">Продолжить →</button>
          <button class="delete-save" id="backBtn">← В меню</button>
        </div>
      `;
    } else if (this.currentStep === 2) {
      html += `
        <div class="step active">
          <h2>🧬 Выбери расу</h2>
          <div class="choice-grid">
            ${this.races.map(r => `
              <div class="choice-card ${this.tempChar.race?.id === r.id ? 'selected' : ''}" data-race="${r.id}">
                <img src="images/races/${r.id}.png" alt="${r.name}" 
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2250%22>?</text></svg>'">
                <div class="choice-card-info">
                     <div class="name">${r.name}</div>
                     <div class="desc">${r.desc}</div>
                     <div class="race-stats">⚔️${r.stats.str} 🏃${r.stats.dex} 💬${r.stats.cha}</div>
                </div>
              </div>
            `).join('')}
          </div>
          <button id="prevBtn">← Назад</button>
          <button id="nextBtn" ${!this.tempChar.race ? 'disabled' : ''}>Продолжить →</button>
        </div>
      `;
    } else if (this.currentStep === 3) {
      html += `
        <div class="step active">
          <h2>⚔️ Выбери класс</h2>
          <div class="choice-grid">
            ${this.classes.map(c => {
              const previewStr = (this.tempChar.race?.stats?.str || 10) + (c.statBonus?.str || 0);
              const previewDex = (this.tempChar.race?.stats?.dex || 10) + (c.statBonus?.dex || 0);
              const previewCha = (this.tempChar.race?.stats?.cha || 10) + (c.statBonus?.cha || 0);
              
              return `
                <div class="choice-card ${this.tempChar.cls?.id === c.id ? 'selected' : ''}" data-class="${c.id}">
                  <img src="images/classes/${this.tempChar.race.id}-${c.id}.png" alt="${c.name}" 
                       onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2250%22>?</text></svg>'">
                  <div class="choice-card-info">
                       <div class="name">${c.name}</div>
                       <div class="desc">${c.desc}</div>
                       <div class="class-stats">⚔️${previewStr} 🏃${previewDex} 💬${previewCha} ❤️${c.hp}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <button id="prevBtn">← Назад</button>
          <button id="nextBtn" ${!this.tempChar.cls ? 'disabled' : ''}>Продолжить →</button>
        </div>
      `;
    } else if (this.currentStep === 4) {
      const r = this.tempChar.race;
      const c = this.tempChar.cls;
      html += `
        <div class="step active">
          <div class="char-preview">
            <img src="images/classes/${r.id}-${c.id}.png" alt="${this.tempChar.name}" 
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%23fdb813%22 font-size=%2250%22>⚔️</text></svg>'">
            <h2>${this.tempChar.name}</h2>
            <div class="subtitle">${r.name} • ${c.name}</div>
            <div class="char-stats">
              <div class="stat-box"><div class="label">❤️ HP</div><div class="value">${c.hp}</div></div>
              <div class="stat-box"><div class="label">⚔️ STR</div><div class="value">${this.getStat('str')}</div></div>
              <div class="stat-box"><div class="label">🏃 DEX</div><div class="value">${this.getStat('dex')}</div></div>
              <div class="stat-box"><div class="label">💬 CHA</div><div class="value">${this.getStat('cha')}</div></div>
            </div>
          </div>
          <button id="prevBtn">← Изменить</button>
          <button id="startBtn">🎲 В бой!</button>
        </div>
      `;
    }
    
    container.innerHTML = html;
    this.bindCharacterEvents();
  },

  bindCharacterEvents() {
    const nameInput = document.getElementById("nameInput");
    if (nameInput) {
      nameInput.focus();
      nameInput.addEventListener("keydown", e => {
        if (e.key === "Enter") this.submitName();
      });
      nameInput.addEventListener("input", e => this.tempChar.name = e.target.value);
    }
    
    document.getElementById("nameSubmitBtn")?.addEventListener("click", () => this.submitName());
    document.getElementById("backBtn")?.addEventListener("click", () => {
      this.showScreen('menu');
      this.renderMenu();
    });
    document.getElementById("prevBtn")?.addEventListener("click", () => this.prevStep());
    document.getElementById("nextBtn")?.addEventListener("click", () => this.nextStep());
    document.getElementById("startBtn")?.addEventListener("click", () => this.confirmCharacter());
    
    document.querySelectorAll("[data-race]").forEach(card => {
      card.addEventListener("click", () => {
        this.tempChar.race = this.races.find(r => r.id === card.dataset.race);
        this.tempChar.cls = null;
        this.renderCharacterStep();
      });
    });
    
    document.querySelectorAll("[data-class]").forEach(card => {
      card.addEventListener("click", () => {
        this.tempChar.cls = this.classes.find(c => c.id === card.dataset.class);
        this.renderCharacterStep();
      });
    });
  },

  submitName() {
    const name = this.tempChar.name.trim();
    if (!name) {
      document.getElementById("nameInput").style.borderColor = "#f44";
      return;
    }
    this.nextStep();
  },

  nextStep() {
    if (this.currentStep === 2 && !this.tempChar.race) return;
    if (this.currentStep === 3 && !this.tempChar.cls) return;
    this.currentStep++;
    this.renderCharacterStep();
  },

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.renderCharacterStep();
    }
  },

  async confirmCharacter() {
    const c = this.tempChar.cls;
    this.player = {
      name: this.tempChar.name,
      race: this.tempChar.race.name,
      cls: this.tempChar.cls.name,
      hp: c.hp,
      maxHp: c.hp,
      gold: 0,
      inv: []
    };
    this.flags = {};
    await this.startAdventure(this.adventureUrl);
  },

  // ============================================
  // ИГРА
  // ============================================

  async startAdventure(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.adventure = await resp.json();
    } catch(e) {
      alert("Ошибка загрузки: " + e.message);
      return;
    }
    
    this.sceneId = "start";
    this.appliedEffects.clear();
    this.startTime = Date.now();
    
    this.showScreen('game');
    this.save();
    this.render();
  },

  getAvatarPath() {
    const raceId = this.tempChar.race?.id || 'human';
    const clsId = this.tempChar.cls?.id || 'warrior';
    return `images/classes/${raceId}-${clsId}.png`;
  },

  getSceneImage(scene) {
    const sceneType = scene.scene || 'default';
    return `images/scenes/${sceneType}.png`;
  },

  render() {
    const scene = this.adventure.scenes[this.sceneId];
    if (!scene) {
      this.sceneId = "start";
      this.render();
      return;
    }

    // Применяем эффекты
    if (scene.effects && !this.appliedEffects.has(this.sceneId)) {
      this.appliedEffects.add(this.sceneId);
      if (scene.effects.gold) this.player.gold += scene.effects.gold;
      if (scene.effects.hp) {
        this.player.hp = Math.min(this.player.maxHp, Math.max(0, this.player.hp + scene.effects.hp));
      }
      if (scene.effects.inv) {
        scene.effects.inv.forEach(item => {
          if (item.startsWith('-')) this.removeItem(item.slice(1));
          else this.player.inv.push(item);
        });
      }
      if (scene.effects.flags) {
        scene.effects.flags.forEach(f => this.setFlag(f));
      }
    }

    // Проверка смерти
    if (this.player.hp <= 0 && !scene.defeat && !scene.victory) {
      this.sceneId = "death";
      this.render();
      return;
    }

    const hpPercent = Math.max(0, (this.player.hp / this.player.maxHp) * 100);
    const sceneImage = this.getSceneImage(scene);
    const invCount = this.player.inv.length;
    
    const text = scene.text
      .replace(/{{name}}/g, this.player.name)
      .replace(/{{race}}/g, this.player.race)
      .replace(/{{class}}/g, this.player.cls);

    let html = `
      <!-- Изображение сцены -->
      <div class="scene-image" style="background-image: url('${sceneImage}')"></div>
      
      <!-- Карточка героя: grid 3 колонки [аватар | инфо | инвентарь] -->
      <div class="hero-card">
        <!-- Колонка 1: Аватар -->
        <img class="hero-avatar" src="${this.getAvatarPath()}" alt="Avatar" 
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%23fdb813%22 font-size=%2250%22>⚔️</text></svg>'">
        
        <!-- Колонка 2: Вся информация -->
        <div class="hero-info">
          <div class="hero-name">${this.player.name}</div>
          <div class="hero-class">${this.player.race} ${this.player.cls}</div>
          <div class="hp-bar-container">
            <div class="hp-bar">
              <div class="hp-bar-fill" style="width: ${hpPercent}%"></div>
            </div>
            <div class="hp-text">${this.player.hp}/${this.player.maxHp}</div>
          </div>
          <div class="hero-stats-row">
            <div class="hero-stats">
              <span class="stat">⚔️<span class="stat-value">${this.getStat('str')}</span></span>
              <span class="stat">🏃<span class="stat-value">${this.getStat('dex')}</span></span>
              <span class="stat">💬<span class="stat-value">${this.getStat('cha')}</span></span>
            </div>
            <div class="gold-display">💰${this.player.gold}</div>
          </div>
        </div>
        
        <!-- Колонка 3: Инвентарь -->
        <button class="inventory-btn ${invCount > 0 ? 'has-items' : ''}" id="invBtn">
          🎒
          ${invCount > 0 ? `<span class="inv-count">${invCount}</span>` : ''}
        </button>
      </div>
      
      <!-- Контент сцены -->
      <div class="scene-content">
        <div class="scroll-container">
          <div class="scroll">
            <div class="scene-text ${scene.victory ? 'victory-text' : ''} ${scene.defeat ? 'defeat-text' : ''}">
              ${text}
            </div>
          </div>
        </div>
        
        <div class="actions">
    `;

    if (scene.choices) {
      scene.choices.forEach(ch => {
        if (!this.checkRequirements(ch)) return;
        
        const dcBadge = ch.check 
          ? `<span class="dc-badge">${ch.check.skill.toUpperCase()} DC${ch.check.dc}</span>` 
          : '';
        
        html += `<button class="choice-btn" data-next="${ch.next}" 
                         data-check='${ch.check ? JSON.stringify(ch.check) : ""}' 
                         data-fail="${ch.fail || 'defeat'}">${ch.text}${dcBadge}</button>`;
      });
    }

    if (scene.victory || scene.defeat) {
      this.deleteSave();
      html += `<button class="menu-btn">🏠 В меню</button>`;
    }

    html += `</div></div>`;

    document.getElementById("game").innerHTML = html;
    this.bindGameEvents();
  },

  bindGameEvents() {
    // Инвентарь
    document.getElementById('invBtn')?.addEventListener('click', () => {
      this.showInventory();
    });
    
    // Кнопки выбора
    document.querySelectorAll(".choice-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const next = btn.dataset.next;
        const checkStr = btn.dataset.check;
        const fail = btn.dataset.fail;
        
        if (checkStr) {
          const check = JSON.parse(checkStr);
          await this.rollDice(next, check.skill, check.dc, fail);
        } else {
          this.go(next);
        }
      });
    });
    
    // Кнопка меню
    document.querySelectorAll(".menu-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.showScreen('menu');
        this.renderMenu();
      });
    });
  },

  go(next) {
    this.sceneId = next;
    this.save();
    this.render();
  },

  // ============================================
  // ПОПАП ИНВЕНТАРЯ
  // ============================================

  showInventory() {
    let overlay = document.getElementById('inventoryOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'inventoryOverlay';
      overlay.className = 'inventory-overlay';
      document.body.appendChild(overlay);
    }
    
    const items = this.player.inv;
    
    let itemsHtml = '';
    if (items.length === 0) {
      itemsHtml = '<div class="inventory-empty">Инвентарь пуст</div>';
    } else {
      itemsHtml = '<div class="inventory-grid">';
      items.forEach(item => {
        const bonuses = this.parseItemBonuses(item);
        const bonusText = Object.entries(bonuses)
          .map(([skill, val]) => `+${val} ${skill.toUpperCase()}`)
          .join(', ');
        
        // Убираем бонус из названия для отображения
        const cleanName = item.replace(/\s*\([^)]*\)/g, '');
        
        itemsHtml += `
          <div class="inv-item-card">
            <div class="item-name">${cleanName}</div>
            ${bonusText ? `<div class="item-bonus">${bonusText}</div>` : ''}
          </div>
        `;
      });
      itemsHtml += '</div>';
    }
    
    overlay.innerHTML = `
      <div class="inventory-popup">
        <div class="inventory-header">
          <div class="inventory-title">🎒 Инвентарь</div>
          <button class="inventory-close" id="invClose">✕</button>
        </div>
        ${itemsHtml}
      </div>
    `;
    
    overlay.classList.add('active');
    
    // Закрытие по кнопке
    document.getElementById('invClose').addEventListener('click', () => {
      overlay.classList.remove('active');
    });
    
    // Закрытие по клику на оверлей
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  },

  // ============================================
  // ПОПАП КУБИКА
  // ============================================

  async rollDice(next, skill, dc, fail = "defeat") {
    const overlay = document.getElementById('diceOverlay');
    const display = document.getElementById('diceDisplay');
    const skillEl = document.getElementById('diceSkill');
    const breakdown = document.getElementById('diceBreakdown');
    const target = document.getElementById('diceTarget');
    const result = document.getElementById('diceResult');
    
    const mod = this.getModifier(skill);
    const stat = this.getStat(skill);
    const skillNames = { 
      str: 'СИЛА', 
      dex: 'ЛОВКОСТЬ', 
      cha: 'ХАРИЗМА',
      wis: 'МУДРОСТЬ',
      int: 'ИНТЕЛЛЕКТ',
      con: 'ТЕЛОСЛОЖЕНИЕ'
    };
    
    // Показываем оверлей
    skillEl.textContent = `${skillNames[skill] || skill.toUpperCase()} (${stat})`;
    breakdown.textContent = '';
    target.textContent = `🎯 Сложность: ${dc}`;
    result.textContent = '';
    result.className = 'dice-result';
    display.innerHTML = '🎲';
    display.classList.add('dice-spinner');
    
    overlay.classList.add('active');
    
    // Анимация кубика
    let raw = 0;
    for (let i = 0; i < 20; i++) {
      raw = Math.floor(Math.random() * 20) + 1;
      display.textContent = `🎲 ${raw}`;
      await new Promise(r => setTimeout(r, 50 + i * 10));
    }
    
    display.classList.remove('dice-spinner');
    
    // Финальный результат
    raw = Math.floor(Math.random() * 20) + 1;
    const total = raw + mod;
    const success = total >= dc;
    const isCrit = raw === 20;
    const isFail = raw === 1;
    
    display.textContent = `🎲 ${raw}`;
    
    const modSign = mod >= 0 ? '+' : '';
    breakdown.textContent = `${raw} ${modSign}${mod} = ${total}`;
    
    await new Promise(r => setTimeout(r, 300));
    
    if (isCrit) {
      result.textContent = '🌟 КРИТИЧЕСКИЙ УСПЕХ!';
      result.className = 'dice-result crit';
    } else if (isFail) {
      result.textContent = '💀 КРИТИЧЕСКИЙ ПРОВАЛ!';
      result.className = 'dice-result failure';
    } else if (success) {
      result.textContent = '✅ УСПЕХ!';
      result.className = 'dice-result success';
    } else {
      result.textContent = '❌ ПРОВАЛ';
      result.className = 'dice-result failure';
    }
    
    // Ждём и закрываем
    await new Promise(r => setTimeout(r, 2000));
    
    overlay.classList.remove('active');
    
    await new Promise(r => setTimeout(r, 300));
    
    // Переход к следующей сцене
    this.sceneId = (success || isCrit) && !isFail ? next : fail;
    this.save();
    this.render();
  }
};