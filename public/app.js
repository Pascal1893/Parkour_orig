const $ = (q) => document.querySelector(q);

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `http_${res.status}`;
    const err = new Error(msg);
    err.data = data;
    throw err;
  }
  return data;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function fmt(n) {
  return String(n | 0);
}

// --- UI State ---
let me = null;
let characters = [];
let activeCharacter = null;
let shop = null; // {boxes, items}
let itemCatalog = new Map(); // id -> item
let inventory = []; // [{item, qty}]
let currentEquipCharacterId = null;
let shopTab = "boxes";
let characterRarityMap = new Map(); // character_id -> rarity
let collectionFilter = "all"; // all | skins | characters
let previewCharacterId = null;
let previewSkinItemId = null;

function setUserPill() {
  const pill = $("#pill-user");
  const btnAuth = $("#btn-auth");
  const btnLogout = $("#btn-logout");
  if (!me) {
    pill.textContent = "Nicht eingeloggt";
    btnAuth.style.display = "";
    btnLogout.style.display = "none";
    return;
  }
  pill.textContent = `${me.username} · Coins ${me.coins} · Gems ${me.gems || 0}`;
  btnAuth.style.display = "none";
  btnLogout.style.display = "";
}

function openModal(id) {
  const m = $(id);
  m.setAttribute("aria-hidden", "false");
}
function closeModal(id) {
  const m = $(id);
  m.setAttribute("aria-hidden", "true");
}

function toast(el, text, ok = false) {
  el.style.color = ok ? "rgba(62,242,177,.95)" : "var(--danger)";
  el.textContent = text;
  setTimeout(() => {
    if (el.textContent === text) el.textContent = "";
  }, 2600);
}

async function refreshMe() {
  const data = await api("/api/me");
  me = data.user;
  setUserPill();
  $("#stat-best").textContent = me ? fmt(me.best_score) : "0";
  $("#wallet-coins").textContent = me ? fmt(me.coins) : "0";
  $("#shop-coins").textContent = me ? fmt(me.coins) : "0";
  $("#inv-coins").textContent = me ? fmt(me.coins) : "0";
  const gemsEl = $("#stat-gems");
  if (gemsEl) gemsEl.textContent = me ? fmt(me.gems || 0) : "0";
  if (me && characters.length) {
    activeCharacter = characters.find((c) => c.id === me.selected_character) || characters[0];
    const acEl = $("#active-character");
    if (acEl) acEl.textContent = activeCharacter.name;
  }
  if (me?.is_admin) {
    const lbl = $("#admin-username-label");
    if (lbl) lbl.textContent = me.username;
    showAdminPanel(true);
    if (!adminPanelInited) { adminPanelInited = true; initAdminPanel(); }
    loadAdminUsers();
  } else {
    showAdminPanel(false);
  }
}

async function refreshInventory() {
  if (!me) {
    inventory = [];
    return;
  }
  const data = await api("/api/inventory");
  inventory = data.inventory || [];
}

async function refreshLeaderboard() {
  const data = await api("/api/leaderboard");
  const root = $("#leaderboard");
  root.innerHTML = "";
  data.leaderboard.forEach((row, idx) => {
    const el = document.createElement("div");
    el.className = "row";
    el.innerHTML = `
      <div class="left">
        <div class="badge">${idx + 1}</div>
        <div class="name">${escapeHtml(row.username)}</div>
      </div>
      <div class="right">
        <span class="mono">${fmt(row.best_score)}</span>
      </div>
    `;
    root.appendChild(el);
  });
  if (!data.leaderboard.length) {
    const el = document.createElement("div");
    el.className = "row";
    el.innerHTML = `<div class="left"><div class="name muted">Noch keine Einträge.</div></div>`;
    root.appendChild(el);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function characterUnlocked(cid) {
  if (!me) return cid === 0;
  return me.unlocked.includes(cid);
}

function characterRarity(cid) {
  return characterRarityMap.get(Number(cid)) || "Bronze";
}

function renderCharacters() {
  const grid = $("#characters-grid");
  grid.innerHTML = "";
  characters.forEach((c) => {
    const unlocked = characterUnlocked(c.id);
    const selected = me && me.selected_character === c.id;
    const card = document.createElement("div");
    const r = characterRarity(c.id);
    card.className = `char ${unlocked ? "" : rarityBgClass(r)}`;
    card.innerHTML = `
      <div class="head">
        <div>
          <div class="title">${escapeHtml(c.name)}</div>
          <div class="ability"><span class="rar ${rarityClass(r)}">${escapeHtml(r)}</span> · ${escapeHtml(c.ability)}</div>
        </div>
        <div class="chip ${unlocked ? "ok" : "lock"}">${unlocked ? (selected ? "Aktiv" : "Unlocked") : `Locked · Boxen`}</div>
      </div>
      <p>${escapeHtml(c.desc)}</p>
      <div class="actions">
        <button class="btn ${unlocked ? "ghost" : ""}" data-cid="${c.id}" data-action="select" ${unlocked ? "" : "disabled"}>
          ${unlocked ? (selected ? "Ausgewählt" : "Auswählen") : `Gesperrt`}
        </button>
        <button class="btn ghost" data-cid="${c.id}" data-action="equip" ${unlocked ? "" : "disabled"}>Ausrüstung</button>
        <button class="btn ghost" data-cid="${c.id}" data-action="preview">Anschauen</button>
      </div>
    `;
    const btns = Array.from(card.querySelectorAll("button"));
    btns[0].disabled = unlocked && selected;
    btns.forEach((btn) =>
      btn.addEventListener("click", async () => {
        const cid = Number(btn.dataset.cid);
        const action = btn.dataset.action;
        if (action === "preview") {
          openCharacterPreview(cid);
          return;
        }
        if (action === "equip") {
          if (!me) {
            openModal("#modal-auth");
            return;
          }
          currentEquipCharacterId = cid;
          $("#inv-title").textContent = `Inventar · ${characters.find((x) => x.id === cid)?.name || "Charakter"}`;
          await refreshInventory();
          renderInventory({ mode: "gear" });
          openModal("#modal-inventory");
          return;
        }
      if (!me) {
        openModal("#modal-auth");
        return;
      }
        try {
          // optimistic UI update (prevents "Runner" showing due to any delay)
          me.selected_character = cid;
          activeCharacter = characters.find((c) => c.id === cid) || characters[0];
          $("#active-character").textContent = activeCharacter.name;
          await api("/api/select_character", { method: "POST", body: JSON.stringify({ character_id: cid }) });
          await refreshMe();
          renderCharacters();
          restart();
          if (me) $("#wallet-coins").textContent = fmt(me.coins);
        } catch (e) {
          alert(`Fehler: ${e.message}`);
        }
      })
    );
    grid.appendChild(card);
  });
}

function rarityClass(r) {
  const k = String(r || "").toLowerCase();
  if (k.startsWith("bron")) return "bronze";
  if (k.startsWith("sil")) return "silber";
  if (k.startsWith("gol")) return "gold";
  if (k.startsWith("pla")) return "platin";
  return "mythic";
}

function rarityBgClass(r) {
  return `rarbg ${rarityClass(r)}`;
}

function displayCostLabel(cost, currency) {
  if (String(currency || "coins").toLowerCase() === "gems") {
    return `${fmt(cost)} Gems`;
  }
  return `${fmt(cost)} Coins`;
}

function boxSVG(b) {
  const nm = (b?.name || "").toLowerCase();
  let cf, cs, ct, cg, cl;
  if (nm.includes("gold")) {
    cf = "#c49000"; cs = "#8a6200"; ct = "#e8b420"; cg = "#ffe878"; cl = "#a87800";
  } else if (nm.includes("silber")) {
    cf = "#788898"; cs = "#4e5e6a"; ct = "#a0b4c4"; cg = "#dceaf6"; cl = "#5e7080";
  } else {
    cf = "#a46438"; cs = "#6e3e14"; ct = "#c87e4a"; cg = "#eaaa72"; cl = "#824a1e";
  }
  /* 3D box: front face (6,22)-(55,72), right side (55,22)-(73,10)-(73,60)-(55,72), lid (6,22)-(55,22)-(73,10)-(24,10) */
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
    <defs>
      <linearGradient id="bf${b.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${ct}"/><stop offset="100%" stop-color="${cf}"/></linearGradient>
    </defs>
    <!-- shadow -->
    <ellipse cx="38" cy="77" rx="24" ry="5" fill="rgba(0,0,0,0.32)"/>
    <!-- right side face -->
    <polygon points="55,22 73,10 73,60 55,72" fill="${cs}"/>
    <!-- right edge highlight -->
    <line x1="73" y1="10" x2="73" y2="60" stroke="${cg}" stroke-width="1.2" opacity="0.22"/>
    <!-- front face (gradient) -->
    <rect x="6" y="22" width="49" height="50" rx="2" fill="url(#bf${b.id})"/>
    <!-- front top edge highlight -->
    <rect x="6" y="22" width="49" height="5" rx="2" fill="${cg}" opacity="0.14"/>
    <!-- strap horizontal -->
    <rect x="6" y="38" width="49" height="9" fill="${cl}" opacity="0.75"/>
    <!-- strap on side -->
    <polygon points="55,38 73,26 73,35 55,47" fill="${cl}" opacity="0.65"/>
    <!-- clasp background (centered on front face: x=6+49/2-10=20.5≈21) -->
    <rect x="21" y="32" width="20" height="17" rx="4" fill="${cl}"/>
    <!-- clasp recess -->
    <rect x="24" y="35" width="14" height="11" rx="3" fill="${cf}" opacity="0.45"/>
    <!-- clasp knob -->
    <circle cx="31" cy="40.5" r="3.5" fill="${cg}"/>
    <circle cx="31" cy="40.5" r="1.8" fill="${cl}" opacity="0.55"/>
    <!-- lid (top face) -->
    <polygon points="6,22 55,22 73,10 24,10" fill="${ct}"/>
    <!-- lid highlight band -->
    <polygon points="13,17 51,17 65,11 28,11" fill="${cg}" opacity="0.28"/>
    <!-- lid right edge cap -->
    <polygon points="55,22 73,10 73,14 55,26" fill="${cg}" opacity="0.18"/>
    <!-- lid/front dividing line -->
    <line x1="6" y1="22" x2="55" y2="22" stroke="${cg}" stroke-width="1" opacity="0.35"/>
  </svg>`;
}

function renderShop() {
  const root = $("#shop-boxes");
  root.innerHTML = "";
  if (!shop) return;
  shop.boxes.forEach((b) => {
    const el = document.createElement("div");
    el.className = "char";
    el.innerHTML = `
      <div class="box-visual">${boxSVG(b)}</div>
      <div class="head">
        <div>
          <div class="title">${escapeHtml(b.name)}</div>
          <div class="ability">Kosten: <span class="mono">${displayCostLabel(b.cost, b.currency)}</span></div>
        </div>
      </div>
      <p>Chance basierend auf Seltenheit. Drops: Gear & Kosmetik.</p>
      <div class="actions">
        <button class="btn" data-box="${escapeHtml(b.id)}" data-action="buy">Kaufen</button>
        <button class="btn ghost" data-box="${escapeHtml(b.id)}" data-action="chances">Chancen</button>
      </div>
    `;
    el.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!me) return openModal("#modal-auth");
        const action = btn.dataset.action;
        if (action === "chances") {
          showBoxChances(b);
          return;
        }
        try {
          const drop = await api("/api/buy_box", { method: "POST", body: JSON.stringify({ box_id: b.id }) });
          await refreshMe();
          await refreshInventory();
          renderInventory({ mode: "all" });
          renderProfileCosmetics();
          await animateBoxOpen(drop, b);
        } catch (e) {
          const need = e?.data?.need ? ` (benötigt: ${e.data.need})` : "";
          alert(`Fehler: ${e.message}${need}`);
        }
      })
    );
    root.appendChild(el);
  });
}

function showBoxChances(box) {
  const boxesGrid = $("#shop-boxes");
  const d = $("#shop-drop");
  boxesGrid.style.display = "none";
  d.style.display = "";
  const weights = box.weights || {};
  const total = Object.values(weights).reduce((a, v) => a + Number(v || 0), 0) || 1;
  const rows = (shop?.rarities || []).map((r) => {
    const w = Number(weights[r] || 0);
    const pct = (w / total) * 100;
    return { r, pct };
  });
  const charPct = Number(shop?.character_drop_chance_percent || 20);
  d.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <button class="btn ghost" id="chances-back" style="padding:4px 12px;font-size:12px">← Zurück</button>
      <div class="muted">Chancen · ${escapeHtml(box.name)}</div>
    </div>
    <div class="row">
      <div class="left"><div class="name">Seltenheit</div></div>
      <div class="right"><span class="muted">Wahrscheinlichkeit</span></div>
    </div>
    ${rows
      .map(
        (x) => `
      <div class="row">
        <div class="left">
          <div class="badge">%</div>
          <div class="name"><span class="rar ${rarityClass(x.r)}">${escapeHtml(x.r)}</span></div>
        </div>
        <div class="right"><span class="mono">${x.pct.toFixed(1)}%</span></div>
      </div>`
      )
      .join("")}
    <div class="muted" style="margin-top:10px">
      Zusätzlich: <span class="mono">${fmt(charPct)}%</span> Chance auf Charakter-Drop, falls noch gesperrte Charaktere verfügbar sind.
    </div>
  `;
  d.querySelector("#chances-back").addEventListener("click", () => {
    d.style.display = "none";
    boxesGrid.style.display = "";
  });
}

function setShopTab(tab) {
  shopTab = tab;
  if (tab === "boxes") {
    const d = $("#shop-drop");
    if (d) d.style.display = "none";
    const g = $("#shop-boxes");
    if (g) g.style.display = "";
  }
  const views = {
    boxes: $("#shop-view-boxes"),
    collection: $("#shop-view-collection"),
    inventory: $("#shop-view-inventory"),
    gifts: $("#shop-view-gifts"),
  };
  Object.entries(views).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle("hidden", k !== tab);
  });
  const tabs = Array.from(document.querySelectorAll("#shop-tabs .tab"));
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.shopTab === tab));
}

