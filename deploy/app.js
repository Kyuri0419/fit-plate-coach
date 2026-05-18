const storageKey = "fitPlateCoachState";
const cloudConfig = window.FIT_PLATE_SUPABASE || {};
const memberToken = new URLSearchParams(window.location.search).get("member");
let cloudEnabled = false;
let db = null;

const plans = [
  { type: "감량", title: "감량 기본형", summary: "단백질을 매 끼니 고정하고 탄수화물은 운동 전후에 배치합니다.", meals: ["아침: 그릭요거트, 베리, 삶은 달걀", "점심: 현미밥, 닭가슴살, 샐러드", "저녁: 흰살생선, 구운 채소, 두부"] },
  { type: "증량", title: "린 벌크업", summary: "식사량을 무리 없이 올리고 간식으로 총열량을 보완합니다.", meals: ["아침: 오트밀, 바나나, 우유, 달걀", "점심: 쌀밥, 소고기, 채소", "간식: 고구마, 프로틴, 견과류"] },
  { type: "유지", title: "체중 유지형", summary: "외식이 있는 날에도 균형을 잃지 않도록 구성합니다.", meals: ["아침: 토스트, 달걀, 과일", "점심: 일반식 1인분, 단백질 반찬 추가", "저녁: 밥 반 공기, 닭/생선, 나물"] },
  { type: "감량", title: "외식 잦은 회원", summary: "선택지를 제한하지 않고 메뉴 고르는 기준을 명확히 합니다.", meals: ["국물은 절반 이하", "튀김보다 구이/찜", "밥 양은 평소의 70%"] },
  { type: "증량", title: "운동일 보강형", summary: "운동 수행력이 떨어지지 않게 운동 전후 탄수화물을 챙깁니다.", meals: ["운동 전: 바나나 또는 떡", "운동 후: 밥, 살코기, 채소", "취침 전: 우유 또는 요거트"] },
  { type: "유지", title: "컨디션 회복형", summary: "수분, 섬유질, 규칙성을 우선해 식사 리듬을 되찾습니다.", meals: ["물 1.8L 이상", "매일 채소 두 주먹", "카페인은 오후 3시 이전"] },
];

const defaultState = { members: [], meals: [] };
const viewTitles = { dashboard: "오늘의 관리", members: "회원 관리", meal: "식단 기록", plans: "식단 플랜" };
let state = loadLocalState();
let activePlanFilter = "전체";
let currentUser = null;
let authAction = "signin";

const nodes = {
  appContent: document.querySelector("#appContent"),
  authPanel: document.querySelector("#authPanel"),
  memberPortal: document.querySelector("#memberPortal"),
  portalMemberName: document.querySelector("#portalMemberName"),
  portalMealForm: document.querySelector("#portalMealForm"),
  portalMessage: document.querySelector("#portalMessage"),
  authForm: document.querySelector("#authForm"),
  authMessage: document.querySelector("#authMessage"),
  signOutButton: document.querySelector("#signOutButton"),
  storageMode: document.querySelector("#storageMode"),
  storageText: document.querySelector("#storageText"),
  viewTitle: document.querySelector("#viewTitle"),
  metricGrid: document.querySelector("#metricGrid"),
  pendingCount: document.querySelector("#pendingCount"),
  pendingMeals: document.querySelector("#pendingMeals"),
  memberStatusList: document.querySelector("#memberStatusList"),
  memberForm: document.querySelector("#memberForm"),
  memberList: document.querySelector("#memberList"),
  memberCount: document.querySelector("#memberCount"),
  mealForm: document.querySelector("#mealForm"),
  mealMemberSelect: document.querySelector("#mealMemberSelect"),
  mealFeed: document.querySelector("#mealFeed"),
  mealCount: document.querySelector("#mealCount"),
  planGrid: document.querySelector("#planGrid"),
  feedbackDialog: document.querySelector("#feedbackDialog"),
  feedbackForm: document.querySelector("#feedbackForm"),
  closeFeedback: document.querySelector("#closeFeedback"),
  seedButton: document.querySelector("#seedButton"),
};

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-view-jump]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewJump)));

document.querySelectorAll("[data-plan-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activePlanFilter = button.dataset.planFilter;
    document.querySelectorAll("[data-plan-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderPlans();
  });
});

