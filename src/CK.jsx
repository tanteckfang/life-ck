import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * CK.jsx — Idol Life-Sim MVP (React)
 *
 * ✅ FIX: Idol on 主界面 no longer “disappears”
 * - We DO NOT unmount/remount the Home page anymore.
 * - Home page stays mounted and we toggle visibility with CSS.
 * - Canvas uses a stable RAF loop + safe resize handling.
 * - Removed random sparkles to avoid flicker.
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const now = () => Date.now();
const STORAGE_KEY = "idol_life_sim_save_v1";

const INTIMACY_TIERS = [
  { name: "初见", min: 0, max: 300 },
  { name: "熟悉", min: 301, max: 600 },
  { name: "亲密", min: 601, max: 999 },
];

const FOOD_DEFS = {
  cake: { name: "蛋糕", stamina: +30, mood: +5, intimacy: +3, price: 40 },
  milkTea: { name: "奶茶", stamina: +20, mood: +8, intimacy: +2, price: 35 },
  fruit: { name: "水果", stamina: +15, mood: +3, intimacy: +1, price: 20 },
};

const INTERACTIONS = [
  { id: "pat", name: "摸头", mood: +8, intimacy: +5 },
  { id: "chat", name: "聊天", mood: +6, intimacy: +6 },
  { id: "cheer", name: "打气", mood: +10, intimacy: +4 },
];

const OUTFIT_PARTS = [
  { key: "hair", name: "发型" },
  { key: "top", name: "上衣" },
  { key: "bottom", name: "下装" },
  { key: "shoes", name: "鞋子" },
  { key: "accessory", name: "饰品" },
  { key: "stageSet", name: "舞台套装" },
];

const OUTFIT_CATALOG = {
  hair: [
    { id: "hair_01", name: "清爽短发", beauty: 35, priceCoins: 50 },
    { id: "hair_02", name: "双马尾", beauty: 55, priceCoins: 90 },
    { id: "hair_03", name: "舞台卷发", beauty: 80, priceCoins: 160 },
  ],
  top: [
    { id: "top_01", name: "白T", beauty: 30, priceCoins: 40 },
    { id: "top_02", name: "黄色外套", beauty: 70, priceCoins: 150 },
    { id: "top_03", name: "舞台亮片上衣", beauty: 90, priceCoins: 220 },
  ],
  bottom: [
    { id: "bottom_01", name: "牛仔裤", beauty: 35, priceCoins: 60 },
    { id: "bottom_02", name: "短裙", beauty: 55, priceCoins: 110 },
    { id: "bottom_03", name: "舞台短裤", beauty: 75, priceCoins: 170 },
  ],
  shoes: [
    { id: "shoes_01", name: "运动鞋", beauty: 25, priceCoins: 35 },
    { id: "shoes_02", name: "小皮鞋", beauty: 45, priceCoins: 80 },
    { id: "shoes_03", name: "舞台靴", beauty: 70, priceCoins: 160 },
  ],
  accessory: [
    { id: "acc_00", name: "无", beauty: 0, priceCoins: 0 },
    { id: "acc_01", name: "发夹", beauty: 18, priceCoins: 35 },
    { id: "acc_02", name: "耳饰", beauty: 30, priceCoins: 60 },
  ],
  stageSet: [
    { id: "stage_00", name: "日常套装", beauty: 0, priceCoins: 0 },
    { id: "stageSet_001", name: "限定舞台套装 001", beauty: 120, priceDiamonds: 120 },
  ],
};

const POLAROID_POSES = [
  { id: "heart", name: "比心" },
  { id: "close", name: "靠近" },
  { id: "backstage", name: "后台贴贴" },
];

const POLAROID_FILTERS = [
  { id: "retro", name: "复古" },
  { id: "film", name: "胶片" },
  { id: "sparkle", name: "星光" },
];

function tierName(intimacy) {
  const v = clamp(intimacy, 0, 999);
  const t = INTIMACY_TIERS.find((x) => v >= x.min && v <= x.max);
  return t ? t.name : "初见";
}