function invQtyMap() {
  const m = new Map();
  (inventory || []).forEach((e) => m.set(Number(e.item.id), Number(e.qty)));
  return m;
}

function renderShopInventory() {
  const root = $("#shop-inventory-grid");
  if (!root) return;
  root.innerHTML = "";
  if (!me) {
    root.innerHTML = `<div class="row"><div class="left"><div class="name muted">Bitte einloggen.</div></div></div>`;
    return;
  }
  const list = (inventory || []).slice();
  if (!list.length) {
    root.innerHTML = `<div class="row"><div class="left"><div class="name muted">Noch keine Items.</div></div></div>`;
    return;
  }
  list.forEach((entry) => {
    const it = entry.item;
    const el = document.createElement("div");
    el.className = `char ${rarityBgClass(it.rarity)}`;
    el.innerHTML = `
      <div class="head">
        <div>
          <div class="title">${escapeHtml(it.name)} <span class="muted">×${fmt(entry.qty)}</span></div>
          <div class="ability"><span class="rar ${rarityClass(it.rarity)}">${escapeHtml(it.rarity)}</span> · ${escapeHtml(it.type)} · <span class="mono">${escapeHtml(it.slot || "-")}</span></div>
        </div>
        <div class="chip ${rarityClass(it.rarity)}">${escapeHtml(it.rarity)}</div>
      </div>
      <p>${escapeHtml(it.desc || "")}</p>
    `;
    root.appendChild(el);
  });
}

function renderCollection() {
  const root = $("#collection-grid");
  if (!root) return;
  root.innerHTML = "";
  if (!shop) return;
  const qty = invQtyMap();

  const all = [];
  (shop.items || []).forEach((it) => all.push({ kind: "item", ...it }));
  // show characters as well
  characters
    .filter((c) => c.id !== 0)
    .forEach((c) =>
      all.push({
        kind: "character",
        id: c.id,
        name: c.name,
        type: "character",
        slot: "character",
        rarity: characterRarity(c.id),
        desc: c.ability || "",
      })
    );

  const filtered = all.filter((it) => {
    if (collectionFilter === "skins") return it.kind === "item" && it.type === "gear" && it.slot === "skin";
    if (collectionFilter === "characters") return it.kind === "character";
    return true;
  });

  filtered.sort((a, b) => {
    const ra = RARITY_INDEX(a.rarity);
    const rb = RARITY_INDEX(b.rarity);
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });

  filtered.forEach((it) => {
    const owned = it.kind === "item" ? (qty.get(Number(it.id)) || 0) : (me && me.unlocked.includes(Number(it.id)) ? 1 : 0);
    const el = document.createElement("div");
    el.className = `char ${rarityBgClass(it.rarity)}`;
    const typeLabel = it.kind === "character" ? "Charakter" : it.type;
    el.innerHTML = `
      <div class="head">
        <div>
          <div class="title">${escapeHtml(it.name)}</div>
          <div class="ability"><span class="rar ${rarityClass(it.rarity)}">${escapeHtml(it.rarity)}</span> · ${escapeHtml(typeLabel)} · <span class="mono">${escapeHtml(it.slot || "-")}</span></div>
        </div>
        <div class="chip ${owned ? "ok" : "lock"}">${owned ? (it.kind === "item" ? `×${fmt(owned)}` : "Unlocked") : "0"}</div>
      </div>
      <p>${escapeHtml(it.desc || "")}</p>
    `;
    root.appendChild(el);
  });
}

function RARITY_INDEX(r) {
  const i = (shop?.rarities || []).indexOf(String(r || ""));
  return i === -1 ? 999 : i;
}