nodes.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  authAction = submitter?.dataset.authAction || authAction;
  const data = new FormData(nodes.authForm);
  nodes.authMessage.textContent = "처리 중입니다...";

  const email = data.get("email");
  const password = data.get("password");
  const result = authAction === "signup"
    ? await db.auth.signUp({ email, password })
    : await db.auth.signInWithPassword({ email, password });

  if (result.error) {
    nodes.authMessage.textContent = result.error.message;
    return;
  }

  if (authAction === "signup" && !result.data.session) {
    nodes.authMessage.textContent = "계정이 만들어졌습니다. Supabase 설정에 따라 이메일 확인 후 로그인해 주세요.";
    return;
  }

  currentUser = result.data.session?.user || result.data.user || null;
  if (!currentUser) {
    nodes.authMessage.textContent = "로그인 세션을 만들지 못했습니다. 이메일 확인 후 다시 로그인해 주세요.";
    return;
  }

  await loadCloudState();
  updateAuthUi();
  render();
});

nodes.signOutButton.addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  currentUser = null;
  state = defaultState;
  updateAuthUi();
  render();
});

nodes.portalMealForm.date.valueAsDate = new Date();
nodes.portalMealForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  nodes.portalMessage.textContent = "전송 중입니다...";
  const data = new FormData(nodes.portalMealForm);
  const file = data.get("photo");
  const photoUrl = file && file.size ? await saveMemberPhoto(file) : "";
  const { error } = await db.rpc("submit_member_meal", {
    p_share_token: memberToken,
    p_meal_date: data.get("date"),
    p_meal_type: data.get("mealType"),
    p_description: data.get("description").trim(),
    p_water: data.get("water") ? Number(data.get("water")) : null,
    p_dining_out: data.get("diningOut") === "on",
    p_alcohol: data.get("alcohol") === "on",
    p_photo_url: photoUrl,
  });
  if (error) {
    nodes.portalMessage.textContent = error.message;
    return;
  }
  nodes.portalMealForm.reset();
  nodes.portalMealForm.date.valueAsDate = new Date();
  nodes.portalMessage.textContent = "식단이 전송되었습니다.";
});

nodes.memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(nodes.memberForm);
  const member = {
    id: crypto.randomUUID(),
    shareToken: crypto.randomUUID(),
    name: data.get("name").trim(),
    goal: data.get("goal"),
    weight: data.get("weight"),
    targetWeight: data.get("targetWeight"),
    notes: data.get("notes").trim(),
    createdAt: new Date().toISOString(),
  };
  state.members.unshift(member);
  nodes.memberForm.reset();
  await persistMember(member);
  render();
});

nodes.mealForm.date.valueAsDate = new Date();
nodes.mealForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(nodes.mealForm);
  const file = data.get("photo");
  const photo = file && file.size ? await savePhoto(file) : "";
  const meal = {
    id: crypto.randomUUID(),
    memberId: data.get("memberId"),
    date: data.get("date"),
    mealType: data.get("mealType"),
    description: data.get("description").trim(),
    water: data.get("water"),
    diningOut: data.get("diningOut") === "on",
    alcohol: data.get("alcohol") === "on",
    photo,
    feedback: "",
    createdAt: new Date().toISOString(),
  };

  state.meals.unshift(meal);
  nodes.mealForm.reset();
  nodes.mealForm.date.valueAsDate = new Date();
  await persistMeal(meal);
  render();
});

nodes.feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(nodes.feedbackForm);
  const meal = state.meals.find((item) => item.id === data.get("mealId"));
  if (meal) {
    meal.feedback = data.get("comment").trim();
    await persistMeal(meal);
    render();
  }
  nodes.feedbackDialog.close();
});

nodes.closeFeedback.addEventListener("click", () => nodes.feedbackDialog.close());

document.querySelectorAll("[data-feedback-tag]").forEach((button) => {
  button.addEventListener("click", () => {
    const textarea = nodes.feedbackForm.elements.comment;
    textarea.value = textarea.value ? `${textarea.value}, ${button.dataset.feedbackTag}` : button.dataset.feedbackTag;
    textarea.focus();
  });
});

nodes.seedButton.addEventListener("click", async () => {
  if (state.members.length || state.meals.length) return;
  seedData();
  await saveAll();
  render();
});