function formatTS(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function computeBeauty(outfit) {
  let sum = 0;
  for (const part of Object.keys(outfit)) {
    const id = outfit[part];
    const item = (OUTFIT_CATALOG[part] || []).find((x) => x.id === id);
    sum += item?.beauty || 0;
  }
  return clamp(sum, 0, 300);
}

function gradeFromScore(score) {
  if (score >= 520) return "S";
  if (score >= 420) return "A";
  if (score >= 320) return "B";
  return "C";
}

function rewardForGrade(grade) {
  if (grade === "S") {
    return { coins: 220, diamonds: 50, foods: { cake: 1 }, fragments: { limitedOutfit: 1 }, fragmentsAcc: 0 };
  }
  if (grade === "A") {
    return { coins: 170, diamonds: 20, foods: {}, fragments: { acc: 1 }, fragmentsAcc: 1 };
  }
  if (grade === "B") {
    return { coins: 120, diamonds: 0, foods: { fruit: 1 }, fragments: {}, fragmentsAcc: 0 };
  }
  return { coins: 60, diamonds: 0, foods: {}, fragments: {}, fragmentsAcc: 0 };
}

function makeDefaultSave() {
  return {
    version: 1,
    stats: { intimacy: 10, stamina: 80, mood: 60 },
    wallet: { coins: 200, diamonds: 0 },
    inventory: {
      foods: { cake: 2, milkTea: 1, fruit: 3 },
      fragments: { acc: 0, limitedOutfit: 0 },
      polaroids: [],
      titles: [],
      ownedOutfits: {
        hair: ["hair_01"],
        top: ["top_01"],
        bottom: ["bottom_01"],
        shoes: ["shoes_01"],
        accessory: ["acc_00"],
        stageSet: ["stage_00"],
      },
    },
    outfit: {
      hair: "hair_01",
      top: "top_01",
      bottom: "bottom_01",
      shoes: "shoes_01",
      accessory: "acc_00",
      stageSet: "stage_00",
    },
    meta: {
      lastRegenAt: now(),
      dailyKey: "",
      dailyClaimed: false,
      onlineMinutesToday: 0,
      onlineLastTick: now(),
      companionGainedToday: 0,
    },
  };
}

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeSave(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function deepClone(obj) {
  return typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

function useInterval(callback, delay) {
  const savedRef = useRef(callback);
  useEffect(() => {
    savedRef.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawIdol(ctx, w, h, mood, outfitBeauty) {
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.42;
  const headR = Math.min(w, h) * 0.16;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#f6f6f6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.06)";
  roundRectPath(ctx, cx - headR * 0.75, cy + headR * 0.95, headR * 1.5, headR * 1.7, 20);
  ctx.fill();

  const expression = mood >= 75 ? "happy" : mood <= 25 ? "tired" : "neutral";

  ctx.fillStyle = "#c59a2f";
  ctx.beginPath();
  ctx.arc(cx, cy - headR * 0.15, headR * 1.12, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f7d7c4";
  ctx.beginPath();
  ctx.arc(cx, cy, headR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111827";
  const eyeY = cy - headR * 0.15;
  const eyeX = headR * 0.42;
  const eyeR = headR * 0.12;
  const eyeOpen = expression === "tired" ? 0.45 : 1.0;

  ctx.save();
  ctx.translate(0, eyeY);
  ctx.scale(1, eyeOpen);
  ctx.beginPath();
  ctx.arc(cx - eyeX, 0, eyeR, 0, Math.PI * 2);
  ctx.arc(cx + eyeX, 0, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (mood >= 70) {
    ctx.fillStyle = "rgba(244,114,182,0.25)";
    ctx.beginPath();
    ctx.arc(cx - headR * 0.55, cy + headR * 0.2, headR * 0.22, 0, Math.PI * 2);
    ctx.arc(cx + headR * 0.55, cy + headR * 0.2, headR * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#7c2d12";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  if (expression === "happy") {
    ctx.beginPath();
    ctx.arc(cx, cy + headR * 0.28, headR * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.2, cy + headR * 0.34);
    ctx.lineTo(cx + headR * 0.2, cy + headR * 0.34);
    ctx.stroke();
  }

  const brightness = clamp(0.75 + outfitBeauty / 400, 0.75, 1.15);
  ctx.fillStyle = `rgba(17,24,39,${0.92 * brightness})`;
  roundRectPath(ctx, cx - headR * 0.75, cy + headR * 0.95, headR * 1.5, headR * 1.7, 20);
  ctx.fill();
}

function IdolCanvas({ active, moodRef, beautyRef }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;

    let rafId = 0;
    let alive = true;

    const tick = () => {
      if (!alive) return;

      // If hidden, pause drawing but keep mounted (no unmount)
      if (!active) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // If layout temporarily 0, do NOT resize/clear—retry next frame
      if (rect.width < 2 || rect.height < 2) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));

      // Resize only when necessary (resize clears canvas)
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;

      const ctx = c.getContext("2d");
      if (ctx) {
        drawIdol(ctx, w, h, moodRef.current, beautyRef.current);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, [active, moodRef, beautyRef]);

  return (
    <div className="idolWrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="idolCanvas" />
    </div>
  );
}

export default function CK() {
  const [screen, setScreen] = useState("home"); // home | dress | bag | tour | stage | polaroid
  const [toast, setToast] = useState(null);
  const [save, setSave] = useState(() => safeLoad() || makeDefaultSave());

  const stats = save.stats;
  const wallet = save.wallet;
  const inventory = save.inventory;
  const outfit = save.outfit;
  const meta = save.meta;

  const beauty = useMemo(() => computeBeauty(outfit), [outfit]);
  const tier = useMemo(() => tierName(stats.intimacy), [stats.intimacy]);

  const statsRef = useRef(stats);
  const beautyRef = useRef(beauty);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);
  useEffect(() => {
    beautyRef.current = beauty;
  }, [beauty]);

  const [log, setLog] = useState(() => [
    { ts: now(), msg: "欢迎！喂食/互动/换装提升亲密与心情，然后去巡回舞台演出拿奖励～" },
  ]);

  const [stages, setStages] = useState(() => [
    { id: "stage_001", name: "初始舞台 A", bgName: "练习室", costStamina: 20, outfitUnlock: "stageSet_001" },
    { id: "stage_002", name: "初始舞台 B", bgName: "小剧场", costStamina: 25, outfitUnlock: null },
  ]);

  const [selectedStageId, setSelectedStageId] = useState(null);
  const [stageResult, setStageResult] = useState(null);
  const [isPerforming, setIsPerforming] = useState(false);

  const [polaroidOpen, setPolaroidOpen] = useState(false);
  const [polaroidPose, setPolaroidPose] = useState("heart");
  const [polaroidFilter, setPolaroidFilter] = useState("retro");
  const [developing, setDeveloping] = useState(false);

  useEffect(() => {
    safeSave(save);
  }, [save]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  function pushLog(msg) {
    setLog((prev) => [{ ts: now(), msg }, ...prev].slice(0, 80));
  }

  useEffect(() => {
    let alive = true;
    fetch("/config/stages.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data) => {
        if (!alive) return;
        if (data?.stages && Array.isArray(data.stages) && data.stages.length) {
          setStages(data.stages);
          pushLog("已同步最新巡回舞台配置（/config/stages.json）");
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const k = todayKey();
    setSave((prev) => {
      const next = deepClone(prev);
      if (next.meta.dailyKey !== k) {
        next.meta.dailyKey = k;
        next.meta.dailyClaimed = false;
        next.meta.onlineMinutesToday = 0;
        next.meta.companionGainedToday = 0;
      }
      if (!next.meta.dailyClaimed) {
        next.stats.intimacy = clamp(next.stats.intimacy + 10, 0, 999);
        next.meta.dailyClaimed = true;
        setLog((l) => [{ ts: now(), msg: "每日登录奖励：亲密度 +10" }, ...l].slice(0, 80));
      }
      next.meta.onlineLastTick = now();
      return next;
    });
  }, []);

  useInterval(() => {
    setSave((prev) => {
      const next = deepClone(prev);
      const t = now();
      const last = next.meta.lastRegenAt || t;
      const stepMs = 30 * 60 * 1000;
      const diffMs = t - last;
      if (diffMs < stepMs) return next;

      const steps = Math.floor(diffMs / stepMs);
      const add = steps * 5;
      next.stats.stamina = clamp(next.stats.stamina + add, 0, 100);
      next.meta.lastRegenAt = last + steps * stepMs;
      return next;
    });
  }, 15 * 1000);

  useInterval(() => {
    setSave((prev) => {
      const next = deepClone(prev);
      const t = now();
      const last = next.meta.onlineLastTick || t;
      const diffMin = Math.floor((t - last) / (60 * 1000));
      if (diffMin <= 0) return next;

      next.meta.onlineLastTick = last + diffMin * 60 * 1000;
      next.meta.onlineMinutesToday = (next.meta.onlineMinutesToday || 0) + diffMin;

      const gainedSoFar = next.meta.companionGainedToday || 0;
      const possibleTicks = Math.floor(next.meta.onlineMinutesToday / 5);
      const shouldHave = Math.min(possibleTicks, 20);
      const delta = shouldHave - gainedSoFar;

      if (delta > 0) {
        next.stats.intimacy = clamp(next.stats.intimacy + delta, 0, 999);
        next.meta.companionGainedToday = gainedSoFar + delta;
      }
      return next;
    });
  }, 30 * 1000);

  function applyDelta({ stamina = 0, mood = 0, intimacy = 0, coins = 0, diamonds = 0 }) {
    setSave((prev) => {
      const next = deepClone(prev);
      next.stats.stamina = clamp(next.stats.stamina + stamina, 0, 100);
      next.stats.mood = clamp(next.stats.mood + mood, 0, 100);
      next.stats.intimacy = clamp(next.stats.intimacy + intimacy, 0, 999);
      next.wallet.coins = Math.max(0, (next.wallet.coins || 0) + coins);
      next.wallet.diamonds = Math.max(0, (next.wallet.diamonds || 0) + diamonds);
      return next;
    });
  }

  function feed(foodKey) {
    const def = FOOD_DEFS[foodKey];
    if (!def) return;

    const count = inventory.foods?.[foodKey] || 0;
    if (count <= 0) {
      setToast("背包里没有这个食物");
      return;
    }

    setSave((prev) => {
      const next = deepClone(prev);
      next.inventory.foods[foodKey] = Math.max(0, (next.inventory.foods[foodKey] || 0) - 1);
      next.stats.stamina = clamp(next.stats.stamina + def.stamina, 0, 100);
      next.stats.mood = clamp(next.stats.mood + def.mood, 0, 100);
      next.stats.intimacy = clamp(next.stats.intimacy + def.intimacy, 0, 999);
      return next;
    });

    pushLog(`喂食：${def.name}（体力 +${def.stamina}，心情 +${def.mood}，亲密 +${def.intimacy}）`);
    setToast(`${def.name} ✓`);
  }

  function doInteract(actionId) {
    const def = INTERACTIONS.find((x) => x.id === actionId);
    if (!def) return;
    applyDelta({ mood: def.mood, intimacy: def.intimacy });
    pushLog(`互动：${def.name}（心情 +${def.mood}，亲密 +${def.intimacy}）`);
    setToast(`${def.name} ✓`);
  }

  function wear(partKey, itemId) {
    const owned = inventory.ownedOutfits?.[partKey] || [];
    if (!owned.includes(itemId)) {
      setToast("未拥有该服装");
      return;
    }

    setSave((prev) => {
      const next = deepClone(prev);
      next.outfit[partKey] = itemId;
      next.stats.mood = clamp(next.stats.mood + 15, 0, 100);
      next.stats.intimacy = clamp(next.stats.intimacy + 2, 0, 999);
      return next;
    });

    pushLog("换装完成（心情 +15，亲密 +2）");
    setToast("换装 ✓");
  }

  function buyOutfit(partKey, item) {
    const owned = inventory.ownedOutfits?.[partKey] || [];
    if (owned.includes(item.id)) {
      setToast("已拥有");
      return;
    }

    if (item.priceCoins != null) {
      if (wallet.coins < item.priceCoins) {
        setToast("金币不足");
        return;
      }
      setSave((prev) => {
        const next = deepClone(prev);
        next.wallet.coins -= item.priceCoins;
        next.inventory.ownedOutfits[partKey].push(item.id);
        return next;
      });
      pushLog(`购买服装：${item.name}（-${item.priceCoins} 金币）`);
      setToast("购买成功 ✓");
      return;
    }

    if (item.priceDiamonds != null) {
      if (wallet.diamonds < item.priceDiamonds) {
        setToast("钻石不足");
        return;
      }
      setSave((prev) => {
        const next = deepClone(prev);
        next.wallet.diamonds -= item.priceDiamonds;
        next.inventory.ownedOutfits[partKey].push(item.id);
        return next;
      });
      pushLog(`购买服装：${item.name}（-${item.priceDiamonds} 钻石）`);
      setToast("购买成功 ✓");
      return;
    }

    setToast("无法购买该物品");
  }

  function buyFood(foodKey) {
    const def = FOOD_DEFS[foodKey];
    if (!def) return;
    if (wallet.coins < def.price) {
      setToast("金币不足");
      return;
    }
    setSave((prev) => {
      const next = deepClone(prev);
      next.wallet.coins -= def.price;
      next.inventory.foods[foodKey] = (next.inventory.foods[foodKey] || 0) + 1;
      return next;
    });
    pushLog(`购买食物：${def.name}（-${def.price} 金币）`);
    setToast("购买成功 ✓");
  }

  function startStage(stageId) {
    const st = stages.find((s) => s.id === stageId);
    if (!st) return;

    const cost = st.costStamina ?? 20;
    if (stats.stamina < cost) {
      setToast("体力不足，先喂食恢复");
      return;
    }

    setSelectedStageId(stageId);
    setStageResult(null);
    setIsPerforming(true);
    setScreen("stage");

    setSave((prev) => {
      const next = deepClone(prev);
      next.stats.stamina = clamp(next.stats.stamina - cost, 0, 100);
      return next;
    });

    pushLog(`开始演出：${st.name}（消耗体力 ${cost}）`);

    setTimeout(() => {
      runStage(stageId);
    }, 900);
  }

  function runStage(stageId) {
    const st = stages.find((s) => s.id === stageId);
    if (!st) return;

    const baseFromOutfit = beauty;
    const intimacyBonus = Math.floor(stats.intimacy / 5);
    const moodBonus = Math.floor(stats.mood * 1.5);
    const rand = Math.round((Math.random() * 30 - 15) * (stats.mood / 100));
    const score = clamp(baseFromOutfit + intimacyBonus + moodBonus + rand, 0, 999);

    const grade = gradeFromScore(score);
    const reward = rewardForGrade(grade);

    const moodDelta = grade === "S" ? +6 : grade === "A" ? +3 : grade === "B" ? -2 : -6;
    const intimacyDelta = grade === "S" ? +8 : grade === "A" ? +5 : grade === "B" ? +3 : +1;

    setSave((prev) => {
      const next = deepClone(prev);

      next.wallet.coins += reward.coins;
      next.wallet.diamonds += reward.diamonds;

      for (const k of Object.keys(reward.foods || {})) {
        next.inventory.foods[k] = (next.inventory.foods[k] || 0) + reward.foods[k];
      }

      if (reward.fragments?.acc) next.inventory.fragments.acc = (next.inventory.fragments.acc || 0) + reward.fragments.acc;
      if (reward.fragments?.limitedOutfit)
        next.inventory.fragments.limitedOutfit = (next.inventory.fragments.limitedOutfit || 0) + reward.fragments.limitedOutfit;

      next.stats.mood = clamp(next.stats.mood + moodDelta, 0, 100);
      next.stats.intimacy = clamp(next.stats.intimacy + intimacyDelta, 0, 999);

      if (st.outfitUnlock && (grade === "S" || grade === "A")) {
        const partKey = "stageSet";
        const owned = next.inventory.ownedOutfits[partKey] || [];
        if (!owned.includes(st.outfitUnlock)) owned.push(st.outfitUnlock);
      }

      return next;
    });

    setStageResult({ score, grade, reward, stage: st });
    setIsPerforming(false);

    pushLog(`演出结算：${grade}（得分 ${score}）金币 +${reward.coins}${reward.diamonds ? `，钻石 +${reward.diamonds}` : ""}`);

    if (grade === "S") {
      setToast("S 级！解锁拍立得合影 ✨");
      setPolaroidOpen(true);
      setPolaroidPose("heart");
      setPolaroidFilter("retro");
    } else {
      setToast(`演出 ${grade} 级 ✓`);
    }
  }

  function finishPolaroidCapture() {
    if (!stageResult?.stage) return;

    const quotes = [
      "谢谢你一直陪着我，我们一起更闪耀！",
      "今天也辛苦啦～给你一个小心心！",
      "下次舞台也要一起加油哦！",
      "嘿嘿，被你看到我的最好状态了～",
    ];
    const quote = quotes[Math.floor(Math.random() * quotes.length)];

    const record = {
      id: (crypto?.randomUUID?.() || String(now()) + "_" + Math.random().toString(16).slice(2)),
      stageId: stageResult.stage.id,
      stageName: stageResult.stage.name,
      pose: polaroidPose,
      filter: polaroidFilter,
      quote,
      ts: now(),
    };

    setDeveloping(true);
    setTimeout(() => {
      setSave((prev) => {
        const next = deepClone(prev);
        next.inventory.polaroids.unshift(record);

        const count = next.inventory.polaroids.length;
        const milestones = [5, 10, 20];
        for (const m of milestones) {
          const title = `拍立得收藏 ${m} 张`;
          if (count >= m && !next.inventory.titles.includes(title)) {
            next.inventory.titles.push(title);
            next.wallet.coins += 80;
          }
        }

        return next;
      });

      setDeveloping(false);
      setPolaroidOpen(false);
      setToast("拍立得已保存 ✓");
      pushLog(`拍立得合影完成：${record.stageName}（${record.pose}/${record.filter}）`);
      setScreen("polaroid");
    }, 900);
  }

  const headerRight = (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <span className="pill">💛 亲密 {stats.intimacy}/999（{tier}）</span>
      <span className="pill">⚡ 体力 {Math.round(stats.stamina)}/100</span>
      <span className="pill">😊 心情 {Math.round(stats.mood)}/100</span>
      <span className="pill">🪙 {wallet.coins}</span>
      <span className="pill">💎 {wallet.diamonds}</span>
    </div>
  );

  const currentStage = useMemo(() => stages.find((s) => s.id === selectedStageId) || null, [selectedStageId, stages]);

  function NavButton({ id, label }) {
    const active = screen === id;
    return (
      <button className={active ? "tab active" : "tab"} onClick={() => setScreen(id)}>
        {label}
      </button>
    );
  }

  function PageHeader({ title, subtitle }) {
    return (
      <div className="header">
        <div>
          <div className="hTitle">{title}</div>
          {subtitle && <div className="small">{subtitle}</div>}
        </div>
        {headerRight}
      </div>
    );
  }

  function OwnedBadge(partKey, itemId) {
    const owned = inventory.ownedOutfits?.[partKey] || [];
    const isOwned = owned.includes(itemId);
    return isOwned ? <span className="tag ok">已拥有</span> : <span className="tag">未拥有</span>;
  }

  function HomePage({ visible }) {
    return (
      <div className={"page " + (visible ? "pageShow" : "pageHide")}>
        <div className="panelBody">
          <div className="grid2col">
            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">主界面</div>
                  <div className="small">喂食 / 互动 / 换装 → 提升亲密与心情 → 去舞台演出</div>
                </div>
                <div className="pill">颜值评分：{beauty}</div>
              </div>

              <IdolCanvas active={visible} moodRef={statsRef} beautyRef={beautyRef} />

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setScreen("dress")}>去换装</button>
                <button className="btn" onClick={() => setScreen("tour")}>去巡回舞台</button>
                <button className="btn2" onClick={() => setScreen("polaroid")}>拍立得相册</button>
              </div>

              <div className="divider" />

              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <span className="pill">陪伴：今日在线 {meta.onlineMinutesToday || 0} 分钟（今日亲密 +{meta.companionGainedToday || 0}/20）</span>
                <span className="pill">每日登录：已领取</span>
              </div>
            </div>

            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">养成行为</div>
                  <div className="small">先做 MVP：按钮直接生效（后续可换成场景/动作动画）</div>
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">喂食（恢复体力 + 少量亲密）</div>
                <div className="grid3">
                  {Object.keys(FOOD_DEFS).map((k) => (
                    <button key={k} className="optBtn" onClick={() => feed(k)}>
                      <div className="optMain">{FOOD_DEFS[k].name}</div>
                      <div className="small">
                        体力+{FOOD_DEFS[k].stamina} 心情+{FOOD_DEFS[k].mood} 亲密+{FOOD_DEFS[k].intimacy}
                      </div>
                      <div className="small">背包：{inventory.foods?.[k] || 0}</div>
                    </button>
                  ))}
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <span className="small">没食物？去背包购买（金币）</span>
                  <button className="btn2" onClick={() => setScreen("bag")}>去背包</button>
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">互动（提升亲密 + 心情）</div>
                <div className="grid3">
                  {INTERACTIONS.map((a) => (
                    <button key={a.id} className="optBtn" onClick={() => doInteract(a.id)}>
                      <div className="optMain">{a.name}</div>
                      <div className="small">心情+{a.mood} 亲密+{a.intimacy}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">当前穿搭（分层）</div>
                <div className="small">发型：{outfit.hair} ｜ 上衣：{outfit.top} ｜ 下装：{outfit.bottom}</div>
                <div className="small">鞋子：{outfit.shoes} ｜ 饰品：{outfit.accessory} ｜ 舞台套装：{outfit.stageSet}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="cardHead">
              <div>
                <div className="cardTitle">事件记录</div>
                <div className="small">最近 80 条</div>
              </div>
            </div>
            <div className="logList">
              {log.map((it, idx) => (
                <div key={idx} className="logItem">
                  <div className="small">{formatTS(it.ts)}</div>
                  <div>{it.msg}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function DressPage({ visible }) {
    return (
      <div className={"page " + (visible ? "pageShow" : "pageHide")}>
        <div className="panelBody">
          <div className="grid2col">
            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">换装界面</div>
                  <div className="small">换装：心情 +15，亲密 +2（每次穿戴生效）</div>
                </div>
                <div className="pill">颜值评分：{beauty}</div>
              </div>

              {OUTFIT_PARTS.map((part) => (
                <div key={part.key} className="box">
                  <div className="boxTitle">{part.name}</div>
                  <div className="small">当前：{outfit[part.key]}</div>
                  <div className="grid2">
                    {(OUTFIT_CATALOG[part.key] || []).map((item) => {
                      const owned = inventory.ownedOutfits?.[part.key] || [];
                      const isOwned = owned.includes(item.id);
                      const isWorn = outfit[part.key] === item.id;
                      return (
                        <div key={item.id} className="shopItem">
                          <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                            <div>
                              <div className="optMain">{item.name}</div>
                              <div className="small">颜值 +{item.beauty}</div>
                            </div>
                            <div className="row" style={{ gap: 8 }}>
                              {isWorn && <span className="tag ok">已穿戴</span>}
                              <OwnedBadge partKey={part.key} itemId={item.id} />
                            </div>
                          </div>

                          <div className="row" style={{ justifyContent: "space-between", marginTop: 8, gap: 10 }}>
                            <div className="small">
                              {item.priceCoins != null && <>价格：{item.priceCoins} 金币</>}
                              {item.priceDiamonds != null && <>价格：{item.priceDiamonds} 钻石</>}
                              {item.priceCoins == null && item.priceDiamonds == null && <>不可购买</>}
                            </div>

                            <div className="row" style={{ gap: 8 }}>
                              <button className="btn2" disabled={!isOwned || isWorn} onClick={() => wear(part.key, item.id)}>
                                穿戴
                              </button>
                              <button
                                className="btn"
                                disabled={isOwned || (item.priceCoins == null && item.priceDiamonds == null)}
                                onClick={() => buyOutfit(part.key, item)}
                              >
                                购买
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">说明</div>
                  <div className="small">当前是图片占位版本，后续可把“分层图片叠加”接上</div>
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">快捷入口</div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="btn2" onClick={() => setScreen("home")}>回主界面</button>
                  <button className="btn" onClick={() => setScreen("tour")}>去巡回舞台</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function BagPage({ visible }) {
    return (
      <div className={"page " + (visible ? "pageShow" : "pageHide")}>
        <div className="panelBody">
          <div className="grid2col">
            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">背包</div>
                  <div className="small">食物 / 碎片 / 称号</div>
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">食物</div>
                <div className="grid3">
                  {Object.keys(FOOD_DEFS).map((k) => (
                    <div key={k} className="shopItem">
                      <div className="optMain">{FOOD_DEFS[k].name}</div>
                      <div className="small">数量：{inventory.foods?.[k] || 0}</div>
                      <div className="small">
                        体力+{FOOD_DEFS[k].stamina} 心情+{FOOD_DEFS[k].mood} 亲密+{FOOD_DEFS[k].intimacy}
                      </div>
                      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                        <button className="btn2" onClick={() => feed(k)}>使用</button>
                        <button className="btn" onClick={() => buyFood(k)}>购买（{FOOD_DEFS[k].price}金币）</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">碎片</div>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="pill">普通饰品碎片：{inventory.fragments?.acc || 0}</span>
                  <span className="pill">限定服装碎片：{inventory.fragments?.limitedOutfit || 0}</span>
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">称号</div>
                {inventory.titles.length ? (
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {inventory.titles.map((t) => (
                      <span key={t} className="tag ok">{t}</span>
                    ))}
                  </div>
                ) : (
                  <div className="small">暂无称号（收集拍立得可解锁）</div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">快速操作</div>
                  <div className="small">金币买普通服装/食物；钻石买限定套装（后续）</div>
                </div>
              </div>

              <div className="box">
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="btn2" onClick={() => setScreen("dress")}>去换装</button>
                  <button className="btn" onClick={() => setScreen("tour")}>去巡回舞台</button>
                  <button className="btn2" onClick={() => setScreen("home")}>回主界面</button>
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">开发提示</div>
                <div className="small">更新 /public/config/stages.json 后刷新即可同步舞台列表。</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function TourPage({ visible }) {
    return (
      <div className={"page " + (visible ? "pageShow" : "pageHide")}>
        <div className="panelBody">
          <div className="grid2col">
            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">巡回舞台</div>
                  <div className="small">选择舞台 → 消耗体力 → 评分 S/A/B/C → 奖励结算</div>
                </div>
              </div>

              <div className="grid2">
                {stages.map((st) => {
                  const cost = st.costStamina ?? 20;
                  const can = stats.stamina >= cost;
                  return (
                    <div key={st.id} className="shopItem">
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div>
                          <div className="optMain">{st.name}</div>
                          <div className="small">背景：{st.bgName || "舞台"}</div>
                          <div className="small">消耗体力：{cost}</div>
                        </div>
                        <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                          {st.outfitUnlock ? <span className="tag">解锁：{st.outfitUnlock}</span> : <span className="tag">无解锁</span>}
                        </div>
                      </div>

                      <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
                        <div className="small">颜值：{beauty}｜亲密：{stats.intimacy}｜心情：{Math.round(stats.mood)}</div>
                        <button className="btn" disabled={!can} onClick={() => startStage(st.id)}>
                          {can ? "开始演出" : "体力不足"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="small" style={{ marginTop: 10 }}>评分公式：基础分(服装颜值) + 亲密加成 + 心情加成 + 小随机</div>
            </div>

            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">奖励规则（MVP）</div>
                  <div className="small">可继续精调数值</div>
                </div>
              </div>

              <div className="box">
                <div className="small">C：少量金币</div>
                <div className="small">B：中量金币 + 普通食物</div>
                <div className="small">A：大量金币 + 20钻石 + 随机饰品碎片</div>
                <div className="small">S：50钻石 + 限定服装碎片 + 解锁拍立得合影</div>
              </div>

              <div className="box">
                <div className="boxTitle">快捷入口</div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="btn2" onClick={() => setScreen("home")}>回主界面</button>
                  <button className="btn2" onClick={() => setScreen("bag")}>去背包</button>
                  <button className="btn" onClick={() => setScreen("dress")}>去换装</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function StagePage({ visible }) {
    const st = currentStage;
    return (
      <div className={"page " + (visible ? "pageShow" : "pageHide")}>
        <div className="panelBody">
          <div className="card">
            <div className="cardHead">
              <div>
                <div className="cardTitle">演出界面</div>
                <div className="small">{st ? `当前舞台：${st.name}` : "未选择舞台"}</div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn2" onClick={() => setScreen("tour")}>返回巡回舞台</button>
                <button className="btn2" onClick={() => setScreen("home")}>回主界面</button>
              </div>
            </div>

            <div className="stageBox">
              <div className="stageScene">
                <div className="stageBg">
                  <div className="stageName">{st?.bgName || "舞台"}</div>
                  <div className="small">（这里可放舞台背景图 + BGM）</div>
                </div>

                <div className={isPerforming ? "performAvatar performing" : "performAvatar"}>
                  <div className="avatarFace" />
                  <div className="avatarBody" />
                </div>
              </div>

              <div className="box" style={{ marginTop: 12 }}>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="pill">服装颜值：{beauty}</span>
                  <span className="pill">亲密：{stats.intimacy}</span>
                  <span className="pill">心情：{Math.round(stats.mood)}</span>
                </div>

                {isPerforming && <div className="bigHint">演出进行中…</div>}

                {!isPerforming && stageResult && (
                  <div className="resultBox">
                    <div className="resultGrade">评分：{stageResult.grade}</div>
                    <div className="small">得分：{stageResult.score}</div>

                    <div className="divider" />

                    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                      <span className="pill">金币 +{stageResult.reward.coins}</span>
                      {stageResult.reward.diamonds ? <span className="pill">钻石 +{stageResult.reward.diamonds}</span> : null}
                      {stageResult.reward.foods?.cake ? <span className="pill">蛋糕 +{stageResult.reward.foods.cake}</span> : null}
                      {stageResult.reward.foods?.fruit ? <span className="pill">水果 +{stageResult.reward.foods.fruit}</span> : null}
                      {stageResult.reward.fragments?.acc ? <span className="pill">饰品碎片 +{stageResult.reward.fragments.acc}</span> : null}
                      {stageResult.reward.fragments?.limitedOutfit ? <span className="pill">限定碎片 +{stageResult.reward.fragments.limitedOutfit}</span> : null}
                    </div>

                    <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button className="btn2" onClick={() => setScreen("tour")}>继续选舞台</button>
                      <button className="btn" onClick={() => setScreen("dress")}>去换装提升</button>
                      <button className="btn2" onClick={() => setScreen("bag")}>去背包喂食</button>
                    </div>
                  </div>
                )}

                {!isPerforming && !stageResult && (
                  <div className="small" style={{ marginTop: 10 }}>未产生结果：请从「巡回舞台」开始演出</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function PolaroidPage({ visible }) {
    return (
      <div className={"page " + (visible ? "pageShow" : "pageHide")}>
        <div className="panelBody">
          <div className="grid2col">
            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">拍立得相册</div>
                  <div className="small">S 级演出解锁合影，收藏可解锁称号</div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn2" onClick={() => setScreen("tour")}>去巡回舞台</button>
                  <button className="btn2" onClick={() => setScreen("home")}>回主界面</button>
                </div>
              </div>

              {inventory.polaroids.length ? (
                <div className="grid2">
                  {inventory.polaroids.map((p) => (
                    <div key={p.id} className="polaroidCard">
                      <div className="polaroidFrame">
                        <div className="polaroidImg">
                          <div className="small">Pose: {p.pose}</div>
                          <div className="small">Filter: {p.filter}</div>
                        </div>
                        <div className="polaroidFooter">
                          <div className="optMain">{p.stageName}</div>
                          <div className="small">{formatTS(p.ts)}</div>
                        </div>
                      </div>
                      <div className="small" style={{ marginTop: 8 }}>“{p.quote}”</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="box">
                  <div className="small">暂无拍立得。去舞台拿 S 级解锁合影吧～</div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="cardHead">
                <div>
                  <div className="cardTitle">收藏奖励</div>
                  <div className="small">集齐 5 / 10 / 20 张解锁称号，并获得少量金币奖励</div>
                </div>
              </div>

              <div className="box">
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="pill">已收藏：{inventory.polaroids.length} 张</span>
                  {inventory.titles.length
                    ? inventory.titles.map((t) => <span key={t} className="tag ok">{t}</span>)
                    : <span className="tag">暂无称号</span>}
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">提示</div>
                <div className="small">后续可加入：分享按钮、滤镜效果图、专属舞台边框等。</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <style>{`
        :root { color-scheme: light; }
        .app{
          min-height:100vh;
          background:#f6f6f6;
          color:#111827;
          font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        }
        .shell{ max-width:1200px; margin:0 auto; padding:16px; }
        .topbar{
          display:flex; gap:10px; align-items:center; justify-content:space-between;
          flex-wrap:wrap; margin-bottom:12px;
        }
        .brand{ display:flex; align-items:center; gap:10px; font-weight:900; }
        .nav{ display:flex; gap:8px; flex-wrap:wrap; }
        .tab{
          border:1px solid #e5e7eb; background:#fff; border-radius:999px;
          padding:8px 12px; font-weight:700; cursor:pointer;
        }
        .tab.active{ background:#111827; color:white; border-color:#111827; }
        .panel{
          background:white; border:1px solid #e5e7eb; border-radius:18px;
          overflow:hidden; box-shadow:0 1px 0 rgba(0,0,0,0.03);
        }
        .header{
          padding:14px 14px; border-bottom:1px solid #e5e7eb;
          display:flex; align-items:flex-start; justify-content:space-between;
          gap:12px; flex-wrap:wrap;
        }
        .hTitle{ font-weight:900; font-size:16px; }
        .panelBody{ padding:14px; }
        .small{ font-size:12px; color:#6b7280; }
        .row{ display:flex; align-items:center; }
        .pill{
          display:inline-flex; align-items:center;
          border:1px solid #e5e7eb; background:#fafafa;
          padding:6px 10px; border-radius:999px;
          font-size:12px; font-weight:700; color:#374151;
        }
        .card{
          border:1px solid #e5e7eb; border-radius:16px;
          background:#fff; overflow:hidden;
        }
        .cardHead{
          padding:12px 12px; border-bottom:1px solid #e5e7eb;
          display:flex; align-items:flex-start; justify-content:space-between;
          gap:10px; flex-wrap:wrap;
        }
        .cardTitle{ font-weight:900; }
        .box{
          border:1px solid #e5e7eb; background:#fafafa;
          border-radius:14px; padding:12px; margin-top:12px;
        }
        .boxTitle{ font-weight:900; margin-bottom:8px; }
        .divider{ height:1px; background:#e5e7eb; margin:12px 0; }
        .grid2col{ display:grid; grid-template-columns:1.2fr 1fr; gap:12px; }
        .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        @media (max-width: 980px){
          .grid2col{ grid-template-columns:1fr; }
          .grid3{ grid-template-columns:1fr; }
          .grid2{ grid-template-columns:1fr; }
        }
        .btn, .btn2{
          border-radius:12px; padding:10px 12px; font-weight:900;
          cursor:pointer; border:1px solid #111827;
        }
        .btn{ background:#111827; color:white; }
        .btn:hover{ filter:brightness(1.05); }
        .btn:disabled{ opacity:0.5; cursor:not-allowed; }
        .btn2{ background:white; color:#111827; border:1px solid #e5e7eb; }
        .btn2:hover{ background:#f9fafb; }
        .optBtn{
          text-align:left; border:1px solid #e5e7eb; background:white;
          border-radius:14px; padding:12px; cursor:pointer;
        }
        .optBtn:hover{ background:#f9fafb; }
        .optMain{ font-weight:900; }
        .tag{
          display:inline-flex; border:1px solid #e5e7eb; background:#fff;
          border-radius:999px; padding:4px 8px; font-size:12px;
          font-weight:800; color:#374151;
        }
        .tag.ok{
          border-color:rgba(16,185,129,0.35);
          background:rgba(16,185,129,0.10);
          color:#065f46;
        }
        .shopItem{ border:1px solid #e5e7eb; background:white; border-radius:14px; padding:12px; }
        .idolWrap{
          border:1px solid #e5e7eb; border-radius:14px; overflow:hidden;
          background:#fff; margin-top:10px;
          width:100%; aspect-ratio:16/9; min-height:260px;
        }
        .idolCanvas{ width:100%; height:100%; display:block; }
        .logList{
          max-height:260px; overflow:auto; display:grid; gap:8px; padding:12px;
        }
        .logItem{
          border:1px solid #e5e7eb; background:#fff; border-radius:12px; padding:10px;
        }

        /* ✅ Page mount strategy */
        .page{ width:100%; }
        .pageHide{
          position:absolute;
          left:-999999px;
          top:0;
          width:1200px; /* stable layout for hidden pages */
          opacity:0;
          pointer-events:none;
        }
        .pageShow{
          position:relative;
          left:auto;
          opacity:1;
          pointer-events:auto;
        }

        .stageBox{ padding:10px; }
        .stageScene{ border:1px solid #e5e7eb; border-radius:16px; overflow:hidden; background:#fff; }
        .stageBg{
          padding:16px; background:linear-gradient(180deg,#fff7ed,#ffffff);
          border-bottom:1px solid #e5e7eb;
        }
        .stageName{ font-weight:900; font-size:16px; }
        .performAvatar{
          height:260px; display:flex; align-items:center; justify-content:center; position:relative;
        }
        .avatarFace{
          width:90px; height:90px; border-radius:50%;
          background:#f7d7c4; border:2px solid rgba(0,0,0,0.08);
          position:absolute; top:70px;
        }
        .avatarBody{
          width:140px; height:150px; border-radius:22px;
          background:#111827; position:absolute; top:140px;
        }
        .performing{ animation:bop 0.18s ease-in-out infinite alternate; }
        @keyframes bop{ from{ transform:translateY(0); } to{ transform:translateY(-6px); } }
        .bigHint{ margin-top:10px; font-weight:900; }
        .resultBox{
          margin-top:10px; border:1px solid #e5e7eb;
          background:#fff; border-radius:14px; padding:12px;
        }
        .resultGrade{ font-weight:1000; font-size:24px; }
        .toast{
          position:fixed; bottom:18px; left:50%;
          transform:translateX(-50%);
          background:#111827; color:white;
          padding:10px 14px; border-radius:999px; font-weight:900;
          box-shadow:0 10px 25px rgba(0,0,0,0.2); z-index:50;
        }
        .modalBg{
          position:fixed; inset:0; background:rgba(0,0,0,0.45);
          display:flex; align-items:center; justify-content:center;
          padding:16px; z-index:60;
        }
        .modal{
          width:min(560px, 96vw); background:white; border-radius:18px;
          border:1px solid #e5e7eb; overflow:hidden;
          box-shadow:0 20px 60px rgba(0,0,0,0.22);
        }
        .modalHead{
          padding:12px; border-bottom:1px solid #e5e7eb;
          display:flex; align-items:flex-start; justify-content:space-between;
          gap:10px;
        }
        .modalBody{ padding:12px; display:grid; gap:12px; }
        .polaroidCard{ border:1px solid #e5e7eb; background:#fff; border-radius:16px; padding:12px; }
        .polaroidFrame{ border:2px solid #111827; border-radius:12px; overflow:hidden; }
        .polaroidImg{
          height:140px; display:flex; align-items:center; justify-content:center;
          flex-direction:column; background:linear-gradient(180deg,#fff,#f3f4f6);
        }
        .polaroidFooter{ border-top:1px solid #111827; background:#fff; padding:10px; }
        .developing{ position:relative; overflow:hidden; }
        .developing:after{
          content:""; position:absolute; inset:0;
          background:linear-gradient(90deg, rgba(0,0,0,0.0), rgba(0,0,0,0.12), rgba(0,0,0,0.0));
          animation:dev 0.9s linear infinite;
        }
        @keyframes dev{ from{ transform:translateX(-100%); } to{ transform:translateX(100%); } }
      `}</style>

      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <span className="pill">🎤 Idol Life Sim</span>
            <span className="small">（React MVP，可线上部署）</span>
          </div>

          <div className="nav">
            <NavButton id="home" label="主界面" />
            <NavButton id="dress" label="换装" />
            <NavButton id="bag" label="背包" />
            <NavButton id="tour" label="巡回舞台" />
            <NavButton id="stage" label="演出" />
            <NavButton id="polaroid" label="拍立得相册" />
          </div>
        </div>

        <div className="panel">
          {screen === "home" && <PageHeader title="主界面" subtitle="养成 → 演出 → 奖励 → 更好的养成" />}
          {screen === "dress" && <PageHeader title="换装" subtitle="分层换装（无需建模）" />}
          {screen === "bag" && <PageHeader title="背包" subtitle="食物 / 碎片 / 称号" />}
          {screen === "tour" && <PageHeader title="巡回舞台" subtitle="支持 JSON 同步更新" />}
          {screen === "stage" && <PageHeader title="演出界面" subtitle="评分 + 奖励结算（S 解锁拍立得）" />}
          {screen === "polaroid" && <PageHeader title="拍立得相册" subtitle="收藏奖励：5/10/20" />}

          {/* ✅ IMPORTANT: All pages stay mounted; we only toggle visibility */}
          <div style={{ position: "relative" }}>
            <HomePage visible={screen === "home"} />
            <DressPage visible={screen === "dress"} />
            <BagPage visible={screen === "bag"} />
            <TourPage visible={screen === "tour"} />
            <StagePage visible={screen === "stage"} />
            <PolaroidPage visible={screen === "polaroid"} />
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {polaroidOpen && (
        <div className="modalBg">
          <div className="modal">
            <div className="modalHead">
              <div>
                <div className="hTitle">拍立得合影（S 级解锁）</div>
                <div className="small">选择姿势与滤镜，然后点击拍照</div>
              </div>
              <button className="btn2" onClick={() => setPolaroidOpen(false)}>关闭</button>
            </div>

            <div className={"modalBody " + (developing ? "developing" : "")}>
              <div className="box">
                <div className="boxTitle">选择姿势</div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {POLAROID_POSES.map((p) => (
                    <button
                      key={p.id}
                      className={polaroidPose === p.id ? "tab active" : "tab"}
                      onClick={() => setPolaroidPose(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">选择滤镜</div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {POLAROID_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      className={polaroidFilter === f.id ? "tab active" : "tab"}
                      onClick={() => setPolaroidFilter(f.id)}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="box">
                <div className="boxTitle">预览（MVP 占位）</div>
                <div className="polaroidFrame">
                  <div className="polaroidImg">
                    <div className="optMain">{stageResult?.stage?.name || "舞台"}</div>
                    <div className="small">Pose: {polaroidPose} ｜ Filter: {polaroidFilter}</div>
                    <div className="small">点击拍照后会模拟显影并保存到相册</div>
                  </div>
                  <div className="polaroidFooter">
                    <div className="small">拍立得显影中：{developing ? "是" : "否"}</div>
                  </div>
                </div>
              </div>

              <div className="row" style={{ gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button className="btn2" onClick={() => setPolaroidOpen(false)} disabled={developing}>取消</button>
                <button className="btn" onClick={finishPolaroidCapture} disabled={developing}>
                  {developing ? "显影中…" : "拍照并保存"}
                </button>
              </div>

              <div className="small">保存后会自动跳转到拍立得相册。</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