function displayDropOverlay(drop, kind, normalizedDrop) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    cursor: pointer;
  `;
  
  const rarityColor = (r) => {
    const rr = String(r || "").toLowerCase();
    if (rr.startsWith("bron")) return "rgba(214,165,107,.95)";
    if (rr.startsWith("sil")) return "rgba(207,216,227,.95)";
    if (rr.startsWith("gol")) return "rgba(255,209,102,.95)";
    if (rr.startsWith("pla")) return "rgba(139,233,253,.95)";
    return "rgba(255,77,255,.95)";
  };
  
  const rarityBg = (r) => {
    const rr = String(r || "").toLowerCase();
    if (rr.startsWith("bron")) return "rgba(214,165,107,.15)";
    if (rr.startsWith("sil")) return "rgba(207,216,227,.15)";
    if (rr.startsWith("gol")) return "rgba(255,209,102,.15)";
    if (rr.startsWith("pla")) return "rgba(139,233,253,.15)";
    return "rgba(255,77,255,.15)";
  };
  
  let contentHtml = "";
  if (kind === "character") {
    contentHtml = `
      <div style="text-align: center; color: #fff; max-width: 700px;">
        <div style="font-size: 20px; color: rgba(255,255,255,.6); margin-bottom: 30px;">🎉 Du hast einen Charakter erhalten!</div>
        <canvas id="overlay-canvas" width="400" height="300" style="display: block; margin: 0 auto 30px; background: rgba(0,0,0,.2); border-radius: 16px; border: 1px solid rgba(255,255,255,.1);"></canvas>
        <div style="background: ${rarityBg(normalizedDrop.rarity)}; padding: 40px; border-radius: 20px; border: 2px solid ${rarityColor(normalizedDrop.rarity)};">
          <div style="font-size: 48px; font-weight: 900; margin-bottom: 15px; color: ${rarityColor(normalizedDrop.rarity)};">${escapeHtml(normalizedDrop.name)}</div>
          <div style="font-size: 18px; color: rgba(255,255,255,.8); margin-bottom: 15px;">Charakter</div>
          <div style="font-size: 16px; color: rgba(255,255,255,.7);">${escapeHtml(normalizedDrop.desc)}</div>
        </div>
        <div style="margin-top: 30px; font-size: 12px; color: rgba(255,255,255,.5);">Klick zum Schließen</div>
      </div>
    `;
  } else {
    contentHtml = `
      <div style="text-align: center; color: #fff; max-width: 700px;">
        <div style="font-size: 20px; color: rgba(255,255,255,.6); margin-bottom: 30px;">🎁 Du hast ein Item erhalten!</div>
        <div style="background: ${rarityBg(normalizedDrop.rarity)}; padding: 60px 40px; border-radius: 20px; border: 2px solid ${rarityColor(normalizedDrop.rarity)};">
          <div style="font-size: 56px; font-weight: 900; margin-bottom: 15px; color: ${rarityColor(normalizedDrop.rarity)};">${escapeHtml(normalizedDrop.name)}</div>
          <div style="font-size: 18px; color: rgba(255,255,255,.8); margin-bottom: 15px;">${escapeHtml(normalizedDrop.type)}</div>
          <div style="font-size: 16px; color: rgba(255,255,255,.7);">${escapeHtml(normalizedDrop.desc)}</div>
        </div>
        <div style="margin-top: 30px; font-size: 12px; color: rgba(255,255,255,.5);">Klick zum Schließen</div>
      </div>
    `;
  }
  
  overlay.innerHTML = contentHtml;
  overlay.addEventListener("click", () => overlay.remove());
  
  // nach dem Rendern: Canvas für Charakter zeichnen
  if (kind === "character") {
    setTimeout(() => {
      const canvas = overlay.querySelector("#overlay-canvas");
      if (canvas) {
        try {
          const ctx = canvas.getContext("2d");
          const cid = Number(normalizedDrop.id);
          const ch = characters.find((x) => x.id === cid);
          const style = playerStyle(cid, null);
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const p = { x: canvas.width / 2 - 25, y: canvas.height / 2 - 50, w: 50, h: 80 };
          
          // shadow
          ctx.fillStyle = "rgba(0,0,0,.3)";
          ctx.beginPath();
          ctx.ellipse(p.x + p.w / 2, p.y + p.h + 20, 35, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          
          // body
          const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
          grad.addColorStop(0, style.c1);
          grad.addColorStop(1, style.c2);
          ctx.fillStyle = grad;
          roundRect(ctx, p.x, p.y + 20, p.w, p.h - 20, style.bodyR);
          ctx.fill();
          
          // head
          ctx.fillStyle = style.head;
          ctx.beginPath();
          ctx.arc(p.x + p.w / 2, p.y + 15, style.headR + 2, 0, Math.PI * 2);
          ctx.fill();
          
          // pack
          ctx.fillStyle = style.pack;
          roundRect(ctx, p.x + 8, p.y + 35, p.w - 16, 22, 10);
          ctx.fill();
          ctx.strokeStyle = style.outline;
          ctx.lineWidth = 2;
          ctx.stroke();
        } catch (_) {}
      }
    }, 0);
  }
  
  document.body.appendChild(overlay);
}

function animateBoxOpenPhase(container, box) {
  return new Promise((resolve) => {
    const nm = (box?.name || "").toLowerCase();
    let cf, cs, ct, cg, cl, glowC;
    if (nm.includes("gold")) {
      cf = "#b87d00"; cs = "#7a5200"; ct = "#d4a200"; cg = "#ffd050"; cl = "#9a6400"; glowC = "255,200,0";
    } else if (nm.includes("silber")) {
      cf = "#6e7e8e"; cs = "#46545e"; ct = "#96a8b8"; cg = "#c8dcea"; cl = "#566070"; glowC = "180,210,240";
    } else {
      cf = "#966030"; cs = "#623c16"; ct = "#b87240"; cg = "#de9860"; cl = "#784018"; glowC = "200,130,60";
    }

    const cvs = document.createElement("canvas");
    cvs.width = 280; cvs.height = 200;
    cvs.style.cssText = "display:block;margin:0 auto;border-radius:12px";
    container.appendChild(cvs);
    const ctx = cvs.getContext("2d");

    const SHAKE_DUR = 680;
    const OPEN_DUR = 720;
    const HOLD_DUR = 340;
    const TOTAL = SHAKE_DUR + OPEN_DUR + HOLD_DUR;

    const CX = 130, BY = 162;
    const BW = 88, BH = 66, SW = 26, SH = 18;

    const particles = [];
    let particlesSpawned = false;

    function spawnParticles() {
      for (let i = 0; i < 22; i++) {
        const angle = (i / 22) * Math.PI * 2;
        const speed = 1.8 + Math.random() * 2.8;
        particles.push({
          x: CX, y: BY - BH - 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          life: 1,
          decay: 0.018 + Math.random() * 0.016,
          r: 2 + Math.random() * 3,
          col: Math.random() < 0.5 ? cg : ct,
        });
      }
    }

    function drawBox(ox, oy, lidT) {
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.26 - lidT * 0.08;
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.beginPath();
      ctx.ellipse(CX + ox, BY + 9, BW / 2 + 8 + lidT * 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // right side face
      ctx.fillStyle = cs;
      ctx.beginPath();
      ctx.moveTo(CX + ox + BW / 2, oy);
      ctx.lineTo(CX + ox + BW / 2 + SW, oy - SH);
      ctx.lineTo(CX + ox + BW / 2 + SW, oy + BH - SH);
      ctx.lineTo(CX + ox + BW / 2, oy + BH);
      ctx.closePath();
      ctx.fill();

      // front face
      ctx.fillStyle = cf;
      roundRect(ctx, CX + ox - BW / 2, oy, BW, BH, 3);
      ctx.fill();

      // front top highlight
      ctx.fillStyle = cg;
      ctx.globalAlpha = 0.11;
      roundRect(ctx, CX + ox - BW / 2, oy, BW, 7, 3);
      ctx.fill();
      ctx.globalAlpha = 1;

      // strap / band
      ctx.fillStyle = cl;
      ctx.globalAlpha = 0.68;
      ctx.fillRect(CX + ox - BW / 2, oy + BH * 0.44, BW, BH * 0.16);
      ctx.globalAlpha = 1;

      // side strap
      ctx.fillStyle = cl;
      ctx.globalAlpha = 0.58;
      ctx.beginPath();
      ctx.moveTo(CX + ox + BW / 2, oy + BH * 0.44);
      ctx.lineTo(CX + ox + BW / 2 + SW, oy + BH * 0.44 - SH);
      ctx.lineTo(CX + ox + BW / 2 + SW, oy + BH * 0.44 + BH * 0.16 - SH * 0.16);
      ctx.lineTo(CX + ox + BW / 2, oy + BH * 0.44 + BH * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // clasp
      ctx.fillStyle = cl;
      roundRect(ctx, CX + ox - 11, oy + BH * 0.34, 22, 18, 4);
      ctx.fill();
      ctx.fillStyle = cf;
      ctx.globalAlpha = 0.45;
      roundRect(ctx, CX + ox - 7, oy + BH * 0.40, 14, 11, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(CX + ox, oy + BH * 0.48, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // glow when opening
      if (lidT > 0.05) {
        const gR = 12 + lidT * 62;
        const gY = oy - lidT * 30;
        const grd = ctx.createRadialGradient(CX + ox, gY, 0, CX + ox, gY, gR);
        grd.addColorStop(0, `rgba(${glowC},${(0.55 * lidT).toFixed(2)})`);
        grd.addColorStop(0.5, `rgba(${glowC},${(0.20 * lidT).toFixed(2)})`);
        grd.addColorStop(1, `rgba(${glowC},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(CX + ox, gY, gR, gR * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // lid (animated: lifts up + slight tilt)
      const lidLift = lidT * 60;
      const lidAngle = -lidT * 0.38;

      ctx.save();
      ctx.translate(CX + ox - BW / 2, oy - lidLift);
      ctx.rotate(lidAngle);

      ctx.fillStyle = ct;
      ctx.globalAlpha = 1 - lidT * 0.18;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(BW, 0);
      ctx.lineTo(BW + SW, -SH);
      ctx.lineTo(SW, -SH);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cg;
      ctx.globalAlpha = 0.30;
      ctx.beginPath();
      ctx.moveTo(8, -2);
      ctx.lineTo(BW - 8, -2);
      ctx.lineTo(BW + SW - 10, -SH + 3);
      ctx.lineTo(SW + 4, -SH + 3);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.restore();

      // particles
      particles.forEach((p) => {
        if (p.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = p.life * 0.9;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.14;
        p.life -= p.decay;
      });
    }

    const t0 = performance.now();
    function step(now) {
      const el = now - t0;
      if (el < SHAKE_DUR) {
        const t = el / SHAKE_DUR;
        const amp = 5.5 * (1 - t * 0.35);
        const shakeX = Math.sin(t * Math.PI * 2 * 9) * amp;
        const shakeY = Math.abs(Math.sin(t * Math.PI * 9)) * amp * 0.4;
        drawBox(shakeX, BY - BH + shakeY, 0);
      } else if (el < SHAKE_DUR + OPEN_DUR) {
        const t = (el - SHAKE_DUR) / OPEN_DUR;
        const ease = 1 - Math.pow(1 - t, 3);
        if (ease > 0.7 && !particlesSpawned) { particlesSpawned = true; spawnParticles(); }
        drawBox(0, BY - BH, ease);
      } else if (el < TOTAL) {
        drawBox(0, BY - BH, 1);
      } else {
        drawBox(0, BY - BH, 1);
        resolve();
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

function drawDropCharacterCanvas(canvas, nd) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const cid = Number(nd.id ?? nd.char_id ?? 0);
  const skinKey = nd.skin_key || null;
  const style = playerStyle(cid, skinKey);
  const glowCols = ["124,92,255","255,210,77","62,242,177","180,120,255","255,77,109","255,220,120","190,210,255","0,210,255","124,92,255","62,242,177"];
  const gc = glowCols[Math.min(cid, glowCols.length - 1)];
  const bg = ctx.createRadialGradient(W / 2, H * 0.52, 0, W / 2, H * 0.52, W * 0.9);
  bg.addColorStop(0, `rgba(${gc},.30)`);
  bg.addColorStop(1, `rgba(${gc},0)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 16, 38, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  const sc = Math.min(W / 42, H / 66);
  const tx = (W - 34 * sc) / 2;
  const ty = (H - 54 * sc) / 2 - 8;
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(sc, sc);
  const p = { x: 0, y: 0, w: 34, h: 54 };
  const grad = ctx.createLinearGradient(0, 0, 34, 54);
  grad.addColorStop(0, style.c1);
  grad.addColorStop(1, style.c2);
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 14, 34, 40, style.bodyR);
  ctx.fill();
  ctx.fillStyle = style.head;
  ctx.beginPath();
  ctx.arc(17, 10, style.headR + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.pack;
  roundRect(ctx, 6, 26, 22, 18, 9);
  ctx.fill();
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = 1.5 / sc;
  ctx.stroke();
  drawPlayerAccessory(ctx, p, style);
  ctx.restore();
}

function drawDropItemCanvas(canvas, nd) {
  const skinKey = nd.mods?.skin_key || nd.skin_key || null;
  const isSkin = nd.slot === "skin" || Boolean(skinKey);
  if (isSkin) {
    const skinKeyToChar = {
      runner_classic: 0, runner_santa: 0,
      sprinter_track: 1, sprinter_neon: 1,
      hopper_kangaroo: 2, hopper_rocket: 2,
      doubler_shadow: 3,
      dasher_hoodie: 4,
      magnet_gold: 5,
      guardian_paladin: 6,
      glider_wingsuit: 7,
      wallie_builder: 8,
      chrono_timelord: 9,
    };
    const charId = skinKeyToChar[skinKey] ?? 0;
    drawDropCharacterCanvas(canvas, { id: charId, skin_key: skinKey });
    return;
  }
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const rarC = { bron: "180,120,60", silb: "160,180,200", gold: "200,165,50", plat: "90,200,235", myth: "200,80,200" };
  const rar = (nd.rarity || "").toLowerCase().slice(0, 4);
  const rc = rarC[rar] || "120,130,150";
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.75);
  bg.addColorStop(0, `rgba(${rc},.34)`);
  bg.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = `rgba(${rc},1)`;
  ctx.fillStyle = `rgba(${rc},.18)`;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  const slot = (nd.slot || "").toLowerCase();
  if (slot === "feet") {
    roundRect(ctx, W * .18, H * .36, W * .64, H * .34, W * .12); ctx.fill(); ctx.stroke();
    roundRect(ctx, W * .24, H * .22, W * .42, H * .20, W * .10); ctx.fill(); ctx.stroke();
  } else if (slot === "hands") {
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W * .30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI * 0.75;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * W * .30, H / 2 + Math.sin(a) * W * .30);
      ctx.lineTo(W / 2 + Math.cos(a) * W * .46, H / 2 + Math.sin(a) * W * .46);
      ctx.stroke();
    }
  } else if (slot === "belt") {
    roundRect(ctx, W * .12, H * .38, W * .76, H * .26, 8); ctx.fill(); ctx.stroke();
    roundRect(ctx, W * .40, H * .40, W * .20, H * .22, 5); ctx.fill(); ctx.stroke();
  } else if (slot === "core") {
    ctx.beginPath();
    ctx.moveTo(W / 2, H * .13); ctx.lineTo(W * .87, H / 2); ctx.lineTo(W / 2, H * .87); ctx.lineTo(W * .13, H / 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgba(${rc},.5)`; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H * .30); ctx.lineTo(W * .70, H / 2); ctx.lineTo(W / 2, H * .70); ctx.lineTo(W * .30, H / 2);
    ctx.closePath(); ctx.stroke();
  } else {
    ctx.beginPath();
    const spikes = 5, oR = W * .36, iR = W * .18;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? oR : iR;
      i === 0 ? ctx.moveTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r) : ctx.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

async function animateBoxOpen(drop, box) {
  // Fullscreen overlay — no scrolling needed
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.90);backdrop-filter:blur(14px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;padding:24px;overflow-y:auto;gap:14px";
  document.body.appendChild(overlay);

  // Phase 1: box open animation
  const lbl1 = document.createElement("div");
  lbl1.style.cssText = "font-size:13px;font-weight:800;color:rgba(255,255,255,.60);letter-spacing:1px";
  lbl1.textContent = "BOX WIRD GEÖFFNET";
  overlay.appendChild(lbl1);
  const boxPhaseEl = document.createElement("div");
  overlay.appendChild(boxPhaseEl);
  await animateBoxOpenPhase(boxPhaseEl, box);
  overlay.innerHTML = "";

  // Phase 2: roll animation
  const kind = drop.drop_kind || "item";
  const rarity = String(drop.rarity || (drop.drop && drop.drop.rarity) || "Bronze");
  const source = drop.drop || {};
  const normalizedDrop = {
    ...source,
    skin_key: source.mods?.skin_key || source.skin_key || null,
    type: kind === "character" ? "character" : source.type || "item",
    slot: kind === "character" ? "character" : source.slot || "",
    rarity,
    desc: kind === "character" ? source.ability || "" : source.desc || "",
  };

  const rollPool = (shop?.items || []).slice();
  characters.filter((c) => c.id !== 0).forEach((c) =>
    rollPool.push({ ...c, type: "character", slot: "character", rarity: characterRarity(c.id), desc: c.ability || "" })
  );

  // 3 full cycles + random extra before final + final card + buffer after (ensures centering)
  const picks = [];
  for (let cycle = 0; cycle < 3; cycle++) { for (const it of rollPool) picks.push(it); }
  for (let i = 0; i < Math.floor(rollPool.length * 0.4); i++) picks.push(rollPool[Math.floor(Math.random() * rollPool.length)]);
  const stopIdx = picks.length;
  picks.push(normalizedDrop);
  for (let i = 0; i < Math.ceil(rollPool.length * 0.65); i++) picks.push(rollPool[Math.floor(Math.random() * rollPool.length)]);

  const lbl2 = document.createElement("div");
  lbl2.style.cssText = "font-size:13px;font-weight:800;color:rgba(255,255,255,.60);letter-spacing:1px";
  lbl2.textContent = "BOX ÖFFNEN";
  overlay.appendChild(lbl2);

  const rollWrap = document.createElement("div");
  rollWrap.style.cssText = "position:relative;width:100%;max-width:760px;flex-shrink:0";
  rollWrap.innerHTML = `<div class="roll" id="ov-roll"></div><div class="roll-needle"></div>`;
  overlay.appendChild(rollWrap);

  const resultEl = document.createElement("div");
  resultEl.style.cssText = "width:100%;max-width:760px";
  overlay.appendChild(resultEl);

  const roll = rollWrap.querySelector("#ov-roll");
  picks.forEach((it, idx) => {
    const el = document.createElement("div");
    el.className = `roll-item ${rarityBgClass(it.rarity)} ${idx === stopIdx ? "final" : ""}`;
    const isChar = it.type === "character";
    el.innerHTML = `<div class="tag">${escapeHtml(isChar ? "Charakter" : it.type)} · ${escapeHtml(it.rarity)}</div><div class="t">${escapeHtml(it.name)}</div><div class="d">${escapeHtml(it.desc || "")}</div>`;
    roll.appendChild(el);
  });

  const duration = 3600 + Math.random() * 900;
  const finalEl = roll.querySelector(".roll-item.final");

  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      const needleX = roll.clientWidth / 2;
      const cardCenter = finalEl.offsetLeft + finalEl.offsetWidth / 2;
      const target = clamp(cardCenter - needleX, 0, Math.max(0, roll.scrollWidth - roll.clientWidth));
      const t0 = performance.now();
      function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
      function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        roll.scrollLeft = target * easeOutCubic(t);
        if (t < 1) return requestAnimationFrame(step);
        roll.scrollLeft = target;
        resolve();
      }
      requestAnimationFrame(step);
    });
  });

  // Phase 3: result card
  renderShopInventory();
  renderCollection();
  const rc = { Bronze: "#b47830", Silber: "#8aaab8", Gold: "#c8a020", Platin: "#40c8e8", Mythic: "#d040d0" };
  const rarC = rc[normalizedDrop.rarity] || "#888";
  if (kind === "character") renderCharacters();
  resultEl.style.cssText = "width:100%;max-width:420px;margin:0 auto";
  resultEl.innerHTML = `
    <div style="background:rgba(20,20,28,.95);border:2px solid ${rarC};border-radius:16px;padding:18px 20px;display:flex;align-items:center;gap:16px;animation:drop-reveal .35s ease both;box-shadow:0 0 24px ${rarC}55">
      <canvas id="drop-vis" width="${kind === "character" ? 72 : 72}" height="${kind === "character" ? 88 : 72}" style="border-radius:10px;background:rgba(0,0,0,.22);flex-shrink:0"></canvas>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:${rarC};margin-bottom:4px">${escapeHtml(normalizedDrop.rarity).toUpperCase()} · ${escapeHtml(kind === "character" ? "CHARAKTER" : (normalizedDrop.type || "ITEM").toUpperCase())}</div>
        <div style="font-size:18px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(normalizedDrop.name)}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.55);margin-top:4px;line-height:1.4">${escapeHtml(normalizedDrop.desc || "")}</div>
        ${kind === "character" ? `<div style="display:inline-block;margin-top:8px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:rgba(80,210,120,.18);color:#50d278;border:1px solid #50d27855">UNLOCKED</div>` : ""}
      </div>
    </div>`;
  if (kind === "character") {
    try { drawDropCharacterCanvas(resultEl.querySelector("#drop-vis"), normalizedDrop); } catch (_) {}
  } else {
    try { drawDropItemCanvas(resultEl.querySelector("#drop-vis"), normalizedDrop); } catch (_) {}
  }

  const closeHint = document.createElement("div");
  closeHint.style.cssText = "font-size:11px;color:rgba(255,255,255,.30);text-align:center;margin-top:6px";
  closeHint.textContent = "Klick zum Schliessen";
  overlay.appendChild(closeHint);

  return new Promise((resolve) => {
    overlay.addEventListener("click", () => { overlay.remove(); resolve(); });
  });
}