async function init() {
  if (cloudConfig.url && cloudConfig.anonKey) {
    try {
      await loadSupabaseScript();
      cloudEnabled = Boolean(window.supabase);
      db = cloudEnabled ? window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey) : null;
    } catch (error) {
      console.error(error);
      cloudEnabled = false;
    }
  }

  if (!cloudEnabled) {
    updateStorageUi(false);
    if (memberToken) {
      nodes.memberPortal.hidden = false;
      nodes.appContent.hidden = true;
      nodes.authPanel.hidden = true;
      nodes.portalMemberName.textContent = "Supabase 설정이 필요합니다";
      nodes.portalMessage.textContent = "회원 업로드 링크는 Supabase 연결 후 사용할 수 있습니다.";
      return;
    }
    render();
    return;
  }

  updateStorageUi(true);
  if (memberToken) {
    await initMemberPortal();
    return;
  }
  const { data } = await db.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) await loadCloudState();
  updateAuthUi();
  render();
}

async function initMemberPortal() {
  nodes.authPanel.hidden = true;
  nodes.appContent.hidden = true;
  nodes.memberPortal.hidden = false;
  const { data, error } = await db.rpc("get_member_by_token", { p_share_token: memberToken });
  if (error || !data?.length) {
    nodes.portalMemberName.textContent = "링크를 확인해 주세요";
    nodes.portalMessage.textContent = error?.message || "회원 정보를 찾을 수 없습니다.";
    nodes.portalMealForm.querySelector("button[type='submit']").disabled = true;
    return;
  }
  nodes.portalMemberName.textContent = `${data[0].name} 식단 기록`;
}

function loadSupabaseScript() {
  if (window.supabase) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Supabase SDK를 불러오지 못했습니다."));
    document.head.append(script);
  });
}

function updateStorageUi(isCloud) {
  nodes.storageMode.textContent = isCloud ? "클라우드 연결" : "로컬 MVP";
  nodes.storageText.textContent = isCloud ? "Supabase에 로그인 계정별로 저장됩니다." : "Supabase 설정 전에는 이 브라우저에만 저장됩니다.";
}

function updateAuthUi() {
  const mustAuth = cloudEnabled && !currentUser;
  nodes.authPanel.hidden = !mustAuth;
  nodes.memberPortal.hidden = true;
  nodes.appContent.hidden = mustAuth;
  nodes.signOutButton.hidden = !cloudEnabled || !currentUser;
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
  document.querySelector(`#${viewName}View`).classList.add("is-active");
  document.querySelectorAll(".nav-tab").forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  nodes.viewTitle.textContent = viewTitles[viewName];
}

function render() {
  renderMetrics();
  renderPendingMeals();
  renderMemberStatus();
  renderMembers();
  renderMealSelect();
  renderMealFeed();
  renderPlans();
}

function renderMetrics() {
  const today = getToday();
  const metrics = [
    ["전체 회원", state.members.length],
    ["오늘 식단", state.meals.filter((meal) => meal.date === today).length],
    ["피드백 대기", state.meals.filter((meal) => !meal.feedback).length],
    ["외식 기록", state.meals.filter((meal) => meal.diningOut).length],
  ];
  nodes.metricGrid.innerHTML = metrics.map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
}

function renderPendingMeals() {
  const pending = state.meals.filter((meal) => !meal.feedback).slice(0, 8);
  nodes.pendingCount.textContent = pending.length;
  nodes.pendingMeals.innerHTML = pending.length ? pending.map(renderFeedItem).join("") : emptyState("아직 피드백 대기 식단이 없습니다.");
  nodes.pendingMeals.querySelectorAll("[data-feedback-id]").forEach((button) => button.addEventListener("click", () => openFeedback(button.dataset.feedbackId)));
}

function renderFeedItem(meal) {
  const member = getMember(meal.memberId);
  const photo = meal.photo ? `<img class="meal-thumb" src="${meal.photo}" alt="${escapeHtml(member.name)} ${meal.mealType} 식단 사진" />` : `<div class="meal-thumb meal-placeholder" aria-hidden="true">사진 없음</div>`;
  const flags = [meal.diningOut ? "외식" : "", meal.alcohol ? "음주" : ""].filter(Boolean);
  return `
    <article class="feed-item">
      ${photo}
      <div>
        <div class="item-title">
          <strong>${escapeHtml(member.name)}</strong>
          <span class="status-pill warn">${meal.mealType}</span>
          ${flags.map((flag) => `<span class="status-pill">${flag}</span>`).join("")}
        </div>
        <p class="muted">${formatDate(meal.date)} · ${escapeHtml(meal.description)}</p>
      </div>
      <button class="ghost-action" type="button" data-feedback-id="${meal.id}">피드백</button>
    </article>
  `;
}