async function refreshPass() {
  if (!me) return;
  const data = await api("/api/pass");
  const pass = data.pass;
  const meta = $("#pass-meta");
  const bar = $("#pass-bar");
  const grid = $("#pass-grid");
  if (!meta || !bar || !grid) return;
  const lvl = Number(pass.level || 1);
  const max = Number(pass.max_level || 50);
  const per = Number(pass.per_level || 10);
  const total = Number(pass.gems_total || 0);
  const into = total % per;
  const pct = ((lvl - 1) / (max - 1)) * 100;
  bar.style.width = `${clamp(pct, 0, 100).toFixed(1)}%`;
  meta.textContent = `Level ${lvl}/${max} · Gems total: ${total} · Nächstes Level in ${per - into} Gems`;

  grid.innerHTML = "";
  (pass.rewards || []).forEach((r) => {
    const el = document.createElement("div");
    const unlocked = !!r.unlocked;
    const claimed = !!r.claimed;
    const reward = r.reward || {};
    let label = "";
    if (reward.kind === "gems") label = `+${reward.qty} Gems`;
    else if (reward.kind === "box") {
      const box = shop?.boxes?.find((b) => b.id === reward.box_id);
      const currency = box?.currency || "coins";
      label = `${reward.qty}× Box (als ${currency === "gems" ? "Gems" : "Coins"})`;
    }
    el.className = `char ${unlocked ? "" : "rarbg bronze"}`;
    el.innerHTML = `
      <div class="head">
        <div>
          <div class="title">Stufe ${fmt(r.level)}</div>
          <div class="ability">${escapeHtml(label)}</div>
        </div>
        <div class="chip ${claimed ? "ok" : unlocked ? "gem" : "lock"}">${claimed ? "Claimed" : unlocked ? "Claim" : "Locked"}</div>
      </div>
      <button class="btn ${claimed ? "ghost" : ""}" ${!unlocked || claimed ? "disabled" : ""}>Belohnung holen</button>
    `;
    const btn = el.querySelector("button");
    btn.addEventListener("click", async () => {
      try {
        await api("/api/claim_pass", { method: "POST", body: JSON.stringify({ level: r.level }) });
        await refreshMe();
        await refreshPass();
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      }
    });
    grid.appendChild(el);
  });
}

function animateTunnelReveal(canvasEl, character, rarity) {
  const ctx2 = canvasEl.getContext("2d");
  const W2 = canvasEl.width;
  const H2 = canvasEl.height;
  const t0 = performance.now();
  const dur = 1500;
  const cid = Number(character?.id ?? 0);
  const style = playerStyle(cid, null);

  function drawFrame(now) {
    const t = Math.min(1, (now - t0) / dur);
    ctx2.clearRect(0, 0, W2, H2);

    // tunnel background
    const centerX = W2 * 0.65;
    const centerY = H2 * 0.55;
    ctx2.save();
    ctx2.fillStyle = "rgba(0,0,0,.25)";
    ctx2.fillRect(0, 0, W2, H2);
    ctx2.globalAlpha = 0.85;
    for (let i = 0; i < 14; i++) {
      const z = (i / 14) * 1.0 + t * 0.8;
      const r = 18 + (1 - (z % 1)) * 160;
      const a = 0.10 + (1 - (z % 1)) * 0.10;
      ctx2.strokeStyle = `rgba(62,242,177,${a})`;
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.ellipse(centerX, centerY, r * 1.25, r * 0.85, 0, 0, Math.PI * 2);
      ctx2.stroke();
    }
    ctx2.restore();

    // runner position: from tunnel to front
    const ease = 1 - Math.pow(1 - t, 3);
    const x = centerX + (W2 * 0.25 - centerX) * ease;
    const y = centerY + (H2 * 0.22 - centerY) * ease;
    const scale = 0.55 + ease * 0.65;
    const p = { x: x - 22 * scale, y: y - 54 * scale, w: 44 * scale, h: 54 * scale };

    // ground glow
    ctx2.save();
    ctx2.globalAlpha = 0.35;
    ctx2.fillStyle = "rgba(255,255,255,.10)";
    roundRect(ctx2, 18, H2 - 54, W2 - 36, 22, 12);
    ctx2.fill();
    ctx2.restore();

    // character body
    ctx2.save();
    const grad = ctx2.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    grad.addColorStop(0, style.c1);
    grad.addColorStop(1, style.c2);
    ctx2.fillStyle = grad;
    roundRect(ctx2, p.x, p.y + 14 * scale, p.w, p.h - 14 * scale, 12 * scale);
    ctx2.fill();
    ctx2.fillStyle = style.head;
    ctx2.beginPath();
    ctx2.arc(p.x + p.w / 2, p.y + 10 * scale, (style.headR + 1) * scale, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.fillStyle = style.pack;
    roundRect(ctx2, p.x + 6 * scale, p.y + 26 * scale, p.w - 12 * scale, 18 * scale, 9 * scale);
    ctx2.fill();
    ctx2.strokeStyle = style.outline;
    ctx2.lineWidth = 2;
    ctx2.stroke();
    drawPlayerAccessory(ctx2, p, style);
    ctx2.restore();

    // caption
    ctx2.save();
    ctx2.globalAlpha = 0.8;
    ctx2.fillStyle = "rgba(255,255,255,.82)";
    ctx2.font = "900 18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx2.fillText(`UNLOCKED · ${character?.name || "Charakter"}`, 18, 28);
    ctx2.font = "800 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx2.fillStyle = "rgba(255,255,255,.70)";
    ctx2.fillText(`Rarity: ${rarity}`, 18, 50);
    ctx2.restore();

    if (t < 1) requestAnimationFrame(drawFrame);
  }
  requestAnimationFrame(drawFrame);
}

function renderInventory({ mode }) {
  const root = $("#inventory-grid");
  root.innerHTML = "";
  if (!me) {
    root.innerHTML = `<div class="row"><div class="left"><div class="name muted">Bitte einloggen.</div></div></div>`;
    return;
  }
  const list = (inventory || []).filter((x) => {
    if (mode === "gear") return x.item.type === "gear";
    if (mode === "cosmetic") return x.item.type === "cosmetic";
    return true;
  });
  if (!list.length) {
    root.innerHTML = `<div class="row"><div class="left"><div class="name muted">Noch keine Items. Kaufe Boxen im Shop.</div></div></div>`;
    return;
  }
  list.forEach((entry) => {
    const it = entry.item;
    const el = document.createElement("div");
    el.className = `char ${rarityBgClass(it.rarity)}`;
    const isGear = it.type === "gear";
    const isSkin = isGear && it.slot === "skin";
    const equipped =
      isGear &&
      currentEquipCharacterId != null &&
      me?.equipment?.[String(currentEquipCharacterId)]?.[String(it.slot)] === it.id;
    const canEquip =
      isGear &&
      currentEquipCharacterId != null &&
      (!isSkin || skinAllowedForCharacter(it, currentEquipCharacterId));
    el.innerHTML = `
      <div class="head">
        <div>
          <div class="title">${escapeHtml(it.name)} <span class="muted">×${fmt(entry.qty)}</span></div>
          <div class="ability"><span class="rar ${rarityClass(it.rarity)}">${escapeHtml(it.rarity)}</span> · ${escapeHtml(it.type)} · <span class="mono">${escapeHtml(it.slot || "-")}</span></div>
        </div>
        <div class="chip ${equipped ? "ok" : ""}">${equipped ? "Equipped" : "Item"}</div>
      </div>
      <p>${escapeHtml(it.desc || "")}</p>
      <button class="btn ${equipped ? "ghost" : ""}" ${canEquip ? "" : "disabled"}>
        ${equipped ? "Ausgerüstet" : canEquip ? "Ausrüsten" : "—"}
      </button>
    `;
    const btn = el.querySelector("button");
    btn.addEventListener("click", async () => {
      if (!canEquip || currentEquipCharacterId == null) return;
      try {
        await api("/api/equip_item", {
          method: "POST",
          body: JSON.stringify({ character_id: currentEquipCharacterId, item_id: it.id }),
        });
        await refreshMe();
        renderInventory({ mode });
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      }
    });
    root.appendChild(el);
  });
}

function resolveCosmetic(itemId) {
  if (!itemId) return null;
  return itemCatalog.get(Number(itemId)) || null;
}

function applyProfilePreview() {
  const name = $("#profile-name");
  const title = $("#profile-title");
  const best = $("#profile-best");
  const prev = $("#profile-preview");
  const frame = $("#profile-frame");
  name.textContent = me ? me.username : "Gast";
  best.textContent = me ? fmt(me.best_score) : "0";

  const prof = me?.profile || {};
  const banner = resolveCosmetic(prof.banner_item_id);
  const bg = resolveCosmetic(prof.background_item_id);
  const fr = resolveCosmetic(prof.frame_item_id);
  const ti = resolveCosmetic(prof.title_item_id);

  const bannerKey = banner?.mods?.banner || "none";
  const bgKey = bg?.mods?.bg || "none";
  const titleText = ti?.mods?.title || "—";
  title.textContent = titleText;

  const bannerCss =
    bannerKey === "violet"
      ? "radial-gradient(900px 520px at 20% 10%, rgba(124,92,255,.35), transparent 60%), rgba(255,255,255,.04)"
      : bannerKey === "mint"
      ? "radial-gradient(900px 520px at 80% 20%, rgba(62,242,177,.22), transparent 60%), rgba(255,255,255,.04)"
      : "rgba(255,255,255,.04)";

  const bgCss =
    bgKey === "grid"
      ? `${bannerCss}, repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0, rgba(255,255,255,.06) 1px, transparent 1px, transparent 18px),
         repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0, rgba(255,255,255,.05) 1px, transparent 1px, transparent 18px)`
      : bannerCss;

  prev.style.background = bgCss;

  const frKey = fr?.mods?.frame || "none";
  frame.style.boxShadow = "none";
  frame.style.border = "none";
  if (frKey === "prism") {
    frame.style.border = "2px solid rgba(255,255,255,.18)";
    frame.style.boxShadow = "inset 0 0 0 1px rgba(124,92,255,.35), inset 0 0 0 2px rgba(62,242,177,.18)";
  }
}

function renderProfileCosmetics() {
  const root = $("#profile-cosmetics");
  root.innerHTML = "";
  if (!me) {
    root.innerHTML = `<div class="row"><div class="left"><div class="name muted">Bitte einloggen.</div></div></div>`;
    return;
  }
  const cosmetics = (inventory || []).filter((x) => x.item.type === "cosmetic").map((x) => x.item);
  const slots = ["banner", "background", "frame", "title"];
  slots.forEach((slot) => {
    const head = document.createElement("div");
    head.className = "char";
    head.innerHTML = `
      <div class="head">
        <div>
          <div class="title">${escapeHtml(slot)}</div>
          <div class="ability">Wähle ein Cosmetic</div>
        </div>
        <div class="chip small">Slot</div>
      </div>
      <div class="actions" style="flex-wrap:wrap"></div>
    `;
    const actions = head.querySelector(".actions");
    const noneBtn = document.createElement("button");
    noneBtn.className = "btn ghost";
    noneBtn.textContent = "Keins";
    noneBtn.addEventListener("click", async () => {
      await api("/api/update_profile", { method: "POST", body: JSON.stringify({ [`${slot}_item_id`]: null }) });
      await refreshMe();
      applyProfilePreview();
    });
    actions.appendChild(noneBtn);
    cosmetics
      .filter((it) => it.slot === slot)
      .forEach((it) => {
        const b = document.createElement("button");
        b.className = "btn ghost";
        b.textContent = it.name;
        b.addEventListener("click", async () => {
          await api("/api/update_profile", { method: "POST", body: JSON.stringify({ [`${slot}_item_id`]: it.id }) });
          await refreshMe();
          applyProfilePreview();
        });
        actions.appendChild(b);
      });
    root.appendChild(head);
  });
  applyProfilePreview();
}

// --- Game ---
const canvas = $("#game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const GROUND_Y = H - 86;

let keys = new Set();
window.addEventListener("keydown", (e) => {
  if (
    [
      "Space",
      "ArrowUp",
      "KeyW",
      "ArrowRight",
      "KeyD",
      "ArrowDown",
      "KeyS",
      "ShiftLeft",
      "ShiftRight",
      "KeyE",
      "KeyR",
      "Escape",
    ].includes(e.code)
  )
    e.preventDefault();
  keys.add(e.code);
  if (e.code === "Escape") {
    closeModal("#modal-auth");
    closeModal("#modal-characters");
    closeModal("#modal-shop");
    closeModal("#modal-inventory");
    closeModal("#modal-profile");
    closeModal("#modal-preview");
    closeModal("#modal-difficulty");
    closeModal("#modal-pass");
  }
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") gameStartOrJump();
  if (e.code === "KeyR") restart();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

function charParams(ch) {
  const base = {
    speed: 5.2,
    jump: 13.8,
    airControl: 0.75,
    doubleJump: false,
    dash: false,
    magnet: false,
    shield: false,
    glide: false,
    wallJump: false,
    slowmo: false,
  };
  switch (ch?.id ?? 0) {
    case 1:
      base.speed = 6.4;
      base.airControl = 0.6;
      break;
    case 2:
      base.jump = 15.8;
      break;
    case 3:
      base.doubleJump = true;
      break;
    case 4:
      base.dash = true;
      break;
    case 5:
      base.magnet = true;
      break;
    case 6:
      base.shield = true;
      break;
    case 7:
      base.glide = true;
      break;
    case 8:
      base.wallJump = true;
      break;
    case 9:
      base.slowmo = true;
      break;
  }
  // apply equipped gear mods
  const cid = ch?.id != null ? Number(ch.id) : me ? me.selected_character : 0;
  const equipRoot =
    (game?.runEquipSnapshot && (game.runCharId ?? cid) === cid && (game.running || game.over))
      ? game.runEquipSnapshot
      : me?.equipment;
  const equip = equipRoot?.[String(cid)] || {};
  const mods = {
    speed_mul: 1,
    jump_mul: 1,
    air_control_mul: 1,
    magnet_mul: 1,
    dash_cd_mul: 1,
    slow_cd_mul: 1,
    slow_dur_add: 0,
    shield_charges_add: 0,
    glide_grav_mul: 1,
  };
  let skinKey = null;
  Object.values(equip).forEach((itemId) => {
    const it = itemCatalog.get(Number(itemId));
    if (!it || it.type !== "gear") return;
    const m = it.mods || {};
    if (m.speed_mul) mods.speed_mul *= Number(m.speed_mul);
    if (m.jump_mul) mods.jump_mul *= Number(m.jump_mul);
    if (m.air_control_mul) mods.air_control_mul *= Number(m.air_control_mul);
    if (m.magnet_mul) mods.magnet_mul *= Number(m.magnet_mul);
    if (m.dash_cd_mul) mods.dash_cd_mul *= Number(m.dash_cd_mul);
    if (m.slow_cd_mul) mods.slow_cd_mul *= Number(m.slow_cd_mul);
    if (m.slow_dur_add) mods.slow_dur_add += Number(m.slow_dur_add);
    if (m.shield_charges_add) mods.shield_charges_add += Number(m.shield_charges_add);
    if (m.glide_grav_mul) mods.glide_grav_mul *= Number(m.glide_grav_mul);
    if (m.skin_key) skinKey = String(m.skin_key);
  });
  base.speed *= mods.speed_mul;
  base.jump *= mods.jump_mul;
  base.airControl *= mods.air_control_mul;
  base._mods = mods;
  base.skinKey = skinKey;
  return base;
}

function skinAllowedForCharacter(item, characterId) {
  if (!item || item.type !== "gear" || item.slot !== "skin") return false;
  const target = item?.mods?.skin_for_character_id;
  if (target == null) return true;
  return Number(target) === Number(characterId);
}

function skinsForCharacter(characterId) {
  const cid = Number(characterId);
  const skins = [];
  for (const it of itemCatalog.values()) {
    if (it?.type !== "gear" || it?.slot !== "skin") continue;
    if (!skinAllowedForCharacter(it, cid)) continue;
    skins.push(it);
  }
  skins.sort((a, b) => {
    const ra = RARITY_INDEX(a.rarity);
    const rb = RARITY_INDEX(b.rarity);
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });
  return skins;
}

function previewDraw() {
  const canvas2 = $("#preview-canvas");
  if (!canvas2) return;
  const ctx2 = canvas2.getContext("2d");
  const W2 = canvas2.width;
  const H2 = canvas2.height;
  ctx2.clearRect(0, 0, W2, H2);

  const cid = Number(previewCharacterId ?? 0);
  const ch = characters.find((x) => x.id === cid) || characters[0];
  const skinItem = previewSkinItemId ? itemCatalog.get(Number(previewSkinItemId)) : null;
  const skinKey = skinItem?.mods?.skin_key ? String(skinItem.mods.skin_key) : null;
  const style = playerStyle(cid, skinKey);

  // ground
  ctx2.save();
  ctx2.globalAlpha = 0.35;
  ctx2.fillStyle = "rgba(255,255,255,.10)";
  roundRect(ctx2, 20, H2 - 54, W2 - 40, 24, 12);
  ctx2.fill();
  ctx2.restore();

  // player pose
  const p = { x: W2 / 2 - 20, y: H2 - 54 - PLAYER_H + 6, w: 40, h: PLAYER_H };
  // shadow
  ctx2.save();
  ctx2.fillStyle = "rgba(0,0,0,.22)";
  ctx2.beginPath();
  ctx2.ellipse(p.x + p.w / 2, p.y + p.h + 14, 28, 7, 0, 0, Math.PI * 2);
  ctx2.fill();

  // body
  const grad = ctx2.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
  grad.addColorStop(0, style.c1);
  grad.addColorStop(1, style.c2);
  ctx2.fillStyle = grad;
  roundRect(ctx2, p.x, p.y + 16, p.w, p.h - 16, style.bodyR);
  ctx2.fill();
  // head
  ctx2.fillStyle = style.head;
  ctx2.beginPath();
  ctx2.arc(p.x + p.w / 2, p.y + 12, style.headR + 1, 0, Math.PI * 2);
  ctx2.fill();
  // pack
  ctx2.fillStyle = style.pack;
  roundRect(ctx2, p.x + 7, p.y + 30, p.w - 14, 18, 9);
  ctx2.fill();
  ctx2.strokeStyle = style.outline;
  ctx2.lineWidth = 2;
  ctx2.stroke();
  drawPlayerAccessory(ctx2, p, style);
  ctx2.restore();

  // text
  const r = characterRarity(cid);
  $("#preview-title").textContent = `Vorschau · ${ch.name}`;
  const meta = $("#preview-meta");
  if (meta) {
    const skinName = skinItem ? skinItem.name : "Standard";
    meta.innerHTML = `<span class="rar ${rarityClass(r)}">${escapeHtml(r)}</span> · ${escapeHtml(ch.ability)}<br><span class="muted">Skin:</span> ${escapeHtml(skinName)}`;
  }
}

function openCharacterPreview(characterId) {
  previewCharacterId = Number(characterId || 0);
  const sel = $("#preview-skin");
  const equipBtn = $("#preview-equip");
  if (!sel || !equipBtn) return;

  const skins = skinsForCharacter(previewCharacterId);
  const owned = invQtyMap();
  const equippedId = me?.equipment?.[String(previewCharacterId)]?.skin ?? null;

  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Standard";
  sel.appendChild(opt0);
  skins.forEach((it) => {
    const o = document.createElement("option");
    o.value = String(it.id);
    const have = owned.get(Number(it.id)) || 0;
    o.textContent = `${it.name} · ${it.rarity}${have ? ` · ×${have}` : ""}`;
    sel.appendChild(o);
  });

  previewSkinItemId = equippedId ? Number(equippedId) : null;
  sel.value = previewSkinItemId ? String(previewSkinItemId) : "";

  function syncEquipState() {
    const v = sel.value ? Number(sel.value) : null;
    previewSkinItemId = v;
    const skinItem = v ? itemCatalog.get(Number(v)) : null;
    const have = v ? (owned.get(Number(v)) || 0) : 0;
    const unlocked = characterUnlocked(previewCharacterId);
    equipBtn.disabled = !(unlocked && v && skinItem && have > 0);
    previewDraw();
  }

  sel.onchange = syncEquipState;
  equipBtn.onclick = async () => {
    const v = sel.value ? Number(sel.value) : null;
    if (!v || !me) return;
    try {
      await api("/api/equip_item", { method: "POST", body: JSON.stringify({ character_id: previewCharacterId, item_id: v }) });
      await refreshMe();
      await refreshInventory();
      openCharacterPreview(previewCharacterId);
    } catch (e) {
      alert(`Fehler: ${e.message}`);
    }
  };

  syncEquipState();
  openModal("#modal-preview");
}

const game = {
  running: false,
  over: false,
  t: 0,
  score: 0,
  coins: 0,
  gems: 0,
  bestLocal: 0,
  speedMul: 1,
  slowUntil: 0,
  slowCooldownUntil: 0,
  player: null,
  platforms: [],
  obstacles: [],
  coinsFx: [],
  _lastPlatY: 0,
  runCharId: 0,
  runEquipSnapshot: null, // equipment snapshot for stable look during the run
  difficulty: "normal",
};

const PLAYER_W = 34;
const PLAYER_H = 54;
const PLAYER_CROUCH_H = 38;

function restart() {
  // If the player restarts mid-run, bank collected coins/score so they don't "vanish".
  if (game.running && !game.over && me) {
    finalizeRun({ allowGameOver: false });
  }
  const p = charParams(activeCharacter);
  game.running = false;
  game.over = false;
  game.t = 0;
  game.score = 0;
  game.coins = 0;
  game.gems = 0;
  game.speedMul = 1;
  game.slowUntil = 0;
  game.slowCooldownUntil = 0;
  game.runCharId = activeCharacter?.id ?? 0;
  game.runEquipSnapshot = me?.equipment ? JSON.parse(JSON.stringify(me.equipment)) : null;
  game.player = {
    x: 170,
    y: GROUND_Y - 54,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: p.speed,
    vy: 0,
    onGround: true,
    jumpsLeft: p.doubleJump ? 1 : 0,
    dashReady: true,
    dashUntil: 0,
    shieldReady: p.shield ? true : false,
    shieldCharges: (p.shield ? 1 : 0) + (p._mods?.shield_charges_add || 0),
    invUntil: 0,
    lastWall: 0,
    crouch: false,
  };
  game.platforms = [];
  game.obstacles = [];
  game.coinsFx = [];
  spawnInitial();
  $("#stat-score").textContent = "0";
  $("#stat-coins").textContent = "0";
  $("#stat-gems").textContent = "0";
  $("#hud").classList.remove("hidden");
}

function canStandUp(p) {
  // test if switching to full height would clip into something above
  const test = { x: p.x + 6, y: p.y + 6 - (PLAYER_H - p.h), w: p.w - 12, h: PLAYER_H - 8 };
  for (const o of game.obstacles) {
    const ob = { x: o.x, y: o.y, w: o.w, h: o.h };
    if (aabb(test, ob)) return false;
  }
  for (const plat of game.platforms) {
    const ob = { x: plat.x, y: plat.y, w: plat.w, h: plat.h };
    if (aabb(test, ob)) return false;
  }
  return true;
}

async function finalizeRun({ allowGameOver }) {
  const score = game.score | 0;
  const coinsEarned = game.coins | 0;
  const gemsEarned = game.gems | 0;
  if (!me) return;
  // Consume equipped (non-skin) gear after a run, even if score/coins are low.
  try {
    await api("/api/consume_loadout", {
      method: "POST",
      body: JSON.stringify({ character_id: activeCharacter?.id ?? 0 }),
    });
  } catch (_) {}

  if (score <= 0 && coinsEarned <= 0) {
    await refreshMe();
    await refreshInventory();
    return;
  }
  const sync = $("#stat-sync");
  if (sync) {
    sync.textContent = "Sync…";
    sync.style.color = "rgba(255,255,255,.62)";
  }
  try {
    await api("/api/submit_run", {
      method: "POST",
      body: JSON.stringify({ score, coins_earned: coinsEarned, gems_earned: gemsEarned, character_id: activeCharacter?.id ?? 0 }),
    });
    await refreshMe();
    await refreshInventory();
    await refreshLeaderboard();
    if (sync) sync.textContent = "";
  } catch (e) {
    if (sync) {
      sync.textContent = "Sync fehlgeschlagen";
      sync.style.color = "var(--danger)";
    }
    console.error("submit_run failed", e);
  }
  if (allowGameOver) {
    // no-op (gameOver handles UI)
  }
}

function spawnInitial() {
  game.platforms.push({ x: 0, y: GROUND_Y, w: W + 200, h: 60 });
  game._lastPlatY = GROUND_Y;
  for (let i = 0; i < 7; i++) spawnChunk(W + i * 260);
}

function spawnChunk(x0) {
  const diff = game.difficulty || "normal";
  const DIFF = {
    easy:   { yMin: 310, yDelta: 12, gapBase: 44, gapMin: 12, deadly: 0.05, pillar: 0.0,  beam: 0.25 },
    normal: { yMin: 215, yDelta: 55, gapBase: 98, gapMin: 34, deadly: 0.48, pillar: 0.18, beam: 0.14 },
    hard:   { yMin: 130, yDelta: 115, gapBase: 185, gapMin: 65, deadly: 0.80, pillar: 0.42, beam: 0.28 },
  };
  const cfg = DIFF[diff] || DIFF.normal;
  const prevY = game._lastPlatY || GROUND_Y;
  const w = diff === "easy" ? rand(290, 460) : diff === "hard" ? rand(160, 270) : rand(190, 340);
  const y = clamp(prevY + rand(-cfg.yDelta, cfg.yDelta), cfg.yMin, GROUND_Y);
  const up = Math.max(0, prevY - y); // positive when next platform is higher
  const maxGap = clamp(cfg.gapBase - up * 0.85, 54, cfg.gapBase);
  const gap = rand(cfg.gapMin, maxGap);
  const x = x0 + gap;
  game.platforms.push({ x, y, w, h: 26 });
  game._lastPlatY = y;

  // obstacles (mix)
  const r = Math.random();
  const deadlyCut = cfg.deadly;
  if (r < deadlyCut * 0.55) {
    // spike (deadly unless landed from above)
    const ox = x + rand(62, w - 62);
    const oh = rand(22, 40);
    game.obstacles.push({ x: ox, y: y - oh, w: 20, h: oh, type: "spike" });
  } else if (r < deadlyCut) {
    // hurdle (deadly unless landed from above)
    const ox = x + rand(74, w - 74);
    const oh = rand(26, 44);
    game.obstacles.push({ x: ox, y: y - oh, w: 36, h: oh, type: "hurdle" });
  } else if (r < 0.74) {
    // block (solid, can land on)
    const ox = x + rand(74, w - 74);
    const oh = rand(26, 58);
    const ow = rand(40, 78);
    game.obstacles.push({ x: ox, y: y - oh, w: ow, h: oh, type: "block" });
  } else if (r < 0.82) {
    // crate (small solid)
    const ox = x + rand(74, w - 74);
    const s = rand(30, 46);
    game.obstacles.push({ x: ox, y: y - s, w: s, h: s, type: "crate" });
  } else if (r < 0.82 + cfg.beam) {
    // beam (floating solid platform you can land on)
    const ox = x + rand(74, w - 120);
    const ow = rand(90, 130);
    const maxY = y - 54;
    const minY = Math.min(150, maxY);
    const topY = clamp(y - rand(70, 120), minY, maxY);
    game.obstacles.push({ x: ox, y: topY, w: ow, h: 18, type: "beam" });
  } else if (w >= 260 && diff !== "easy") {
    // double step (two small solids)
    const ox = x + rand(74, w - 140);
    const s1 = rand(28, 44);
    const s2 = rand(28, 44);
    game.obstacles.push({ x: ox, y: y - s1, w: s1 + 8, h: s1, type: "crate" });
    game.obstacles.push({ x: ox + s1 + 24, y: y - s2, w: s2 + 8, h: s2, type: "crate" });
  } else {
    // fallback: small block
    const ox = x + rand(74, w - 74);
    const oh = rand(26, 52);
    const ow = rand(40, 74);
    game.obstacles.push({ x: ox, y: y - oh, w: ow, h: oh, type: "block" });
  }

  // coin line
  const n = rand(3, 8);
  for (let i = 0; i < n; i++) {
    const cx = x + 40 + i * 34;
    const cy = y - rand(34, 70);
    game.coinsFx.push({ x: cx, y: cy, r: 9, taken: false });
  }

  // wall pillar (for wall jump char)
  const prm = charParams(activeCharacter);
  if (prm.wallJump && Math.random() < cfg.pillar) {
    const px = x + w + rand(20, 70);
    const ph = diff === "hard" ? rand(120, 190) : rand(85, 150);
    game.obstacles.push({ x: px, y: y - ph, w: 34, h: ph, type: "pillar" });
  }
}

function rand(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}

function gameStartOrJump() {
  if (game.over) return restart();
  if (!game.running) {
    if (!game.difficulty) game.difficulty = "normal";
    // Choose difficulty before starting
    closeModal("#modal-preview");
    openModal("#modal-difficulty");
    return;
  }
  doJump();
}

function doJump() {
  const p = game.player;
  const prm = charParams(activeCharacter);
  if (p.onGround) {
    p.vy = -prm.jump;
    p.onGround = false;
    p.jumpsLeft = prm.doubleJump ? 1 : 0;
    return;
  }
  if (prm.doubleJump && p.jumpsLeft > 0) {
    p.vy = -prm.jump * 0.9;
    p.jumpsLeft -= 1;
  }
}

function startRunWithDifficulty(diff) {
  game.difficulty = diff || "normal";
  // lock in current character + equipped look for this run (avoids "wrong design" at start)
  game.runCharId = activeCharacter?.id ?? 0;
  game.runEquipSnapshot = me?.equipment ? JSON.parse(JSON.stringify(me.equipment)) : null;
  game.running = true;
  $("#hud").classList.add("hidden");
  closeModal("#modal-difficulty");
}

function tryDash(dt) {
  const prm = charParams(activeCharacter);
  if (!prm.dash) return;
  const p = game.player;
  if (!keys.has("ShiftLeft") && !keys.has("ShiftRight") && !keys.has("KeyD") && !keys.has("ArrowRight")) return;
  if (!p.dashReady) return;
  p.dashReady = false;
  p.dashUntil = game.t + 0.22;
  const cd = 900 * (prm._mods?.dash_cd_mul || 1);
  setTimeout(() => (p.dashReady = true), cd);
}

function trySlowmo() {
  const prm = charParams(activeCharacter);
  if (!prm.slowmo) return;
  if (!keys.has("KeyE")) return;
  if (game.t < game.slowCooldownUntil) return;
  game.slowUntil = game.t + 0.9 + (prm._mods?.slow_dur_add || 0);
  game.slowCooldownUntil = game.t + 4.5 * (prm._mods?.slow_cd_mul || 1);
}

function physics(dt) {
  const prm = charParams(activeCharacter);
  const p = game.player;
  const prevY = p.y;

  // slowmo
  trySlowmo();
  const slow = game.t < game.slowUntil ? 0.55 : 1.0;
  dt *= slow;

  // dash
  tryDash(dt);
  const dash = game.t < p.dashUntil ? 1.75 : 1.0;

  // base forward
  p.vx = prm.speed * dash;

  // gravity & glide
  const holdingJump = keys.has("Space") || keys.has("KeyW") || keys.has("ArrowUp");
  const cancelJump = keys.has("ArrowDown") || keys.has("KeyS");
  const glideG = 18.5 * (prm._mods?.glide_grav_mul || 1);
  const g = prm.glide && holdingJump && p.vy > 0 ? glideG : 28.0;

  // Jump cancel / short hop: releasing jump early cuts upward velocity
  if (!holdingJump && p.vy < -2.0) {
    p.vy *= 0.55;
  }
  // Fast-fall: ArrowDown/S cuts upward velocity, then falls faster
  if (cancelJump && p.vy < -2.0) {
    p.vy *= 0.35;
  }
  p.vy += g * dt;
  if (cancelJump && p.vy > 0) {
    // slightly faster descent when holding down
    p.vy += 26.0 * dt;
  }
  p.y += p.vy;

  // collisions with platforms
  p.onGround = false;
  const foot = p.y + p.h;
  const prevFoot = prevY + p.h;
  for (const plat of game.platforms) {
    if (p.x + p.w > plat.x && p.x < plat.x + plat.w) {
      const top = plat.y;
      if (foot >= top && foot <= top + 18 && p.vy >= 0) {
        p.y = top - p.h;
        p.vy = 0;
        p.onGround = true;
      }
    }
  }

  // crouch/duck (on ground): hold Down/S to duck; release to stand if space above is free
  if (p.onGround) {
    if (cancelJump) {
      if (!p.crouch) {
        const dy = PLAYER_H - PLAYER_CROUCH_H;
        p.crouch = true;
        p.h = PLAYER_CROUCH_H;
        p.y += dy; // keep feet fixed
      }
    } else {
      if (p.crouch && canStandUp(p)) {
        const dy = PLAYER_H - PLAYER_CROUCH_H;
        p.crouch = false;
        p.h = PLAYER_H;
        p.y -= dy; // keep feet fixed
      }
    }
  } else if (p.crouch) {
    // no crouch in air; restore when leaving ground
    const dy = PLAYER_H - PLAYER_CROUCH_H;
    p.crouch = false;
    p.h = PLAYER_H;
    p.y -= dy;
  }

  // move world left
  const worldSpeed = p.vx * 60 * dt;
  game.score += worldSpeed * 0.12;
  const dx = worldSpeed;
  for (const plat of game.platforms) plat.x -= dx;
  for (const ob of game.obstacles) ob.x -= dx;
  for (const c of game.coinsFx) c.x -= dx;

  // cleanup and spawn
  game.platforms = game.platforms.filter((pl) => pl.x + pl.w > -120);
  game.obstacles = game.obstacles.filter((o) => o.x + o.w > -140);
  game.coinsFx = game.coinsFx.filter((c) => c.x + 40 > -140 && !c._gone);

  const maxX = Math.max(...game.platforms.map((p) => p.x + p.w), 0);
  if (maxX < W + 520) {
    spawnChunk(maxX);
  }

  // coin magnet
  const baseMag = 60;
  const magnetR = (prm.magnet ? 115 : baseMag) * (prm._mods?.magnet_mul || 1);
  for (const c of game.coinsFx) {
    if (c.taken) continue;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    const dx2 = c.x - px;
    const dy2 = c.y - py;
    const d = Math.hypot(dx2, dy2);
    if (d < magnetR) {
      // pull in
      c.x -= dx2 * dt * (prm.magnet ? 8.0 : 3.5);
      c.y -= dy2 * dt * (prm.magnet ? 8.0 : 3.5);
    }
    if (d < 30) {
      c.taken = true;
      c._gone = true;
      game.coins += 1;
      game.gems += 1;
    }
  }

  // obstacle collision
  const hitbox = { x: p.x + 6, y: p.y + 6, w: p.w - 12, h: p.h - 8 };
  for (const o of game.obstacles) {
    const ob = { x: o.x, y: o.y, w: o.w, h: o.h };
    if (aabb(hitbox, ob)) {
      // Obstacles you can land on (top collision)
      if (
        o.type === "block" ||
        o.type === "pillar" ||
        o.type === "crate" ||
        o.type === "beam" ||
        o.type === "spike" ||
        o.type === "hurdle"
      ) {
        const top = o.y;
        const curFoot = p.y + p.h;
        const wasAbove = prevFoot <= top + 2;
        if (wasAbove && curFoot >= top && p.vy >= 0) {
          p.y = top - p.h;
          p.vy = 0;
          p.onGround = true;
          continue;
        }
      }
      if (o.type === "pillar" && prm.wallJump) {
        // wall jump if touching and rising/falling
        const touchR = Math.abs(p.x + p.w - o.x) < 18;
        const touchL = Math.abs(p.x - (o.x + o.w)) < 18;
        if (!p.onGround && (touchR || touchL)) {
          if (keys.has("Space") && game.t - p.lastWall > 0.25) {
            p.vy = -prm.jump * 0.98;
            p.lastWall = game.t;
          }
        }
      } else {
        // If you land on top of spikes/hurdles it's safe; otherwise they are deadly.
        if (o.type === "spike" || o.type === "hurdle") {
          // already handled by top-collision; anything else is a hit
        }
        if (p.invUntil > game.t) continue;
        if (prm.shield && p.shieldCharges > 0) {
          p.shieldCharges -= 1;
          p.invUntil = game.t + 0.9;
          break;
        }
        gameOver();
        break;
      }
    }
  }

  // fall off
  if (p.y > H + 80) gameOver();
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

let submitted = false;
async function gameOver() {
  if (game.over) return;
  game.over = true;
  game.running = false;
  $("#hud").classList.remove("hidden");
  $("#hud").querySelector(".hud-title").innerHTML = `Game Over · <span class="mono">${fmt(game.score)}</span>`;
  $("#hud").querySelector(".hud-sub").textContent = "Drücke R oder Space zum Neustart.";

  const finalScore = game.score | 0;
  if (finalScore > game.bestLocal) game.bestLocal = finalScore;
  if (me && !submitted) {
    submitted = true;
    try {
      await finalizeRun({ allowGameOver: true });
    } catch (_) {}
    submitted = false;
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // background grid
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  // platforms
  for (const pl of game.platforms) {
    ctx.fillStyle = "rgba(255,255,255,.08)";
    roundRect(ctx, pl.x, pl.y, pl.w, pl.h, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.stroke();
  }

  // obstacles
  for (const o of game.obstacles) {
    if (o.type === "pillar") {
      // taller structure should be clearly visible
      ctx.save();
      ctx.fillStyle = "rgba(124,92,255,.22)";
      roundRect(ctx, o.x, o.y, o.w, o.h, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // inner highlight
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "rgba(255,255,255,.08)";
      roundRect(ctx, o.x + 6, o.y + 10, o.w - 12, o.h - 20, 10);
      ctx.fill();
      ctx.restore();
      continue;
    }
    if (o.type === "beam") {
      ctx.fillStyle = "rgba(255,255,255,.08)";
      roundRect(ctx, o.x, o.y, o.w, o.h, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.24)";
      ctx.lineWidth = 2;
      ctx.stroke();
      continue;
    }
    if (o.type === "block" || o.type === "crate") {
      ctx.fillStyle = "rgba(255,255,255,.10)";
      roundRect(ctx, o.x, o.y, o.w, o.h, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // spike/hurdle: bright and outlined
      ctx.fillStyle = "rgba(255,77,109,.86)";
      roundRect(ctx, o.x, o.y, o.w, o.h, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // coins
  for (const c of game.coinsFx) {
    if (c.taken) continue;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(62,242,177,.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(62,242,177,.35)";
    ctx.stroke();
  }

  // player
  const p = game.player;
  const runChar = (game.running || game.over)
    ? (characters.find((c) => c.id === game.runCharId) || activeCharacter)
    : activeCharacter;
  const prm = charParams(runChar);
  const shieldOn = prm.shield && p.shieldCharges > 0;
  // back-view character
  ctx.save();
  ctx.globalAlpha = p.invUntil > game.t ? 0.55 : 1;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  ctx.ellipse(p.x + p.w / 2, p.y + p.h + 10, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const style = playerStyle(runChar?.id ?? 0, prm.skinKey);
  // body
  const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
  grad.addColorStop(0, style.c1);
  grad.addColorStop(1, style.c2);
  ctx.fillStyle = grad;
  roundRect(ctx, p.x, p.y + 14, p.w, p.h - 14, style.bodyR);
  ctx.fill();
  // head
  ctx.fillStyle = style.head;
  ctx.beginPath();
  ctx.arc(p.x + p.w / 2, p.y + 10, style.headR, 0, Math.PI * 2);
  ctx.fill();
  // accent / backpack
  ctx.fillStyle = style.pack;
  roundRect(ctx, p.x + 6, p.y + 26, p.w - 12, 18, 9);
  ctx.fill();
  // outline
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  // accessories (per skin/character)
  drawPlayerAccessory(ctx, p, style);
  ctx.restore();

  // shield flash
  if (shieldOn && p.invUntil > game.t) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(62,242,177,.65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ability hint (so it's obvious each character is different)
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.font = "700 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "rgba(255,255,255,.80)";
  const ability = runChar?.ability || "Balanced";
  let hint = "";
  if (prm.dash) hint = "Shift/→ = Dash";
  else if (prm.doubleJump) hint = "2x Space = Double Jump";
  else if (prm.glide) hint = "Halte Space = Glide";
  else if (prm.wallJump) hint = "An Wand + Space = Wall Jump";
  else if (prm.slowmo) hint = "E = Slow‑mo";
  else if (prm.shield) hint = "1 Hit wird geblockt";
  else if (prm.magnet) hint = "Coins ziehen an";
  ctx.fillText(`Ability: ${ability}`, 18, 26);
  if (hint) {
    ctx.globalAlpha = 0.7;
    ctx.fillText(hint, 18, 46);
  }
  ctx.restore();

  // stats
  $("#stat-score").textContent = fmt(game.score);
  $("#stat-coins").textContent = fmt(game.coins);
  $("#stat-gems").textContent = fmt(game.gems);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function playerStyle(characterId, skinKey) {
  const id = Number(characterId) || 0;
  const base = {
    c1: "rgba(124,92,255,.95)",
    c2: "rgba(62,242,177,.75)",
    head: "rgba(255,255,255,.18)",
    pack: "rgba(0,0,0,.18)",
    outline: "rgba(255,255,255,.18)",
    headR: 10,
    bodyR: 12,
    skinKey: skinKey || null,
    hat: null,
    emblem: null,
  };
  switch (id) {
    case 1: // Sprinter
      base.c1 = "rgba(255,210,77,.92)";
      base.c2 = "rgba(255,77,109,.70)";
      base.head = "rgba(255,255,255,.20)";
      base.emblem = "bolt";
      base.headR = 9;
      base.bodyR = 16;
      base.hat = "cap";
      break;
    case 2: // Hopper
      base.c1 = "rgba(62,242,177,.88)";
      base.c2 = "rgba(66,160,255,.72)";
      base.emblem = "spring";
      base.headR = 11;
      base.bodyR = 10;
      base.hat = "ears";
      break;
    case 3: // Doubler
      base.c1 = "rgba(180,120,255,.90)";
      base.c2 = "rgba(40,40,60,.72)";
      base.emblem = "two";
      base.headR = 10;
      base.bodyR = 8;
      break;
    case 4: // Dasher
      base.c1 = "rgba(255,77,109,.88)";
      base.c2 = "rgba(124,92,255,.72)";
      base.emblem = "dash";
      base.hat = "hood";
      break;
    case 5: // Magnet
      base.c1 = "rgba(255,220,120,.90)";
      base.c2 = "rgba(62,242,177,.70)";
      base.emblem = "coin";
      base.hat = "goggles";
      break;
    case 6: // Guardian
      base.c1 = "rgba(190,210,255,.86)";
      base.c2 = "rgba(124,92,255,.70)";
      base.pack = "rgba(255,255,255,.10)";
      base.emblem = "shield";
      base.hat = "helm";
      base.bodyR = 6;
      break;
    case 7: // Glider
      base.c1 = "rgba(0,210,255,.90)";
      base.c2 = "rgba(255,255,255,.68)";
      base.emblem = "wing";
      base.hat = "wings";
      base.pack = "rgba(255,255,255,.10)";
      base.bodyR = 18;
      base.headR = 9;
      break;
    case 8: // Wallie
      base.c1 = "rgba(124,92,255,.90)";
      base.c2 = "rgba(255,210,77,.66)";
      base.emblem = "hook";
      base.hat = "helm";
      break;
    case 9: // Chrono
      base.c1 = "rgba(62,242,177,.88)";
      base.c2 = "rgba(124,92,255,.70)";
      base.emblem = "clock";
      base.hat = "crown";
      break;
  }

  // Skins: override / add accessories
  if (skinKey === "runner_classic") {
    base.c1 = "rgba(80,140,255,.92)";
    base.c2 = "rgba(255,255,255,.70)";
    base.hat = "cap";
    base.emblem = null;
  } else if (skinKey === "runner_santa") {
    base.c1 = "rgba(255,77,109,.92)";
    base.c2 = "rgba(255,255,255,.78)";
    base.hat = "santa";
    base.emblem = "gift";
  } else if (skinKey === "sprinter_track") {
    base.c1 = "rgba(255,165,30,.92)";
    base.c2 = "rgba(255,255,255,.72)";
    base.hat = "cap";
    base.emblem = "bolt";
  } else if (skinKey === "sprinter_neon") {
    base.c1 = "rgba(62,242,177,.90)";
    base.c2 = "rgba(255,77,109,.78)";
    base.hat = null;
    base.emblem = "bolt";
  } else if (skinKey === "hopper_kangaroo") {
    base.c1 = "rgba(210,160,80,.90)";
    base.c2 = "rgba(180,120,50,.72)";
    base.hat = "ears";
    base.emblem = "spring";
  } else if (skinKey === "hopper_rocket") {
    base.c1 = "rgba(255,80,60,.90)";
    base.c2 = "rgba(255,200,40,.72)";
    base.hat = null;
    base.emblem = "spring";
    base.pack = "rgba(255,80,60,.35)";
  } else if (skinKey === "doubler_shadow") {
    base.c1 = "rgba(30,20,50,.95)";
    base.c2 = "rgba(140,80,255,.70)";
    base.hat = null;
    base.emblem = "two";
  } else if (skinKey === "dasher_hoodie") {
    base.c1 = "rgba(50,50,80,.92)";
    base.c2 = "rgba(255,77,109,.70)";
    base.hat = "hood";
    base.emblem = "dash";
  } else if (skinKey === "magnet_gold") {
    base.c1 = "rgba(210,170,30,.92)";
    base.c2 = "rgba(255,230,80,.72)";
    base.hat = "goggles";
    base.emblem = "coin";
  } else if (skinKey === "guardian_paladin") {
    base.c1 = "rgba(220,230,255,.88)";
    base.c2 = "rgba(120,150,190,.72)";
    base.hat = "helm";
    base.emblem = "shield";
  } else if (skinKey === "glider_wingsuit") {
    base.c1 = "rgba(40,180,255,.90)";
    base.c2 = "rgba(200,240,255,.70)";
    base.hat = "wings";
    base.emblem = "wing";
    base.pack = "rgba(40,180,255,.22)";
  } else if (skinKey === "wallie_builder") {
    base.c1 = "rgba(180,130,60,.90)";
    base.c2 = "rgba(255,210,77,.70)";
    base.hat = "helm";
    base.emblem = "hook";
  } else if (skinKey === "chrono_timelord") {
    base.c1 = "rgba(255,210,77,.90)";
    base.c2 = "rgba(124,92,255,.76)";
    base.hat = "crown";
    base.emblem = "clock";
  }
  return base;
}

function drawPlayerAccessory(ctx, p, style) {
  // hat / helmet
  if (style.hat === "santa") {
    ctx.save();
    // hat base
    ctx.fillStyle = "rgba(255,77,109,.92)";
    roundRect(ctx, p.x + 5, p.y + 1, p.w - 10, 10, 6);
    ctx.fill();
    // hat tip + pom
    ctx.fillStyle = "rgba(255,255,255,.86)";
    ctx.beginPath();
    ctx.arc(p.x + p.w - 6, p.y + 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (style.hat === "helm") {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.22)";
    roundRect(ctx, p.x + 6, p.y + 1, p.w - 12, 12, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  } else if (style.hat === "cap") {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.22)";
    roundRect(ctx, p.x + 6, p.y + 2, p.w - 12, 10, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)";
    roundRect(ctx, p.x + 10, p.y + 10, p.w - 20, 4, 3);
    ctx.fill();
    ctx.restore();
  } else if (style.hat === "hood") {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.20)";
    roundRect(ctx, p.x + 4, p.y + 1, p.w - 8, 16, 10);
    ctx.fill();
    ctx.restore();
  } else if (style.hat === "ears") {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.14)";
    roundRect(ctx, p.x + 6, p.y - 6, 8, 14, 6);
    ctx.fill();
    roundRect(ctx, p.x + p.w - 14, p.y - 6, 8, 14, 6);
    ctx.fill();
    ctx.restore();
  } else if (style.hat === "goggles") {
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = "rgba(255,255,255,.30)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2 - 6, p.y + 11, 5, 0, Math.PI * 2);
    ctx.arc(p.x + p.w / 2 + 6, p.y + 11, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (style.hat === "wings") {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(255,255,255,.20)";
    // big wings so Glider is clearly different
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y + 36);
    ctx.quadraticCurveTo(p.x - 26, p.y + 20, p.x - 10, p.y + 18);
    ctx.quadraticCurveTo(p.x - 6, p.y + 28, p.x - 18, p.y + 36);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x + p.w + 18, p.y + 36);
    ctx.quadraticCurveTo(p.x + p.w + 26, p.y + 20, p.x + p.w + 10, p.y + 18);
    ctx.quadraticCurveTo(p.x + p.w + 6, p.y + 28, p.x + p.w + 18, p.y + 36);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.20)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  } else if (style.hat === "crown") {
    ctx.save();
    ctx.fillStyle = "rgba(255,210,77,.55)";
    ctx.beginPath();
    ctx.moveTo(p.x + 8, p.y + 6);
    ctx.lineTo(p.x + 14, p.y + 0);
    ctx.lineTo(p.x + p.w / 2, p.y + 6);
    ctx.lineTo(p.x + p.w - 14, p.y + 0);
    ctx.lineTo(p.x + p.w - 8, p.y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // emblem on chest
  if (style.emblem) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "rgba(0,0,0,.30)";
    const cx = p.x + p.w / 2;
    const cy = p.y + 34;
    if (style.emblem === "bolt") {
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 6);
      ctx.lineTo(cx + 1, cy - 6);
      ctx.lineTo(cx - 2, cy + 1);
      ctx.lineTo(cx + 5, cy + 1);
      ctx.lineTo(cx - 1, cy + 10);
      ctx.lineTo(cx + 1, cy + 2);
      ctx.lineTo(cx - 5, cy + 2);
      ctx.closePath();
      ctx.fill();
    } else if (style.emblem === "shield") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.quadraticCurveTo(cx + 8, cy - 5, cx + 7, cy + 3);
      ctx.quadraticCurveTo(cx + 4, cy + 10, cx, cy + 12);
      ctx.quadraticCurveTo(cx - 4, cy + 10, cx - 7, cy + 3);
      ctx.quadraticCurveTo(cx - 8, cy - 5, cx, cy - 7);
      ctx.fill();
    } else if (style.emblem === "clock") {
      ctx.beginPath();
      ctx.arc(cx, cy + 1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 1);
      ctx.lineTo(cx, cy - 3);
      ctx.moveTo(cx, cy + 1);
      ctx.lineTo(cx + 3, cy + 3);
      ctx.stroke();
    } else if (style.emblem === "gift") {
      roundRect(ctx, cx - 7, cy - 5, 14, 12, 4);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "rgba(255,255,255,.28)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (style.emblem === "wing") {
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy + 4);
      ctx.quadraticCurveTo(cx - 2, cy - 8, cx + 8, cy - 2);
      ctx.quadraticCurveTo(cx + 2, cy - 2, cx - 1, cy + 3);
      ctx.quadraticCurveTo(cx - 4, cy + 8, cx - 8, cy + 4);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "rgba(255,255,255,.28)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

let last = performance.now();
function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.04);
  last = now;
  game.t += dt;
  if (game.running && !game.over) physics(dt);
  draw();
  requestAnimationFrame(loop);
}

// --- Boot ---
(async function boot() {
  shop = await api("/api/shop");
  (shop.items || []).forEach((it) => itemCatalog.set(Number(it.id), it));
  characterRarityMap = new Map((shop.character_drop_table || []).map((x) => [Number(x.character_id), String(x.rarity || "Bronze")]));

  const chars = await api("/api/characters");
  characters = chars.characters;
  activeCharacter = characters[0];

  await refreshMe();
  await refreshInventory();
  await refreshLeaderboard();
  renderShop();

  $("#btn-refresh").addEventListener("click", refreshLeaderboard);
  $("#btn-auth").addEventListener("click", () => openModal("#modal-auth"));
  $("#btn-shop").addEventListener("click", async () => {
    if (!me) return openModal("#modal-auth");
    await refreshMe();
    await refreshInventory();
    currentEquipCharacterId = null;
    renderShop();
    renderShopInventory();
    renderCollection();
    $("#shop-coins").textContent = fmt(me.coins);
    $("#shop-drop").style.display = "none";
    setShopTab("boxes");
    openModal("#modal-shop");
  });

  // collection filter buttons
  const cf = $("#collection-filter");
  if (cf) {
    cf.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        cf.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        collectionFilter = String(b.dataset.filter || "all");
        renderCollection();
      })
    );
  }
  $("#btn-profile").addEventListener("click", async () => {
    if (!me) return openModal("#modal-auth");
    await refreshMe();
    await refreshInventory();
    currentEquipCharacterId = null;
    renderProfileCosmetics();
    openModal("#modal-profile");
  });
  $("#btn-logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: "{}" });
    me = null;
    setUserPill();
    $("#stat-best").textContent = "0";
    $("#wallet-coins").textContent = "0";
    $("#shop-coins").textContent = "0";
    $("#inv-coins").textContent = "0";
    activeCharacter = characters[0];
    $("#active-character").textContent = activeCharacter.name;
    renderCharacters();
  });

  // modal close
  document.body.addEventListener("click", (e) => {
    const t = e.target;
    const closer = t && t.closest ? t.closest("[data-close]") : null;
    if (closer) {
      closeModal("#modal-auth");
      closeModal("#modal-characters");
      closeModal("#modal-shop");
      closeModal("#modal-inventory");
      closeModal("#modal-profile");
      closeModal("#modal-preview");
      closeModal("#modal-difficulty");
      closeModal("#modal-pass");
    }
  });

  // tabs
  const tabs = Array.from(document.querySelectorAll(".tab"));
  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      const which = t.dataset.tab;
      $("#form-login").classList.toggle("hidden", which !== "login");
      $("#form-register").classList.toggle("hidden", which !== "register");
      $("#msg-login").textContent = "";
      $("#msg-register").textContent = "";
    })
  );

  // shop tabs registered below

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
      await refreshMe();
      await refreshLeaderboard();
      await refreshInventory();
      renderCharacters();
      renderShop();
      renderProfileCosmetics();
      restart();
      closeModal("#modal-auth");
    } catch (err) {
      toast($("#msg-login"), `Login fehlgeschlagen (${err.message})`);
    }
  });

  $("#form-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
      });
      await refreshMe();
      await refreshLeaderboard();
      await refreshInventory();
      renderCharacters();
      renderShop();
      renderProfileCosmetics();
      restart();
      closeModal("#modal-auth");
    } catch (err) {
      const map = {
        bad_username: "Username ungültig (3–20, nur a-z/0-9/_).",
        bad_password: "Password zu kurz (min. 6).",
        username_taken: "Username ist schon vergeben.",
      };
      toast($("#msg-register"), map[err.message] || `Fehler (${err.message})`);
    }
  });

  $("#btn-open-characters").addEventListener("click", async () => {
    await refreshMe();
    await refreshInventory();
    renderCharacters();
    openModal("#modal-characters");
  });
  $("#btn-restart").addEventListener("click", restart);

  // difficulty modal buttons
  const diffM = $("#modal-difficulty");
  if (diffM) {
    diffM.querySelectorAll("[data-diff]").forEach((b) =>
      b.addEventListener("click", () => startRunWithDifficulty(String(b.dataset.diff || "normal")))
    );
  }

  // pass modal - DISABLED
  /*
  const passBtn = $("#btn-pass");
  if (passBtn) {
    passBtn.addEventListener("click", async () => {
      if (!me) return openModal("#modal-auth");
      await refreshMe();
      await refreshPass();
      openModal("#modal-pass");
    });
  }
  */

  // shop tabs: include gifts tab
  const shopTabsAll = Array.from(document.querySelectorAll("#shop-tabs .tab"));
  shopTabsAll.forEach((t) =>
    t.addEventListener("click", async () => {
      const tab = t.dataset.shopTab;
      if (!tab) return;
      await refreshMe();
      await refreshInventory();
      renderShop();
      renderShopInventory();
      renderCollection();
      if (tab === "gifts") await renderShopGifts();
      setShopTab(tab);
    })
  );

  // admin logout
  const btnAdminLogout = $("#btn-admin-logout");
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener("click", async () => {
      await api("/api/logout", { method: "POST", body: "{}" });
      me = null;
      showAdminPanel(false);
      setUserPill();
      activeCharacter = characters[0];
      if (activeCharacter) $("#active-character").textContent = activeCharacter.name;
      renderCharacters();
      restart();
    });
  }

  // admin refresh
  const btnAdminRefresh = $("#btn-admin-refresh");
  if (btnAdminRefresh) btnAdminRefresh.addEventListener("click", loadAdminUsers);

  restart();
  requestAnimationFrame(loop);
})().catch((e) => {
  console.error(e);
  alert("Boot-Fehler: " + e.message);
});