function renderMemberStatus() {
  if (!state.members.length) {
    nodes.memberStatusList.innerHTML = emptyState("회원부터 등록해 주세요.");
    return;
  }
  nodes.memberStatusList.innerHTML = state.members.map((member) => {
    const meals = state.meals.filter((meal) => meal.memberId === member.id);
    const lastMeal = meals[0];
    const pending = meals.filter((meal) => !meal.feedback).length;
    return `<article class="member-row"><div class="member-main"><strong>${escapeHtml(member.name)}</strong><span class="status-pill">${member.goal}</span></div><span class="muted">${lastMeal ? `${formatDate(lastMeal.date)} 마지막 기록` : "아직 기록 없음"}</span><span class="muted">피드백 대기 ${pending}건</span></article>`;
  }).join("");
}

function renderMembers() {
  nodes.memberCount.textContent = state.members.length;
  if (!state.members.length) {
    nodes.memberList.innerHTML = emptyState("첫 회원을 등록하면 여기에 표시됩니다.");
    return;
  }
  nodes.memberList.innerHTML = state.members.map((member) => {
    const weightText = member.weight && member.targetWeight ? `${member.weight}kg → ${member.targetWeight}kg` : "체중 정보 없음";
    const shareLink = cloudEnabled && member.shareToken ? `${location.origin}${location.pathname}?member=${member.shareToken}` : "";
    return `<article class="member-row"><div class="member-main"><strong>${escapeHtml(member.name)}</strong><span class="status-pill">${member.goal}</span></div><span class="muted">${weightText}</span><p class="muted">${escapeHtml(member.notes || "특이사항 없음")}</p>${shareLink ? `<label>회원 업로드 링크 <input readonly value="${shareLink}" /></label>` : ""}</article>`;
  }).join("");
}

function renderMealSelect() {
  if (!state.members.length) {
    nodes.mealMemberSelect.innerHTML = `<option value="">회원 등록 필요</option>`;
    nodes.mealForm.querySelector("button[type='submit']").disabled = true;
    return;
  }
  nodes.mealMemberSelect.innerHTML = state.members.map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join("");
  nodes.mealForm.querySelector("button[type='submit']").disabled = false;
}

function renderMealFeed() {
  nodes.mealCount.textContent = state.meals.length;
  if (!state.meals.length) {
    nodes.mealFeed.innerHTML = emptyState("식단을 저장하면 최근 기록이 쌓입니다.");
    return;
  }
  nodes.mealFeed.innerHTML = state.meals.slice(0, 12).map((meal) => {
    const member = getMember(meal.memberId);
    const photo = meal.photo ? `<img class="meal-thumb" src="${meal.photo}" alt="${escapeHtml(member.name)} ${meal.mealType} 식단 사진" />` : `<div class="meal-thumb meal-placeholder" aria-hidden="true">사진 없음</div>`;
    return `<article class="meal-item">${photo}<div><div class="item-title"><strong>${escapeHtml(member.name)}</strong><span class="status-pill">${meal.mealType}</span></div><p class="muted">${formatDate(meal.date)} · 물 ${meal.water || 0}L</p><p>${escapeHtml(meal.description)}</p>${meal.feedback ? `<div class="feedback-box">${escapeHtml(meal.feedback)}</div>` : ""}</div></article>`;
  }).join("");
}

function renderPlans() {
  const visiblePlans = activePlanFilter === "전체" ? plans : plans.filter((plan) => plan.type === activePlanFilter);
  nodes.planGrid.innerHTML = visiblePlans.map((plan) => `<article class="plan-item"><div class="item-title"><h3>${plan.title}</h3><span class="status-pill">${plan.type}</span></div><p class="muted">${plan.summary}</p><ul>${plan.meals.map((meal) => `<li>${meal}</li>`).join("")}</ul></article>`).join("");
}

async function persistMember(member) {
  if (!cloudEnabled || !currentUser) {
    saveLocalState();
    return;
  }
  await db.from("members").upsert(toMemberRow(member));
}

async function persistMeal(meal) {
  if (!cloudEnabled || !currentUser) {
    saveLocalState();
    return;
  }
  await db.from("meals").upsert(toMealRow(meal));
}

async function saveAll() {
  if (!cloudEnabled || !currentUser) {
    saveLocalState();
    return;
  }
  if (state.members.length) await db.from("members").upsert(state.members.map(toMemberRow));
  if (state.meals.length) await db.from("meals").upsert(state.meals.map(toMealRow));
}