// ===== ADMIN PANEL =====
let adminSelectedUserId = null;
let adminPanelInited = false;

function showAdminPanel(show) {
  const panel = $("#admin-panel");
  const mainLayout = $(".layout");
  const topbar = $(".topbar");
  if (!panel) return;
  panel.style.display = show ? "flex" : "none";
  if (mainLayout) mainLayout.style.display = show ? "none" : "";
  if (topbar) topbar.style.display = show ? "none" : "";
}

async function loadAdminUsers() {
  const list = $("#admin-users-list");
  if (!list) return;
  try {
    const data = await api("/api/admin/users");
    list.innerHTML = "";
    adminSelectedUserId = null;
    const actionPanel = $("#admin-action-panel");
    if (actionPanel) actionPanel.style.display = "none";
    (data.users || []).forEach((u) => {
      const row = document.createElement("div");
      row.className = "admin-user-row";
      row.dataset.userId = u.id;
      const badges = [];
      if (u.is_admin) badges.push(`<span class="admin-badge admin">Admin</span>`);
      if (u.is_banned) badges.push(`<span class="admin-badge banned">Gesperrt</span>`);
      row.innerHTML = `
        <div class="admin-user-info">
          <div class="admin-user-name">${escapeHtml(u.username)} <span class="muted" style="font-size:11px">#${u.id}</span></div>
          <div class="admin-user-meta">Coins: ${u.coins} · Gems: ${u.gems} · Score: ${u.best_score}</div>
        </div>
        <div class="admin-user-badges">${badges.join("")}</div>
      `;
      row.addEventListener("click", () => selectAdminUser(u));
      list.appendChild(row);
    });
  } catch (e) {
    if (list) list.innerHTML = `<div class="muted">Fehler: ${escapeHtml(e.message)}</div>`;
  }
}

function selectAdminUser(u) {
  adminSelectedUserId = u.id;
  document.querySelectorAll(".admin-user-row").forEach((r) =>
    r.classList.toggle("active", String(r.dataset.userId) === String(u.id))
  );
  const actionPanel = $("#admin-action-panel");
  const actionTitle = $("#admin-action-title");
  if (actionPanel) actionPanel.style.display = "";
  if (actionTitle) actionTitle.textContent = `Aktionen · ${u.username}`;
  clearAdminMsgs();
}

function clearAdminMsgs() {
  ["#admin-pw-msg", "#admin-gift-currency-msg", "#admin-gift-box-msg", "#admin-global-msg"].forEach((id) => {
    const el = $(id);
    if (el) { el.textContent = ""; el.className = "admin-msg"; }
  });
}

function adminMsg(elId, text, ok = false) {
  const el = $(elId);
  if (!el) return;
  el.textContent = text;
  el.className = `admin-msg ${ok ? "ok" : "err"}`;
  setTimeout(() => { if (el.textContent === text) { el.textContent = ""; el.className = "admin-msg"; } }, 3500);
}

function initAdminPanel() {
  // Populate box dropdown from shop data
  const boxSel = $("#admin-gift-box-id");
  if (boxSel && shop?.boxes?.length) {
    boxSel.innerHTML = shop.boxes.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("");
  }

  const btnBan = $("#btn-admin-ban");
  const btnUnban = $("#btn-admin-unban");
  const btnResetPw = $("#btn-admin-reset-pw");
  const btnGiftCurrency = $("#btn-admin-gift-currency");
  const btnGiftBox = $("#btn-admin-gift-box");

  if (btnBan) {
    btnBan.addEventListener("click", async () => {
      if (!adminSelectedUserId) return;
      try {
        await api("/api/admin/ban", { method: "POST", body: JSON.stringify({ user_id: adminSelectedUserId, ban: true }) });
        adminMsg("#admin-global-msg", "Benutzer gesperrt.", true);
        await loadAdminUsers();
      } catch (e) {
        adminMsg("#admin-global-msg", `Fehler: ${e.message}`);
      }
    });
  }

  if (btnUnban) {
    btnUnban.addEventListener("click", async () => {
      if (!adminSelectedUserId) return;
      try {
        await api("/api/admin/ban", { method: "POST", body: JSON.stringify({ user_id: adminSelectedUserId, ban: false }) });
        adminMsg("#admin-global-msg", "Benutzer entsperrt.", true);
        await loadAdminUsers();
      } catch (e) {
        adminMsg("#admin-global-msg", `Fehler: ${e.message}`);
      }
    });
  }

  if (btnResetPw) {
    btnResetPw.addEventListener("click", async () => {
      if (!adminSelectedUserId) return;
      const pw = ($("#admin-new-pw")?.value || "").trim();
      if (pw.length < 6) return adminMsg("#admin-pw-msg", "Mindestens 6 Zeichen.");
      try {
        await api("/api/admin/reset_password", { method: "POST", body: JSON.stringify({ user_id: adminSelectedUserId, new_password: pw }) });
        adminMsg("#admin-pw-msg", "Passwort gesetzt.", true);
        const input = $("#admin-new-pw");
        if (input) input.value = "";
      } catch (e) {
        adminMsg("#admin-pw-msg", `Fehler: ${e.message}`);
      }
    });
  }

  if (btnGiftCurrency) {
    btnGiftCurrency.addEventListener("click", async () => {
      if (!adminSelectedUserId) return;
      const gtype = $("#admin-gift-type")?.value || "coins";
      const amount = parseInt($("#admin-gift-amount")?.value || "0", 10);
      const note = $("#admin-gift-note")?.value || "";
      if (!amount || amount <= 0) return adminMsg("#admin-gift-currency-msg", "Ungültige Menge.");
      try {
        await api("/api/admin/gift", { method: "POST", body: JSON.stringify({ user_id: adminSelectedUserId, type: gtype, amount, note }) });
        adminMsg("#admin-gift-currency-msg", `${amount} ${gtype} gesendet.`, true);
        const amtEl = $("#admin-gift-amount");
        if (amtEl) amtEl.value = "";
      } catch (e) {
        adminMsg("#admin-gift-currency-msg", `Fehler: ${e.message}`);
      }
    });
  }

  if (btnGiftBox) {
    btnGiftBox.addEventListener("click", async () => {
      if (!adminSelectedUserId) return;
      const boxId = $("#admin-gift-box-id")?.value || "bronze_box";
      const note = $("#admin-gift-box-note")?.value || "";
      try {
        await api("/api/admin/gift", { method: "POST", body: JSON.stringify({ user_id: adminSelectedUserId, type: "box", box_id: boxId, note }) });
        adminMsg("#admin-gift-box-msg", `Box gesendet.`, true);
      } catch (e) {
        adminMsg("#admin-gift-box-msg", `Fehler: ${e.message}`);
      }
    });
  }
}