async function loadCloudState() {
  const [{ data: members, error: memberError }, { data: meals, error: mealError }] = await Promise.all([
    db.from("members").select("*").order("created_at", { ascending: false }),
    db.from("meals").select("*").order("created_at", { ascending: false }),
  ]);
  if (memberError || mealError) {
    nodes.authMessage.textContent = memberError?.message || mealError?.message;
    return;
  }
  state = {
    members: (members || []).map(fromMemberRow),
    meals: (meals || []).map(fromMealRow),
  };
}

async function savePhoto(file) {
  if (!cloudEnabled || !currentUser) return fileToDataUrl(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await db.storage.from("meal-photos").upload(path, file, { upsert: false });
  if (error) {
    alert(`사진 업로드 실패: ${error.message}`);
    return "";
  }
  const { data } = db.storage.from("meal-photos").getPublicUrl(path);
  return data.publicUrl;
}

async function saveMemberPhoto(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `member-uploads/${memberToken}-${crypto.randomUUID()}-${safeName}`;
  const { error } = await db.storage.from("meal-photos").upload(path, file, { upsert: false });
  if (error) {
    nodes.portalMessage.textContent = `사진 업로드 실패: ${error.message}`;
    return "";
  }
  const { data } = db.storage.from("meal-photos").getPublicUrl(path);
  return data.publicUrl;
}

function toMemberRow(member) {
  return {
    id: member.id,
    trainer_id: currentUser.id,
    share_token: member.shareToken,
    name: member.name,
    goal: member.goal,
    weight: member.weight ? Number(member.weight) : null,
    target_weight: member.targetWeight ? Number(member.targetWeight) : null,
    notes: member.notes,
    created_at: member.createdAt,
  };
}

function fromMemberRow(row) {
  return { id: row.id, shareToken: row.share_token, name: row.name, goal: row.goal, weight: row.weight ?? "", targetWeight: row.target_weight ?? "", notes: row.notes || "", createdAt: row.created_at };
}

function toMealRow(meal) {
  return {
    id: meal.id,
    trainer_id: currentUser.id,
    member_id: meal.memberId,
    meal_date: meal.date,
    meal_type: meal.mealType,
    description: meal.description,
    water: meal.water ? Number(meal.water) : null,
    dining_out: meal.diningOut,
    alcohol: meal.alcohol,
    photo_url: meal.photo,
    feedback: meal.feedback,
    created_at: meal.createdAt,
  };
}

function fromMealRow(row) {
  return { id: row.id, memberId: row.member_id, date: row.meal_date, mealType: row.meal_type, description: row.description, water: row.water ?? "", diningOut: row.dining_out, alcohol: row.alcohol, photo: row.photo_url || "", feedback: row.feedback || "", createdAt: row.created_at };
}

function openFeedback(mealId) {
  const meal = state.meals.find((item) => item.id === mealId);
  if (!meal) return;
  nodes.feedbackForm.elements.mealId.value = meal.id;
  nodes.feedbackForm.elements.comment.value = meal.feedback;
  nodes.feedbackDialog.showModal();
}

function getMember(memberId) {
  return state.members.find((member) => member.id === memberId) || { name: "삭제된 회원", goal: "" };
}

function saveLocalState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadLocalState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", weekday: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function seedData() {
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  state.members = [
    { id: first, shareToken: crypto.randomUUID(), name: "김서윤", goal: "감량", weight: "67.5", targetWeight: "62", notes: "야근이 잦고 저녁 외식 빈도가 높음", createdAt: new Date().toISOString() },
    { id: second, shareToken: crypto.randomUUID(), name: "박민재", goal: "증량", weight: "72", targetWeight: "78", notes: "운동일 식사량이 부족함", createdAt: new Date().toISOString() },
  ];
  state.meals = [
    { id: crypto.randomUUID(), memberId: first, date: getToday(), mealType: "점심", description: "현미밥, 닭가슴살, 샐러드, 아메리카노", water: "1.2", diningOut: false, alcohol: false, photo: "", feedback: "", createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), memberId: second, date: getToday(), mealType: "간식", description: "바나나, 프로틴 쉐이크", water: "1.6", diningOut: false, alcohol: false, photo: "", feedback: "운동 후 보충 좋습니다. 저녁에는 밥 양을 조금 더 챙겨주세요.", createdAt: new Date().toISOString() },
  ];
}

init();