// ===== GESCHENKE TAB =====
function setShopTabExtended(tab) {
  const views = {
    boxes: $("#shop-view-boxes"),
    collection: $("#shop-view-collection"),
    inventory: $("#shop-view-inventory"),
    gifts: $("#shop-view-gifts"),
  };
  Object.entries(views).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle("hidden", k !== tab);
  });
  const tabs = Array.from(document.querySelectorAll("#shop-tabs .tab"));
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.shopTab === tab));
  if (tab === "boxes") {
    const d = $("#shop-drop");
    if (d) d.style.display = "none";
    const g = $("#shop-boxes");
    if (g) g.style.display = "";
  }
}

async function renderShopGifts() {
  const root = $("#shop-gifts-grid");
  if (!root) return;
  root.innerHTML = "";
  if (!me) {
    root.innerHTML = `<div class="row"><div class="left"><div class="name muted">Bitte einloggen.</div></div></div>`;
    return;
  }
  try {
    const data = await api("/api/gifts");
    const gifts = data.gifts || [];
    if (!gifts.length) {
      root.innerHTML = `<div class="row"><div class="left"><div class="name muted">Keine Geschenke vorhanden.</div></div></div>`;
      return;
    }
    gifts.forEach((g) => {
      const el = document.createElement("div");
      el.className = "gift-item";
      let icon = "🎁";
      let titleText = "";
      if (g.type === "coins") { icon = "🪙"; titleText = `${fmt(g.amount)} Coins`; }
      else if (g.type === "gems") { icon = "💎"; titleText = `${fmt(g.amount)} Gems`; }
      else if (g.type === "box") {
        icon = "📦";
        const boxNames = { bronze_box: "Bronze Box", silber_box: "Silber Box", gold_box: "Gold Box" };
        titleText = boxNames[g.box_id] || g.box_id;
      }
      el.innerHTML = `
        <div class="gift-icon">${icon}</div>
        <div class="gift-info">
          <div class="gift-title">${escapeHtml(titleText)}</div>
          ${g.note ? `<div class="gift-note">${escapeHtml(g.note)}</div>` : ""}
          <div class="gift-from">Von: ${escapeHtml(g.from_username)}</div>
          <button class="btn" style="margin-top:8px" data-gift-id="${g.id}">Abholen</button>
        </div>
      `;
      const btn = el.querySelector("button");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "...";
        try {
          const result = await api("/api/claim_gift", { method: "POST", body: JSON.stringify({ gift_id: g.id }) });
          await refreshMe();
          await refreshInventory();
          if (result.gift_type === "box" && result.drop_result) {
            const dr = result.drop_result;
            const boxObj = shop?.boxes?.find((b) => b.id === dr.box_id) || { id: dr.box_id, name: dr.box_id };
            await animateBoxOpen({ drop_kind: dr.drop_kind, drop: dr.drop, rarity: dr.rarity }, boxObj);
          } else {
            el.innerHTML = `<div class="gift-icon">${icon}</div><div class="gift-info"><div class="gift-title">Abgeholt!</div></div>`;
          }
          await renderShopGifts();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "Abholen";
          alert(`Fehler: ${e.message}`);
        }
      });
      root.appendChild(el);
    });
  } catch (e) {
    root.innerHTML = `<div class="row"><div class="left"><div class="name muted">Fehler: ${escapeHtml(e.message)}</div></div></div>`;
  }
}
