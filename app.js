/* Gestor de Projetos e Tarefas — Mineragro P&D Agronômico */
(() => {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const DOMAIN = String(CFG.EMAIL_DOMAIN || "mineragro.com").toLowerCase();
  // ?demo=1 abre a demonstração (dados fictícios em memória) mesmo com o Supabase configurado.
  const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || /[?&]demo=1\b/.test(location.search);
  const SITE_URL = CFG.SITE_URL || "https://www.mineragro.com";
  const APP_URL = CFG.APP_URL || "";
  // Dentro de uma página do Wix (iframe) o cabeçalho e o rodapé do próprio site já aparecem: usa o modo compacto.
  const EMBED = (() => { try { return window.self !== window.top; } catch { return true; } })() || /[?&]embed=1\b/.test(location.search);
  if (EMBED) document.documentElement.classList.add("embed");
  const ALLOW_SIGNUP = CFG.ALLOW_SIGNUP !== false;

  const STATUS_PROJ = { planejado: "Planejado", andamento: "Em andamento", pausado: "Pausado", concluido: "Concluído" };
  const STATUS_TASK = { a_fazer: "A fazer", andamento: "Em andamento", concluida: "Concluída" };
  const PRIORITY = { alta: "Alta", media: "Média", baixa: "Baixa" };
  const TASK_ORDER = ["a_fazer", "andamento", "concluida"];
  const PRIO_RANK = { alta: 0, media: 1, baixa: 2 };

  // ------------------------------------------------------------------ utilidades
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const fmtDate = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
  const fmtDateTime = (ts) => (ts ? new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
  const isOverdue = (t) => t.status !== "concluida" && !!t.due_date && t.due_date < todayISO();
  const emailOk = (e) => String(e || "").trim().toLowerCase().endsWith("@" + DOMAIN);
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
  const store = {
    get(k, d) { try { return localStorage.getItem("mtp:" + k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("mtp:" + k, v); } catch { /* sem armazenamento */ } },
  };

  const ICONS = {
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l8-8"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 18l6-6-6-6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    out: '<path d="M15 4h4v16h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

  function friendly(err) {
    const m = (err && (err.message || err.error_description)) || String(err);
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    if (/mineragro\.com|Database error saving new user/i.test(m)) return `Somente e-mails @${DOMAIN} podem acessar.`;
    if (/Password should be at least|weak/i.test(m)) return "Senha fraca: use pelo menos 8 caracteres, com letras e números.";
    if (/already registered/i.test(m)) return "Este e-mail já tem conta. Use “Entrar” ou “Esqueci a senha”.";
    if (/Signups not allowed/i.test(m)) return "Criação de conta desativada. Peça acesso à gestão.";
    if (/row-level security|42501|permission|não pode|Só a gestão/i.test(m)) return /[À-ú]/.test(m) ? m : "Você não tem permissão para esta ação.";
    if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Sem conexão com o servidor. Verifique a internet.";
    return m;
  }

  // ------------------------------------------------------------------ dados: Supabase
  function supabaseApi() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const ok = ({ data, error }) => { if (error) throw error; return data; };
    // Links de confirmação e de "esqueci a senha" sempre voltam para o endereço público do sistema
    // (dentro do Wix a página roda num endereço interno do Wix, que não serve para isso).
    const redirect = APP_URL || location.origin + location.pathname;
    const save = async (table, row) => {
      const { id, ...rest } = row;
      return ok(id
        ? await sb.from(table).update(rest).eq("id", id).select().single()
        : await sb.from(table).insert(rest).select().single());
    };
    return {
      onAuth: (cb) => sb.auth.onAuthStateChange((ev, s) => cb(ev, s)),
      getSession: async () => ok(await sb.auth.getSession()).session,
      signIn: async (email, password) => ok(await sb.auth.signInWithPassword({ email, password })),
      signUp: async (name, email, password) => ok(await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: redirect } })),
      signOut: async () => { await sb.auth.signOut(); },
      resetPassword: async (email) => ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect })),
      updatePassword: async (password) => ok(await sb.auth.updateUser({ password })),
      load: async () => {
        const [p, pr, t, a] = await Promise.all([
          sb.from("profiles").select("*").order("full_name"),
          sb.from("projects").select("*").order("created_at", { ascending: false }),
          sb.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }),
          sb.from("task_assignees").select("task_id, profile_id"),
        ]);
        const byTask = {};
        for (const r of ok(a)) (byTask[r.task_id] ||= []).push(r.profile_id);
        return { profiles: ok(p), projects: ok(pr), tasks: ok(t).map((x) => ({ ...x, assignees: byTask[x.id] || [] })) };
      },
      saveProfile: async (id, patch) => ok(await sb.from("profiles").update(patch).eq("id", id).select().single()),
      saveProject: (p) => save("projects", p),
      deleteProject: async (id) => ok(await sb.from("projects").delete().eq("id", id)),
      // Salva a tarefa e, se vier a lista de responsáveis, inclui/retira só quem mudou
      // (cada pessoa incluída recebe um e-mail; quem já estava não recebe de novo).
      saveTask: async (t) => {
        const { assignees, ...row } = t;
        const saved = await save("tasks", row);
        if (Array.isArray(assignees)) {
          const cur = ok(await sb.from("task_assignees").select("profile_id").eq("task_id", saved.id)).map((r) => r.profile_id);
          const del = cur.filter((x) => !assignees.includes(x));
          const add = assignees.filter((x) => !cur.includes(x));
          if (del.length) ok(await sb.from("task_assignees").delete().eq("task_id", saved.id).in("profile_id", del));
          if (add.length) ok(await sb.from("task_assignees").insert(add.map((profile_id) => ({ task_id: saved.id, profile_id }))));
        }
        return saved;
      },
      deleteTask: async (id) => ok(await sb.from("tasks").delete().eq("id", id)),
      // Painel calculado no banco (views painel_projetos / painel_pessoas).
      loadPainel: async () => ({ projetos: ok(await sb.from("painel_projetos").select("*")) }),
    };
  }

  // ------------------------------------------------------------------ dados: demonstração (memória)
  function demoApi() {
    const t0 = todayISO();
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    const now = () => new Date().toISOString();
    const P = [
      { id: "u1", email: "gestor@" + DOMAIN, full_name: "Gestão P&D (demo)", role: "gestor", active: true },
      { id: "u2", email: "ana.souza@" + DOMAIN, full_name: "Ana Souza", role: "equipe", active: true },
      { id: "u3", email: "bruno.lima@" + DOMAIN, full_name: "Bruno Lima", role: "equipe", active: true },
      { id: "u4", email: "carla.dias@" + DOMAIN, full_name: "Carla Dias", role: "equipe", active: false },
    ];
    const PR = [
      { id: "p1", code: "TV-171", name: "Eficiência de fertilizante foliar em soja", crop: "Soja", client: "Cliente A", location: "Fazenda Experimental — Uberaba/MG", status: "andamento", start_date: addDays(t0, -40), end_date: addDays(t0, 120), owner_id: "u2", description: "DBC com 6 tratamentos e 4 repetições." },
      { id: "p2", code: "TV-172", name: "Bioestimulante em milho safrinha", crop: "Milho", client: "Cliente B", location: "Área 3 — Patos de Minas/MG", status: "planejado", start_date: addDays(t0, 15), end_date: addDays(t0, 180), owner_id: "u3", description: "" },
      { id: "p3", code: "LAB-08", name: "Incubação de solo com remineralizador", crop: "—", client: "Interno", location: "Laboratório", status: "andamento", start_date: addDays(t0, -10), end_date: addDays(t0, 80), owner_id: "u1", description: "Incubação por 90 dias, coletas a cada 30 dias." },
    ].map((p) => ({ ...p, created_at: now() }));
    const T = [
      ["p1", "Aplicação A — V4", ["u2", "u3"], -3, "alta", "a_fazer"],
      ["p1", "Avaliação de fitotoxicidade 7 DAA", ["u3"], 0, "media", "a_fazer"],
      ["p1", "Coleta de folhas para análise", ["u2", "u1"], 5, "media", "andamento"],
      ["p1", "Semeadura", ["u2", "u3"], -40, "alta", "concluida"],
      ["p1", "Demarcação das parcelas", ["u3"], -42, "media", "concluida"],
      ["p2", "Análise de solo da área", ["u3"], 6, "alta", "a_fazer"],
      ["p2", "Montar croqui e casualização", ["u1"], 0, "media", "andamento"],
      ["p2", "Comunicar instalação ao MAPA", ["u1"], 25, "alta", "a_fazer"],
      ["p3", "Coleta 30 dias", ["u2"], 20, "media", "a_fazer"],
      ["p3", "Montagem das unidades", ["u2"], -10, "alta", "concluida"],
      ["p3", "Enviar amostras ao laboratório", [], -1, "baixa", "a_fazer"],
    ].map(([project_id, title, assignees, d, priority, status]) => ({
      id: uid(), project_id, title, assignees, due_date: addDays(t0, d), priority, status, description: "",
      done_at: status === "concluida" ? now() : null, done_by: status === "concluida" ? assignees[0] || null : null, created_by: "u1", created_at: now(),
    }));
    const db = { profiles: P, projects: PR, tasks: T };
    let session = null;
    let listener = () => {};
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const wait = () => new Promise((r) => setTimeout(r, 120));
    return {
      onAuth: (cb) => { listener = cb; },
      getSession: async () => session,
      signIn: async (email) => {
        await wait();
        if (!emailOk(email)) throw new Error("mineragro.com");
        session = { user: { id: "u1", email } };
        listener("SIGNED_IN", session);
        return { session };
      },
      signUp: async () => { await wait(); return { session: null }; },
      signOut: async () => { session = null; listener("SIGNED_OUT", null); },
      resetPassword: async () => { await wait(); return {}; },
      updatePassword: async () => { await wait(); return {}; },
      load: async () => { await wait(); return clone(db); },
      saveProfile: async (id, patch) => { const p = db.profiles.find((x) => x.id === id); Object.assign(p, patch); return clone(p); },
      saveProject: async (p) => {
        if (p.id) { const cur = db.projects.find((x) => x.id === p.id); Object.assign(cur, p); return clone(cur); }
        const n = { ...p, id: uid(), created_at: now(), created_by: session.user.id };
        db.projects.unshift(n); return clone(n);
      },
      deleteProject: async (id) => { db.projects = db.projects.filter((x) => x.id !== id); db.tasks = db.tasks.filter((t) => t.project_id !== id); },
      saveTask: async (t) => {
        let cur = t.id ? db.tasks.find((x) => x.id === t.id) : null;
        const wasDone = cur && cur.status === "concluida";
        if (cur) Object.assign(cur, t);
        else { cur = { description: "", assignees: [], ...t, id: uid(), created_at: now(), created_by: session.user.id }; db.tasks.push(cur); }
        if (cur.status === "concluida" && !wasDone) { cur.done_at = now(); cur.done_by = session.user.id; }
        if (cur.status !== "concluida") { cur.done_at = null; cur.done_by = null; }
        return clone(cur);
      },
      deleteTask: async (id) => { db.tasks = db.tasks.filter((x) => x.id !== id); },
      loadPainel: async () => null, // demonstração: calculado na tela
    };
  }

  const api = DEMO ? demoApi() : supabaseApi();

  // ------------------------------------------------------------------ estado
  const state = {
    screen: "boot", // boot | auth | app | recovery
    authMode: "login", // login | signup | forgot
    authMsg: "",
    userId: null,
    me: null,
    profiles: [],
    projects: [],
    tasks: [],
    loadedAt: 0,
    taskMode: store.get("taskMode", "lista"),
    projMode: store.get("projMode", "lista"),
    tf: { q: "", project: "", who: "", status: "abertas", priority: "" },
    df: { status: "ativos" },
    painel: null,
    pf: { q: "", status: "ativos" },
  };

  const isManager = () => state.me && state.me.role === "gestor";
  const profile = (id) => state.profiles.find((p) => p.id === id);
  const project = (id) => state.projects.find((p) => p.id === id);
  const personName = (id) => (profile(id) ? profile(id).full_name || profile(id).email : "Sem responsável");
  const activePeople = () => state.profiles.filter((p) => p.active);

  function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "show" + (isError ? " error" : "");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = ""; }, isError ? 5000 : 2600);
  }

  async function refresh() {
    const d = await api.load();
    Object.assign(state, d, { loadedAt: Date.now() });
    state.me = state.profiles.find((p) => p.id === state.userId) || null;
    try { state.painel = await api.loadPainel(); } catch { state.painel = null; }
  }

  async function run(fn, okMsg) {
    try {
      await fn();
      await refresh();
      render();
      if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      toast(friendly(e), true);
      return false;
    }
  }

  // ------------------------------------------------------------------ autenticação
  async function enter(session) {
    if (state.screen === "app" && state.userId === session.user.id) return;
    state.userId = session.user.id;
    try {
      await refresh();
    } catch (e) {
      state.screen = "auth"; state.authMsg = friendly(e); render(); return;
    }
    if (!state.me || !state.me.active) {
      await api.signOut();
      state.screen = "auth";
      state.authMode = "login";
      state.authMsg = "Seu acesso não está ativo. Fale com a gestão do P&D.";
      render();
      return;
    }
    state.screen = "app";
    if (!location.hash || location.hash === "#") location.hash = "#/inicio";
    render();
  }

  function handleAuth(ev, session) {
    if (ev === "PASSWORD_RECOVERY") { state.screen = "recovery"; render(); return; }
    if (state.screen === "recovery") return;
    if (session) enter(session);
    else {
      Object.assign(state, { screen: "auth", userId: null, me: null, profiles: [], projects: [], tasks: [] });
      render();
    }
  }

  const brandHtml = (sub = "Projetos e tarefas") => `
    <div class="brand">
      <img class="brand-logo" src="logo-mineragro.svg" alt="Mineragro Pesquisa Agronômica" width="165" height="31">
      <span class="brand-div" aria-hidden="true"></span>
      <span class="brand-app"><span class="brand-name">P&amp;D Agronômico</span><span class="brand-sub">${esc(sub)}</span></span>
    </div>`;
  const footerHtml = () => `
    <footer class="site-foot"><div class="site-foot-inner">
      <img class="brand-logo light" src="logo-mineragro.svg" alt="Mineragro Pesquisa Agronômica" width="150" height="28">
      <span>Área restrita da equipe de P&amp;D Agronômico</span>
      <a href="${esc(SITE_URL)}" target="_top">Voltar ao site mineragro.com</a>
    </div></footer>`;
  const demoBanner = () => (DEMO ? `<div class="demo-banner">Modo demonstração: dados fictícios, nada é salvo.${CFG.SUPABASE_URL ? "" : " Configure o Supabase em <code>config.js</code> para usar de verdade."}</div>` : "");

  function renderAuth() {
    const m = state.authMode;
    const title = { login: "Entrar", signup: "Criar conta", forgot: "Recuperar senha" }[m];
    const body = {
      login: `
        <div class="field"><label for="email">E-mail corporativo</label><input class="input" id="email" type="email" autocomplete="username" required placeholder="nome.sobrenome@${esc(DOMAIN)}"></div>
        <div class="field"><label for="pw">Senha</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>`,
      signup: `
        <div class="field"><label for="name">Nome completo</label><input class="input" id="name" autocomplete="name" required maxlength="120"></div>
        <div class="field"><label for="email">E-mail corporativo</label><input class="input" id="email" type="email" autocomplete="username" required placeholder="nome.sobrenome@${esc(DOMAIN)}"></div>
        <div class="field"><label for="pw">Senha (mínimo 8 caracteres)</label><input class="input" id="pw" type="password" autocomplete="new-password" required minlength="8"></div>
        <div class="field"><label for="pw2">Repita a senha</label><input class="input" id="pw2" type="password" autocomplete="new-password" required minlength="8"></div>`,
      forgot: `
        <p class="hint">Enviaremos um link para você criar uma nova senha.</p>
        <div class="field"><label for="email">E-mail corporativo</label><input class="input" id="email" type="email" autocomplete="username" required placeholder="nome.sobrenome@${esc(DOMAIN)}"></div>`,
    }[m];
    const links = {
      login: `<button type="button" class="linkbtn" data-mode="forgot">Esqueci a senha</button>${ALLOW_SIGNUP ? `<button type="button" class="linkbtn" data-mode="signup">Criar conta</button>` : ""}`,
      signup: `<button type="button" class="linkbtn" data-mode="login">Já tenho conta</button>`,
      forgot: `<button type="button" class="linkbtn" data-mode="login">Voltar para entrar</button>`,
    }[m];
    $("#app").innerHTML = `${demoBanner()}
      <div class="auth-wrap">
        <form class="auth-card" id="authForm" novalidate>
          ${brandHtml()}
          <h1>${title}</h1>
          ${state.authMsg ? `<p class="notice">${esc(state.authMsg)}</p>` : ""}
          ${body}
          <p class="err" id="authErr" role="alert"></p>
          <button class="btn primary" type="submit">${{ login: "Entrar", signup: "Criar conta", forgot: "Enviar link" }[m]}</button>
          <div class="auth-links">${links}</div>
          ${m === "login" && !ALLOW_SIGNUP ? `<p class="hint">Acesso restrito à equipe Mineragro. Peça seu acesso à gestão do P&D.</p>` : ""}
        </form>
        <a class="auth-back" href="${esc(SITE_URL)}" target="_top">${icon("left")}Voltar ao site mineragro.com</a>
      </div>`;
    $$("[data-mode]").forEach((b) => b.addEventListener("click", () => { state.authMode = b.dataset.mode; state.authMsg = ""; renderAuth(); }));
    const f = $("#authForm");
    $("input", f)?.focus();
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#authErr");
      const btn = $("button[type=submit]", f);
      const email = $("#email").value.trim().toLowerCase();
      err.textContent = "";
      if (!emailOk(email)) { err.textContent = `Use seu e-mail @${DOMAIN}.`; return; }
      btn.disabled = true;
      try {
        if (m === "login") {
          const pw = $("#pw").value;
          if (!pw) { err.textContent = "Informe a senha."; return; }
          await api.signIn(email, pw);
        } else if (m === "signup") {
          const name = $("#name").value.trim();
          const pw = $("#pw").value;
          if (!name) { err.textContent = "Informe seu nome."; return; }
          if (pw.length < 8) { err.textContent = "A senha precisa ter pelo menos 8 caracteres."; return; }
          if (pw !== $("#pw2").value) { err.textContent = "As senhas não conferem."; return; }
          const r = await api.signUp(name, email, pw);
          if (!r || !r.session) {
            state.authMode = "login";
            state.authMsg = `Conta criada. Abra o e-mail enviado para ${email} e clique no link de confirmação; depois entre aqui.`;
            renderAuth();
          }
        } else {
          await api.resetPassword(email);
          state.authMode = "login";
          state.authMsg = `Se ${email} tiver conta, você receberá um link para criar nova senha.`;
          renderAuth();
        }
      } catch (ex) {
        err.textContent = friendly(ex);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function renderRecovery() {
    $("#app").innerHTML = `
      <div class="auth-wrap">
        <form class="auth-card" id="recForm">
          ${brandHtml()}
          <h1>Criar nova senha</h1>
          <div class="field"><label for="pw">Nova senha (mínimo 8 caracteres)</label><input class="input" id="pw" type="password" autocomplete="new-password" required minlength="8"></div>
          <div class="field"><label for="pw2">Repita a nova senha</label><input class="input" id="pw2" type="password" autocomplete="new-password" required minlength="8"></div>
          <p class="err" id="recErr" role="alert"></p>
          <button class="btn primary" type="submit">Salvar e entrar</button>
        </form>
      </div>`;
    $("#recForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = $("#pw").value;
      const err = $("#recErr");
      if (pw.length < 8) { err.textContent = "A senha precisa ter pelo menos 8 caracteres."; return; }
      if (pw !== $("#pw2").value) { err.textContent = "As senhas não conferem."; return; }
      try {
        await api.updatePassword(pw);
        history.replaceState(null, "", location.pathname + "#/inicio");
        state.screen = "boot";
        const s = await api.getSession();
        if (s) await enter(s); else handleAuth("SIGNED_OUT", null);
        toast("Senha alterada.");
      } catch (ex) { err.textContent = friendly(ex); }
    });
  }

  // ------------------------------------------------------------------ componentes
  function dueHtml(t) {
    if (!t.due_date) return `<span class="due">${icon("cal")}Sem prazo</span>`;
    const late = isOverdue(t);
    const today = t.due_date === todayISO() && t.status !== "concluida";
    return `<span class="due${late ? " late" : ""}">${icon("cal")}${late ? "Atrasada · " : today ? "Hoje · " : ""}${fmtDate(t.due_date)}</span>`;
  }
  const who = (id) => `<span class="who"><span class="avatar xs" aria-hidden="true">${esc(initials(profile(id)?.full_name))}</span>${esc(personName(id))}</span>`;
  const assigneesOf = (t) => t.assignees || [];
  const isMine = (t) => assigneesOf(t).includes(state.userId);
  // Até 2 nomes; acima disso, "Ana, Bruno +2".
  const whoMany = (ids) => {
    if (!ids || !ids.length) return `<span class="who"><span class="avatar xs" aria-hidden="true">?</span>Sem responsável</span>`;
    const names = ids.map((id) => profile(id)?.full_name || profile(id)?.email || "—");
    const shown = names.slice(0, 2).map((n) => n.split(/\s+/)[0]).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");
    return `<span class="who" title="${esc(names.join(", "))}"><span class="avatars" aria-hidden="true">${ids.slice(0, 3).map((id) => `<span class="avatar xs">${esc(initials(profile(id)?.full_name))}</span>`).join("")}</span>${esc(ids.length === 1 ? names[0] : shown)}</span>`;
  };

  function sortTasks(list) {
    return [...list].sort((a, b) => {
      const da = a.status === "concluida", db = b.status === "concluida";
      if (da !== db) return da ? 1 : -1;
      if (a.due_date !== b.due_date) return !a.due_date ? 1 : !b.due_date ? -1 : a.due_date.localeCompare(b.due_date);
      return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
    });
  }

  function taskList(list, { showProject = true, empty = "Nenhuma tarefa." } = {}) {
    if (!list.length) return `<div class="empty">${esc(empty)}</div>`;
    return `<ul class="tlist">${sortTasks(list).map((t) => `
      <li class="trow${t.status === "concluida" ? " done" : ""}">
        <input type="checkbox" class="check" data-toggle="${t.id}" ${t.status === "concluida" ? "checked" : ""} aria-label="Marcar “${esc(t.title)}” como concluída">
        <div>
          <button class="ttitle" data-task="${t.id}">${esc(t.title)}</button>
          <div class="tsub">${showProject ? `<span>${esc(project(t.project_id)?.code || project(t.project_id)?.name || "")}</span>` : ""}${whoMany(assigneesOf(t))}</div>
        </div>
        <div class="tright">
          ${t.status === "andamento" ? `<span class="badge b-andamento">Em andamento</span>` : ""}
          <span class="badge b-${t.priority}">${PRIORITY[t.priority]}</span>
          ${dueHtml(t)}
        </div>
      </li>`).join("")}</ul>`;
  }

  function taskBoard(list, { showProject = true } = {}) {
    return `<div class="board">${TASK_ORDER.map((st, i) => {
      const items = sortTasks(list.filter((t) => t.status === st));
      return `<section class="col" data-col="${st}" aria-label="${STATUS_TASK[st]}">
        <div class="col-head"><span>${STATUS_TASK[st]}</span><span class="badge b-${st}">${items.length}</span></div>
        ${items.map((t) => `
          <article class="kcard${isOverdue(t) ? " late" : ""}" draggable="true" data-drag="${t.id}">
            ${showProject ? `<span class="proj-name">${esc(project(t.project_id)?.code || project(t.project_id)?.name || "")}</span>` : ""}
            <button class="ttitle" data-task="${t.id}">${esc(t.title)}</button>
            <div class="tsub">${whoMany(assigneesOf(t))}</div>
            <div class="kfoot">
              <span>${dueHtml(t)}</span>
              <span class="kmove">
                <span class="badge b-${t.priority}">${PRIORITY[t.priority]}</span>
                ${i > 0 ? `<button class="btn ghost icon" data-move="${t.id}" data-to="${TASK_ORDER[i - 1]}" aria-label="Mover para ${STATUS_TASK[TASK_ORDER[i - 1]]}">${icon("left")}</button>` : ""}
                ${i < 2 ? `<button class="btn ghost icon" data-move="${t.id}" data-to="${TASK_ORDER[i + 1]}" aria-label="Mover para ${STATUS_TASK[TASK_ORDER[i + 1]]}">${icon("right")}</button>` : ""}
              </span>
            </div>
          </article>`).join("") || `<div class="empty">Vazio</div>`}
      </section>`;
    }).join("")}</div>`;
  }

  const modeToggle = (key) => `
    <div class="seg" role="group" aria-label="Modo de exibição">
      <button data-mode-set="${key}" data-val="lista" aria-pressed="${state[key] === "lista"}">${icon("list")}Lista</button>
      <button data-mode-set="${key}" data-val="quadro" aria-pressed="${state[key] === "quadro"}">${icon("board")}Quadro</button>
    </div>`;

  function progressOf(pid) {
    const ts = state.tasks.filter((t) => t.project_id === pid);
    const done = ts.filter((t) => t.status === "concluida").length;
    return { total: ts.length, done, open: ts.length - done, late: ts.filter(isOverdue).length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 };
  }

  // ------------------------------------------------------------------ páginas
  function pageHome() {
    const t0 = todayISO(), t7 = addDays(t0, 7);
    const open = state.tasks.filter((t) => t.status !== "concluida");
    const late = open.filter(isOverdue);
    const soon = open.filter((t) => t.due_date && t.due_date >= t0 && t.due_date <= t7);
    const mine = open.filter(isMine);
    const activeProj = state.projects.filter((p) => p.status === "andamento");
    const dateLong = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    return `
      <div class="page-head"><div><h1>Olá, ${esc(firstName(state.me.full_name))}</h1><p>${esc(dateLong)}</p></div>
        <div class="actions"><button class="btn primary" data-new-task>${icon("plus")}Nova tarefa</button></div></div>
      <div class="stats">
        <a class="card stat" href="#/projetos"><div class="n">${activeProj.length}</div><div class="l">Projetos em andamento</div></a>
        <a class="card stat" href="#/tarefas" data-preset="abertas"><div class="n">${open.length}</div><div class="l">Tarefas abertas</div></a>
        <a class="card stat${late.length ? " alert" : ""}" href="#/tarefas" data-preset="atrasadas"><div class="n">${late.length}</div><div class="l">Atrasadas</div></a>
        <a class="card stat" href="#/tarefas" data-preset="minhas"><div class="n">${mine.length}</div><div class="l">Minhas tarefas abertas</div></a>
      </div>
      <div class="cols-2">
        <section class="card"><div class="card-pad" style="padding-bottom:4px"><h2>Minhas tarefas</h2></div>${taskList(mine, { empty: "Nenhuma tarefa aberta com você." })}</section>
        <section class="card"><div class="card-pad" style="padding-bottom:4px"><h2>Atrasadas e próximos 7 dias (equipe)</h2></div>${taskList([...late, ...soon], { empty: "Nada atrasado nem vencendo nesta semana." })}</section>
      </div>`;
  }

  function pageProjects() {
    const q = state.pf.q.toLowerCase();
    let list = state.projects.filter((p) =>
      (state.pf.status === "todos" || (state.pf.status === "ativos" ? p.status !== "concluido" : p.status === state.pf.status)) &&
      (!q || [p.code, p.name, p.crop, p.client, p.location].join(" ").toLowerCase().includes(q)));
    return `
      <div class="page-head"><div><h1>Projetos</h1><p>Experimentos e projetos do P&D Agronômico</p></div>
        <div class="actions">${isManager() ? `<button class="btn primary" data-new-project>${icon("plus")}Novo projeto</button>` : ""}</div></div>
      <div class="toolbar">
        <input class="input search" type="search" placeholder="Buscar por código, nome, cultura, cliente…" value="${esc(state.pf.q)}" data-pf="q" aria-label="Buscar projetos">
        <select class="input" data-pf="status" aria-label="Situação do projeto">
          ${[["ativos", "Ativos"], ["todos", "Todos"], ...Object.entries(STATUS_PROJ)].map(([v, l]) => `<option value="${v}" ${state.pf.status === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
      ${list.length ? `<div class="grid">${list.map((p) => {
        const g = progressOf(p.id);
        return `<a class="card proj" href="#/projetos/${p.id}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="code">${esc(p.code || "")}</span><span class="badge b-${p.status}">${STATUS_PROJ[p.status]}</span></div>
          <h3>${esc(p.name)}</h3>
          <div class="meta">${esc([p.crop, p.client].filter((x) => x && x !== "—").join(" · ") || "—")}</div>
          <div class="meta">${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}</div>
          <div class="progress" role="img" aria-label="${g.pct}% concluído"><span style="width:${g.pct}%"></span></div>
          <div class="proj-foot"><span>${g.done}/${g.total} tarefas${g.late ? ` · <strong style="color:var(--red)">${g.late} atrasada${g.late > 1 ? "s" : ""}</strong>` : ""}</span>${p.owner_id ? who(p.owner_id) : ""}</div>
        </a>`;
      }).join("")}</div>` : `<div class="card empty">${state.projects.length ? "Nenhum projeto com esses filtros." : isManager() ? "Nenhum projeto ainda. Clique em “Novo projeto”." : "Nenhum projeto ainda."}</div>`}`;
  }

  function pageProject(id) {
    const p = project(id);
    if (!p) return `<a class="back" href="#/projetos">${icon("left")}Projetos</a><div class="card empty">Projeto não encontrado.</div>`;
    const g = progressOf(p.id);
    const tasks = state.tasks.filter((t) => t.project_id === p.id);
    return `
      <a class="back" href="#/projetos">${icon("left")}Projetos</a>
      <div class="page-head">
        <div><p>${esc(p.code || "")}</p><h1>${esc(p.name)}</h1></div>
        <div class="actions">
          ${isManager() ? `<button class="btn" data-edit-project="${p.id}">${icon("edit")}Editar</button><button class="btn danger" data-del-project="${p.id}">${icon("trash")}Excluir</button>` : ""}
          <button class="btn primary" data-new-task="${p.id}">${icon("plus")}Nova tarefa</button>
        </div>
      </div>
      <section class="card card-pad" style="margin-bottom:16px">
        <dl class="info-grid" style="margin:0">
          <div><dt>Situação</dt><dd><span class="badge b-${p.status}">${STATUS_PROJ[p.status]}</span></dd></div>
          <div><dt>Responsável</dt><dd>${p.owner_id ? who(p.owner_id) : "—"}</dd></div>
          <div><dt>Cultura</dt><dd>${esc(p.crop || "—")}</dd></div>
          <div><dt>Cliente</dt><dd>${esc(p.client || "—")}</dd></div>
          <div><dt>Local</dt><dd>${esc(p.location || "—")}</dd></div>
          <div><dt>Período</dt><dd>${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}</dd></div>
          <div><dt>Progresso</dt><dd>${g.done}/${g.total} tarefas (${g.pct}%)${g.late ? ` · <span style="color:var(--red);font-weight:600">${g.late} atrasada${g.late > 1 ? "s" : ""}</span>` : ""}</dd></div>
        </dl>
        <div class="progress" style="margin-top:12px"><span style="width:${g.pct}%"></span></div>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
      </section>
      <div class="toolbar"><h2 style="margin:0;font-size:18px;flex:1">Tarefas</h2>${modeToggle("projMode")}</div>
      ${state.projMode === "quadro" ? taskBoard(tasks, { showProject: false }) : `<section class="card">${taskList(tasks, { showProject: false, empty: "Nenhuma tarefa neste projeto." })}</section>`}`;
  }

  function filteredTasks() {
    const f = state.tf, q = f.q.toLowerCase();
    return state.tasks.filter((t) => {
      if (f.project && t.project_id !== f.project) return false;
      if (f.who === "me" && !isMine(t)) return false;
      if (f.who === "none" && assigneesOf(t).length) return false;
      if (f.who && !["me", "none"].includes(f.who) && !assigneesOf(t).includes(f.who)) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.status === "abertas" && t.status === "concluida") return false;
      if (f.status === "atrasadas" && !isOverdue(t)) return false;
      if (STATUS_TASK[f.status] && t.status !== f.status) return false;
      if (q && !(t.title + " " + (t.description || "") + " " + (project(t.project_id)?.name || "") + " " + (project(t.project_id)?.code || "")).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function pageTasks() {
    const f = state.tf;
    const list = filteredTasks();
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`;
    return `
      <div class="page-head"><div><h1>Tarefas</h1><p>${list.length} tarefa${list.length === 1 ? "" : "s"} com os filtros atuais</p></div>
        <div class="actions">${modeToggle("taskMode")}<button class="btn primary" data-new-task>${icon("plus")}Nova tarefa</button></div></div>
      <div class="toolbar">
        <input class="input search" type="search" placeholder="Buscar tarefa…" value="${esc(f.q)}" data-tf="q" aria-label="Buscar tarefas">
        <select class="input" data-tf="project" aria-label="Projeto">${opt("", "Todos os projetos", f.project)}${state.projects.map((p) => opt(p.id, (p.code ? p.code + " · " : "") + p.name, f.project)).join("")}</select>
        <select class="input" data-tf="who" aria-label="Responsável">${opt("", "Todos", f.who)}${opt("me", "Minhas", f.who)}${opt("none", "Sem responsável", f.who)}${state.profiles.map((p) => opt(p.id, p.full_name || p.email, f.who)).join("")}</select>
        <select class="input" data-tf="status" aria-label="Situação">${opt("abertas", "Abertas", f.status)}${opt("atrasadas", "Atrasadas", f.status)}${Object.entries(STATUS_TASK).map(([v, l]) => opt(v, l, f.status)).join("")}${opt("todas", "Todas", f.status)}</select>
        <select class="input" data-tf="priority" aria-label="Prioridade">${opt("", "Qualquer prioridade", f.priority)}${Object.entries(PRIORITY).map(([v, l]) => opt(v, l, f.priority)).join("")}</select>
      </div>
      ${state.taskMode === "quadro" ? taskBoard(list) : `<section class="card">${taskList(list, { empty: "Nenhuma tarefa com esses filtros." })}</section>`}`;
  }

  // ------------------------------------------------------------------ painel
  // Mesmo formato da view painel_projetos, para a demonstração (e se a view falhar).
  function painelLocal() {
    const t0 = todayISO();
    return {
      projetos: state.projects.map((p) => {
        const ts = state.tasks.filter((t) => t.project_id === p.id);
        const n = (st) => ts.filter((t) => t.status === st).length;
        const next = ts.filter((t) => t.status !== "concluida" && t.due_date && t.due_date >= t0).map((t) => t.due_date).sort()[0] || null;
        return {
          id: p.id, codigo: p.code, projeto: p.name, situacao: p.status, cultura: p.crop, cliente: p.client, local: p.location,
          inicio: p.start_date, termino: p.end_date, responsavel_id: p.owner_id, responsavel: profile(p.owner_id)?.full_name || null,
          tarefas: ts.length, a_fazer: n("a_fazer"), em_andamento: n("andamento"), concluidas: n("concluida"),
          atrasadas: ts.filter(isOverdue).length, pct_concluido: ts.length ? Math.round((100 * n("concluida")) / ts.length) : 0, proxima_entrega: next,
        };
      }),
    };
  }

  function painelData() {
    const f = state.df.status;
    const base = (state.painel && state.painel.projetos) || painelLocal().projetos;
    const projetos = base
      .filter((p) => f === "todos" || (f === "ativos" ? p.situacao !== "concluido" : p.situacao === f))
      .sort((a, b) => (b.atrasadas - a.atrasadas) || String(a.codigo || a.projeto).localeCompare(String(b.codigo || b.projeto), "pt-BR"));
    const ids = new Set(projetos.map((p) => p.id));
    const tasks = state.tasks.filter((t) => ids.has(t.project_id));
    const t0 = todayISO(), t7 = addDays(t0, 7), d30 = Date.now() - 30 * 864e5;
    const pessoas = state.profiles.filter((p) => p.active).map((p) => {
      const mine = tasks.filter((t) => assigneesOf(t).includes(p.id));
      const open = mine.filter((t) => t.status !== "concluida");
      return {
        id: p.id, pessoa: p.full_name || p.email, email: p.email, abertas: open.length, atrasadas: open.filter(isOverdue).length,
        proximos_7_dias: open.filter((t) => t.due_date && t.due_date >= t0 && t.due_date <= t7).length,
        concluidas_30_dias: mine.filter((t) => t.status === "concluida" && t.done_at && new Date(t.done_at).getTime() >= d30).length,
      };
    }).sort((a, b) => b.abertas - a.abertas || b.atrasadas - a.atrasadas || a.pessoa.localeCompare(b.pessoa, "pt-BR"));
    const tot = { a_fazer: 0, andamento: 0, concluida: 0 };
    tasks.forEach((t) => { tot[t.status] = (tot[t.status] || 0) + 1; });
    return { projetos, pessoas, tasks, tot, total: tasks.length, late: tasks.filter(isOverdue), t0 };
  }

  const STATUS_FILTERS = [["ativos", "Projetos ativos"], ["todos", "Todos os projetos"], ...Object.entries(STATUS_PROJ)];
  const pctOf = (n, total) => (total ? Math.round((100 * n) / total) : 0);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function segBar(parts, { tall = false, label = "" } = {}) {
    const total = parts.reduce((a, p) => a + p.n, 0);
    if (!total) return `<div class="seg-empty">Sem tarefas</div>`;
    const name = label + ": " + parts.map((p) => `${p.label} ${p.n} (${pctOf(p.n, total)}%)`).join(", ");
    return `<div class="segbar${tall ? " tall" : ""}" role="img" aria-label="${esc(name)}">${parts.filter((p) => p.n > 0).map((p) => {
      const pct = pctOf(p.n, total);
      return `<span class="seg-part ${p.cls}" style="flex-grow:${p.n}" data-tip="${esc(`${p.label}: ${plural(p.n, "tarefa", "tarefas")} (${pct}%)`)}" tabindex="${tall ? 0 : -1}">${tall && pct >= 9 ? `${pct}%` : ""}</span>`;
    }).join("")}</div>`;
  }
  const statusParts = (a, b, c) => [
    { label: "Concluída", n: c, cls: "st-done" },
    { label: "Em andamento", n: b, cls: "st-doing" },
    { label: "A fazer", n: a, cls: "st-todo" },
  ];
  const statusLegend = () => `<div class="legend" aria-hidden="true"><span><i class="sw st-done"></i>Concluída</span><span><i class="sw st-doing"></i>Em andamento</span><span><i class="sw st-todo"></i>A fazer</span></div>`;

  function pageDashboard() {
    const d = painelData();
    const ativos = d.projetos.filter((p) => p.situacao === "andamento").length;
    const open = d.total - d.tot.concluida;
    const t14 = addDays(d.t0, 14);
    const soon = d.tasks.filter((t) => t.status !== "concluida" && t.due_date && t.due_date >= d.t0 && t.due_date <= t14);
    const maxOpen = Math.max(1, ...d.pessoas.map((p) => p.abertas));
    const filterLabel = STATUS_FILTERS.find(([v]) => v === state.df.status)?.[1] || "";
    const geradoEm = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    return `
      <div class="print-head" aria-hidden="true">
        <img src="logo-mineragro.svg" alt="" height="28">
        <div><strong>Painel de projetos · P&amp;D Agronômico</strong><br><span>${esc(filterLabel)} · gerado em ${esc(geradoEm)} por ${esc(state.me.full_name || state.me.email)}</span></div>
      </div>
      <div class="page-head"><div><h1>Painel de projetos</h1><p>Situação dos experimentos e da equipe em ${fmtDate(d.t0)}</p></div>
        <div class="actions no-print">
          <button class="btn" data-export="pdf">${icon("printer")}Exportar PDF</button>
          <button class="btn primary" data-export="xlsx">${icon("sheet")}Exportar Excel</button>
        </div></div>
      <div class="toolbar no-print">
        <select class="input" data-df="status" aria-label="Quais projetos entram no painel">${STATUS_FILTERS.map(([v, l]) => `<option value="${v}" ${state.df.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${EMBED ? `<span class="hint">Se a exportação não abrir aqui dentro do site, use o <a href="${esc((APP_URL || location.href.split("#")[0]) + "#/painel")}" target="_blank" rel="noopener">painel em tela cheia</a>.</span>` : ""}
      </div>

      <div class="stats">
        <div class="card stat"><div class="n">${d.projetos.length}</div><div class="l">${plural(d.projetos.length, "projeto", "projetos")} no painel · ${ativos} em andamento</div></div>
        <div class="card stat"><div class="n">${open}</div><div class="l">Tarefas abertas</div></div>
        <div class="card stat${d.late.length ? " alert" : ""}"><div class="n">${d.late.length}</div><div class="l">${d.late.length ? `${icon("cal")} ` : ""}Atrasadas</div></div>
        <div class="card stat"><div class="n">${pctOf(d.tot.concluida, d.total)}%</div><div class="l">Concluído · ${d.tot.concluida} de ${plural(d.total, "tarefa", "tarefas")}</div></div>
      </div>

      <section class="card card-pad dash-block">
        <h2>Situação geral das tarefas</h2>
        ${segBar(statusParts(d.tot.a_fazer, d.tot.andamento, d.tot.concluida), { tall: true, label: "Situação geral" })}
        <div class="legend-row">${statusLegend()}<span class="hint">${d.late.length ? `<strong class="late-txt">${plural(d.late.length, "tarefa atrasada", "tarefas atrasadas")}</strong> entre as abertas` : "Nenhuma tarefa atrasada"}</span></div>
      </section>

      <section class="card dash-block">
        <div class="card-pad dash-head"><h2>Projetos</h2>${statusLegend()}</div>
        <div class="table-wrap"><table class="table dash-table">
          <thead><tr><th>Projeto</th><th>Situação</th><th class="hide-sm">Responsável</th><th class="hide-sm">Período</th><th class="col-prog">Progresso das tarefas</th><th class="num">Atrasadas</th><th>Próxima entrega</th></tr></thead>
          <tbody>${d.projetos.map((p) => `
            <tr>
              <td><a href="#/projetos/${esc(p.id)}" class="proj-link">${p.codigo ? `<span class="code">${esc(p.codigo)}</span> ` : ""}${esc(p.projeto)}</a><div class="hint">${esc([p.cultura, p.cliente].filter((x) => x && x !== "—").join(" · "))}</div></td>
              <td><span class="badge b-${esc(p.situacao)}">${STATUS_PROJ[p.situacao] || esc(p.situacao)}</span></td>
              <td class="hide-sm">${esc(p.responsavel || "—")}</td>
              <td class="hide-sm nowrap">${fmtDate(p.inicio)} → ${fmtDate(p.termino)}</td>
              <td class="col-prog"><div class="prog-cell">${segBar(statusParts(p.a_fazer, p.em_andamento, p.concluidas), { label: p.projeto })}<span class="num">${p.pct_concluido}%</span></div><div class="hint">${p.concluidas}/${plural(p.tarefas, "tarefa", "tarefas")}</div></td>
              <td class="num">${p.atrasadas ? `<strong class="late-txt">${p.atrasadas}</strong>` : "0"}</td>
              <td class="nowrap">${p.proxima_entrega ? fmtDate(p.proxima_entrega) : "—"}</td>
            </tr>`).join("") || `<tr><td colspan="7" class="empty">Nenhum projeto com esse filtro.</td></tr>`}</tbody>
        </table></div>
      </section>

      <div class="cols-2">
        <section class="card card-pad dash-block">
          <h2>Tarefas abertas por pessoa</h2>
          <p class="hint" style="margin-bottom:10px">Uma tarefa com vários responsáveis conta para cada um.</p>
          ${d.pessoas.length ? `<ul class="meter-list">${d.pessoas.map((p) => `
            <li>
              <span class="m-name">${esc(p.pessoa)}</span>
              <span class="m-track" data-tip="${esc(`${p.pessoa}: ${plural(p.abertas, "aberta", "abertas")}, ${plural(p.atrasadas, "atrasada", "atrasadas")}, ${p.proximos_7_dias} nos próximos 7 dias`)}"><span class="m-fill" style="width:${(100 * p.abertas) / maxOpen}%"></span></span>
              <span class="m-val num">${p.abertas}</span>
              <span class="m-late">${p.atrasadas ? `<strong class="late-txt">${plural(p.atrasadas, "atrasada", "atrasadas")}</strong>` : ""}</span>
            </li>`).join("")}</ul>` : `<div class="empty">Ninguém na equipe ainda.</div>`}
        </section>
        <section class="card dash-block">
          <div class="card-pad" style="padding-bottom:4px"><h2>Entregas dos próximos 14 dias</h2></div>
          ${taskList(soon, { empty: "Nenhuma entrega nos próximos 14 dias." })}
        </section>
      </div>`;
  }

  // ------------------------------------------------------------------ exportação
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const el = document.createElement("script");
      el.src = src; el.onload = resolve; el.onerror = () => reject(new Error("Não foi possível carregar o gerador de Excel. Verifique a internet."));
      document.head.appendChild(el);
    });
  }

  async function exportExcel() {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const X = window.XLSX;
    const d = painelData();
    const dt = (iso) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00") : null);
    const filterLabel = STATUS_FILTERS.find(([v]) => v === state.df.status)?.[1] || "";
    const sheet = (rows, widths) => {
      const ws = X.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: "dd/mm/yyyy" });
      ws["!cols"] = widths.map((w) => ({ wch: w }));
      if (rows.length > 1) ws["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
      return ws;
    };
    const wb = X.utils.book_new();
    const resumo = X.utils.aoa_to_sheet([
      ["Painel de projetos — Mineragro P&D Agronômico"],
      ["Gerado em", new Date().toLocaleString("pt-BR"), "por", state.me.full_name || state.me.email],
      ["Filtro", filterLabel],
      [],
      ["Indicador", "Valor"],
      ["Projetos no painel", d.projetos.length],
      ["Projetos em andamento", d.projetos.filter((p) => p.situacao === "andamento").length],
      ["Tarefas", d.total],
      ["A fazer", d.tot.a_fazer],
      ["Em andamento", d.tot.andamento],
      ["Concluídas", d.tot.concluida],
      ["Atrasadas", d.late.length],
      ["% concluído", d.total ? d.tot.concluida / d.total : 0],
    ]);
    resumo["!cols"] = [{ wch: 26 }, { wch: 22 }, { wch: 6 }, { wch: 28 }];
    if (resumo.B13) resumo.B13.z = "0%";
    X.utils.book_append_sheet(wb, resumo, "Resumo");
    X.utils.book_append_sheet(wb, sheet([
      ["Código", "Projeto", "Situação", "Cultura", "Cliente", "Local", "Responsável", "Início", "Término", "Tarefas", "A fazer", "Em andamento", "Concluídas", "Atrasadas", "% concluído", "Próxima entrega"],
      ...d.projetos.map((p) => [p.codigo || "", p.projeto, STATUS_PROJ[p.situacao] || p.situacao, p.cultura || "", p.cliente || "", p.local || "", p.responsavel || "", dt(p.inicio), dt(p.termino), p.tarefas, p.a_fazer, p.em_andamento, p.concluidas, p.atrasadas, p.pct_concluido / 100, dt(p.proxima_entrega)]),
    ], [10, 40, 14, 12, 18, 26, 20, 12, 12, 8, 8, 13, 11, 10, 12, 15]), "Projetos");
    X.utils.book_append_sheet(wb, sheet([
      ["Pessoa", "E-mail", "Abertas", "Atrasadas", "Próximos 7 dias", "Concluídas (30 dias)"],
      ...d.pessoas.map((p) => [p.pessoa, p.email, p.abertas, p.atrasadas, p.proximos_7_dias, p.concluidas_30_dias]),
    ], [24, 32, 9, 10, 15, 19]), "Pessoas");
    X.utils.book_append_sheet(wb, sheet([
      ["Código", "Projeto", "Tarefa", "Responsáveis", "Executar em", "Prioridade", "Situação", "Atrasada", "Concluída em", "Detalhes"],
      ...sortTasks(d.tasks).map((t) => {
        const p = project(t.project_id);
        return [p?.code || "", p?.name || "", t.title, assigneesOf(t).map((id) => profile(id)?.full_name || profile(id)?.email).join(", "), dt(t.due_date), PRIORITY[t.priority], STATUS_TASK[t.status], isOverdue(t) ? "Sim" : "Não", t.done_at ? new Date(t.done_at) : null, t.description || ""];
      }),
    ], [10, 36, 36, 28, 12, 10, 13, 9, 13, 40]), "Tarefas");
    // % como porcentagem na aba Projetos
    const wsP = wb.Sheets.Projetos;
    for (let r = 2; r <= d.projetos.length + 1; r++) if (wsP["O" + r]) wsP["O" + r].z = "0%";
    X.writeFile(wb, `painel-projetos-pd-${todayISO()}.xlsx`);
  }

  function pageTeam() {
    const openCount = (id) => state.tasks.filter((t) => assigneesOf(t).includes(id) && t.status !== "concluida").length;
    return `
      <div class="page-head"><div><h1>Equipe</h1><p>${state.profiles.filter((p) => p.active).length} pessoas com acesso</p></div></div>
      ${isManager() ? `<p class="notice" style="margin-bottom:14px">${ALLOW_SIGNUP
        ? `Para incluir alguém: peça para a pessoa abrir o sistema, clicar em “Criar conta” e usar o e-mail @${esc(DOMAIN)}. Ela entra como equipe; aqui você pode torná-la gestora ou desativar o acesso.`
        : `Para incluir alguém: no painel do Supabase, em Authentication → Users → Add user, cadastre o e-mail @${esc(DOMAIN)}. Ela aparece aqui como equipe.`}</p>` : ""}
      <section class="card" style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Nome</th><th class="hide-sm">E-mail</th><th>Papel</th><th>Acesso</th><th class="hide-sm">Tarefas abertas</th>${isManager() ? "<th></th>" : ""}</tr></thead>
          <tbody>${state.profiles.map((p) => `
            <tr>
              <td><span class="who"><span class="avatar xs" aria-hidden="true">${esc(initials(p.full_name))}</span>${esc(p.full_name || "—")}</span></td>
              <td class="hide-sm muted">${esc(p.email)}</td>
              <td>${p.role === "gestor" ? "Gestão" : "Equipe"}</td>
              <td>${p.active ? `<span class="badge b-concluida">Ativo</span>` : `<span class="badge">Desativado</span>`}</td>
              <td class="hide-sm">${openCount(p.id)}</td>
              ${isManager() ? `<td>${p.id !== state.userId ? `<button class="btn sm" data-edit-person="${p.id}">${icon("edit")}Editar</button>` : `<span class="hint">Você</span>`}</td>` : ""}
            </tr>`).join("")}</tbody>
        </table>
      </section>`;
  }

  // ------------------------------------------------------------------ modais
  const modal = () => $("#modal");
  function openModal(title, body, foot, onSubmit) {
    const m = modal();
    m.innerHTML = `<form method="dialog" id="mform" novalidate>
      <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="btn ghost icon" data-close aria-label="Fechar">${icon("x")}</button></div>
      <div class="modal-body">${body}<p class="err" id="merr" role="alert"></p></div>
      <div class="modal-foot">${foot}</div></form>`;
    $("[data-close]", m).addEventListener("click", () => m.close());
    $$("[data-cancel]", m).forEach((b) => b.addEventListener("click", () => m.close()));
    $("#mform", m).addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("button[type=submit]", m);
      if (btn) btn.disabled = true;
      try {
        const done = await onSubmit(new FormData(e.target), (msg) => { $("#merr", m).textContent = msg; });
        if (done) m.close();
      } finally { if (btn) btn.disabled = false; }
    });
    m.showModal();
    const first = $(".modal-body .input", m);
    if (first) first.focus();
    return m;
  }
  const val = (fd, k) => { const v = String(fd.get(k) ?? "").trim(); return v === "" ? null : v; };
  const options = (pairs, cur) => pairs.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("");
  const peopleOpts = (cur, emptyLabel) => options([["", emptyLabel], ...state.profiles.filter((p) => p.active || p.id === cur).map((p) => [p.id, p.full_name || p.email])], cur);

  function taskModal(id, presetProject) {
    const t = id ? state.tasks.find((x) => x.id === id) : { project_id: presetProject || state.tf.project || "", priority: "media", status: "a_fazer", assignees: [] };
    if (!t) return;
    if (!state.projects.length) { toast(isManager() ? "Crie um projeto antes de cadastrar tarefas." : "Ainda não há projetos. Peça à gestão para criar um.", true); return; }
    const canDelete = id && (isManager() || t.created_by === state.userId);
    const body = `
      <div class="form-grid">
        <div class="field full"><label for="f-title">Tarefa *</label><input class="input" id="f-title" name="title" required maxlength="200" value="${esc(t.title || "")}" placeholder="Ex.: Aplicação A — V4"></div>
        <div class="field full"><label for="f-proj">Projeto *</label><select class="input" id="f-proj" name="project_id" required>${options([["", "Selecione…"], ...state.projects.map((p) => [p.id, (p.code ? p.code + " · " : "") + p.name])], t.project_id)}</select></div>
        <fieldset class="field full people-pick">
          <legend>Responsáveis</legend>
          <div class="chips">${state.profiles.filter((p) => p.active || assigneesOf(t).includes(p.id)).map((p) => `
            <label class="chip"><input type="checkbox" name="assignees" value="${esc(p.id)}" ${assigneesOf(t).includes(p.id) ? "checked" : ""}><span class="avatar xs" aria-hidden="true">${esc(initials(p.full_name))}</span>${esc(p.full_name || p.email)}${p.id === state.userId ? " (você)" : ""}</label>`).join("")}
          </div>
          <p class="hint">Cada responsável recebe um e-mail ao ser incluído e outro no dia da execução.</p>
        </fieldset>
        <div class="field"><label for="f-due">Executar em</label><input class="input" id="f-due" type="date" name="due_date" value="${esc(t.due_date || "")}"></div>
        <div class="field"><label for="f-prio">Prioridade</label><select class="input" id="f-prio" name="priority">${options(Object.entries(PRIORITY), t.priority)}</select></div>
        <div class="field"><label for="f-st">Situação</label><select class="input" id="f-st" name="status">${options(Object.entries(STATUS_TASK), t.status)}</select></div>
        <div class="field full"><label for="f-desc">Detalhes</label><textarea class="input" id="f-desc" name="description" maxlength="4000" placeholder="Produtos, doses, parcelas, observações…">${esc(t.description || "")}</textarea></div>
      </div>
      ${id ? `<p class="hint">Criada por ${esc(personName(t.created_by))} em ${fmtDateTime(t.created_at)}${t.status === "concluida" && t.done_at ? ` · Concluída por ${esc(personName(t.done_by))} em ${fmtDateTime(t.done_at)}` : ""}</p>` : ""}`;
    const foot = `${canDelete ? `<button type="button" class="btn danger" data-del-task>${icon("trash")}Excluir</button>` : ""}
      <div class="right"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div>`;
    const m = openModal(id ? "Editar tarefa" : "Nova tarefa", body, foot, async (fd, setErr) => {
      const row = { title: val(fd, "title"), project_id: val(fd, "project_id"), assignees: fd.getAll("assignees").map(String), due_date: val(fd, "due_date"), priority: val(fd, "priority"), status: val(fd, "status"), description: val(fd, "description") };
      if (!row.title) return setErr("Informe a tarefa."), false;
      if (!row.project_id) return setErr("Escolha o projeto."), false;
      if (id) row.id = id;
      return run(() => api.saveTask(row), id ? "Tarefa salva." : "Tarefa criada.");
    });
    const del = $("[data-del-task]", m);
    if (del) del.addEventListener("click", async () => {
      if (!confirm(`Excluir a tarefa “${t.title}”? Não dá para desfazer.`)) return;
      if (await run(() => api.deleteTask(id), "Tarefa excluída.")) m.close();
    });
  }

  function projectModal(id) {
    const p = id ? project(id) : { status: "planejado", owner_id: "" };
    const body = `
      <div class="form-grid">
        <div class="field"><label for="p-code">Código</label><input class="input" id="p-code" name="code" maxlength="40" value="${esc(p.code || "")}" placeholder="Ex.: TV-173"></div>
        <div class="field"><label for="p-st">Situação</label><select class="input" id="p-st" name="status">${options(Object.entries(STATUS_PROJ), p.status)}</select></div>
        <div class="field full"><label for="p-name">Nome do projeto *</label><input class="input" id="p-name" name="name" required maxlength="200" value="${esc(p.name || "")}" placeholder="Ex.: Eficiência de fertilizante foliar em soja"></div>
        <div class="field"><label for="p-crop">Cultura</label><input class="input" id="p-crop" name="crop" maxlength="120" value="${esc(p.crop || "")}"></div>
        <div class="field"><label for="p-client">Cliente</label><input class="input" id="p-client" name="client" maxlength="200" value="${esc(p.client || "")}"></div>
        <div class="field full"><label for="p-loc">Local</label><input class="input" id="p-loc" name="location" maxlength="200" value="${esc(p.location || "")}" placeholder="Fazenda, município/UF ou laboratório"></div>
        <div class="field"><label for="p-start">Início</label><input class="input" id="p-start" type="date" name="start_date" value="${esc(p.start_date || "")}"></div>
        <div class="field"><label for="p-end">Término previsto</label><input class="input" id="p-end" type="date" name="end_date" value="${esc(p.end_date || "")}"></div>
        <div class="field full"><label for="p-owner">Responsável</label><select class="input" id="p-owner" name="owner_id">${peopleOpts(p.owner_id, "Sem responsável")}</select></div>
        <div class="field full"><label for="p-desc">Descrição</label><textarea class="input" id="p-desc" name="description" maxlength="4000" placeholder="Objetivo, delineamento, tratamentos…">${esc(p.description || "")}</textarea></div>
      </div>`;
    const foot = `<div class="right"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div>`;
    openModal(id ? "Editar projeto" : "Novo projeto", body, foot, async (fd, setErr) => {
      const row = { code: val(fd, "code"), name: val(fd, "name"), status: val(fd, "status"), crop: val(fd, "crop"), client: val(fd, "client"), location: val(fd, "location"), start_date: val(fd, "start_date"), end_date: val(fd, "end_date"), owner_id: val(fd, "owner_id"), description: val(fd, "description") };
      if (!row.name) return setErr("Informe o nome do projeto."), false;
      if (row.start_date && row.end_date && row.end_date < row.start_date) return setErr("O término não pode ser antes do início."), false;
      if (id) row.id = id;
      let saved;
      const ok = await run(async () => { saved = await api.saveProject(row); }, id ? "Projeto salvo." : "Projeto criado.");
      if (ok && !id && saved) location.hash = "#/projetos/" + saved.id;
      return ok;
    });
  }

  function personModal(id) {
    const p = profile(id);
    const body = `
      <div class="field"><label for="u-name">Nome</label><input class="input" id="u-name" name="full_name" maxlength="120" value="${esc(p.full_name || "")}"></div>
      <p class="hint">${esc(p.email)}</p>
      <div class="form-grid">
        <div class="field"><label for="u-role">Papel</label><select class="input" id="u-role" name="role">${options([["equipe", "Equipe"], ["gestor", "Gestão"]], p.role)}</select></div>
        <div class="field"><label for="u-act">Acesso</label><select class="input" id="u-act" name="active">${options([["true", "Ativo"], ["false", "Desativado"]], String(p.active))}</select></div>
      </div>
      <p class="hint">Gestão cria e edita projetos e a equipe. Desativado não consegue entrar; o histórico das tarefas é mantido.</p>`;
    const foot = `<div class="right"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div>`;
    openModal("Editar pessoa", body, foot, async (fd) =>
      run(() => api.saveProfile(id, { full_name: val(fd, "full_name") || "", role: val(fd, "role"), active: val(fd, "active") === "true" }), "Pessoa atualizada."));
  }

  function accountModal() {
    const body = `
      <div class="field"><label for="a-name">Seu nome</label><input class="input" id="a-name" name="full_name" maxlength="120" value="${esc(state.me.full_name || "")}"></div>
      <p class="hint">${esc(state.me.email)} · ${state.me.role === "gestor" ? "Gestão" : "Equipe"}</p>
      <div class="form-grid">
        <div class="field"><label for="a-pw">Nova senha (opcional)</label><input class="input" id="a-pw" type="password" name="pw" autocomplete="new-password" minlength="8"></div>
        <div class="field"><label for="a-pw2">Repita a nova senha</label><input class="input" id="a-pw2" type="password" name="pw2" autocomplete="new-password" minlength="8"></div>
      </div>`;
    const foot = `<button type="button" class="btn danger" data-logout>${icon("out")}Sair</button><div class="right"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div>`;
    const m = openModal("Minha conta", body, foot, async (fd, setErr) => {
      const pw = String(fd.get("pw") || "");
      if (pw && pw.length < 8) return setErr("A senha precisa ter pelo menos 8 caracteres."), false;
      if (pw && pw !== String(fd.get("pw2") || "")) return setErr("As senhas não conferem."), false;
      return run(async () => {
        await api.saveProfile(state.userId, { full_name: val(fd, "full_name") || "" });
        if (pw) await api.updatePassword(pw);
      }, pw ? "Dados e senha atualizados." : "Dados atualizados.");
    });
    $("[data-logout]", m).addEventListener("click", () => { m.close(); api.signOut(); });
  }

  // ------------------------------------------------------------------ estrutura e rotas
  function route() {
    const parts = (location.hash.replace(/^#\/?/, "") || "inicio").split("/");
    return { page: parts[0], id: parts[1] };
  }

  function renderApp() {
    const r = route();
    const navItem = (href, page, label, ic) => `<a href="#/${href}" ${r.page === page ? 'aria-current="page"' : ""}>${icon(ic)}${label}</a>`;
    const views = { inicio: pageHome, projetos: () => (r.id ? pageProject(r.id) : pageProjects()), tarefas: pageTasks, equipe: pageTeam, painel: pageDashboard };
    if (r.page === "tarefas" && r.id && !modal().open) {
      setTimeout(() => {
        if (state.tasks.some((x) => x.id === r.id)) taskModal(r.id);
        else toast("Tarefa não encontrada. Ela pode ter sido excluída.", true);
        history.replaceState(null, "", location.pathname + location.search + "#/tarefas");
      }, 0);
    }
    const view = views[r.page] || pageHome;
    $("#app").innerHTML = `${demoBanner()}
      <header class="topbar"><div class="topbar-inner">
        <a href="#/inicio" style="text-decoration:none">${brandHtml()}</a>
        <nav class="nav" aria-label="Principal">
          ${navItem("inicio", "inicio", "Início", "home")}
          ${navItem("projetos", "projetos", "Projetos", "folder")}
          ${navItem("tarefas", "tarefas", "Tarefas", "check")}
          ${navItem("painel", "painel", "Painel", "chart")}
          ${navItem("equipe", "equipe", "Equipe", "users")}
        </nav>
        <div class="user">
          <button class="btn ghost icon" data-refresh aria-label="Atualizar dados" title="Atualizar">${icon("refresh")}</button>
          <button class="btn ghost" data-account aria-label="Minha conta"><span class="avatar" aria-hidden="true">${esc(initials(state.me.full_name))}</span><span class="user-name">${esc(state.me.full_name)}</span></button>
        </div>
      </div></header>
      <main id="main">${view()}</main>
      ${footerHtml()}`;
    bindView();
  }

  function bindView() {
    const root = $("#app");
    $$("[data-task]", root).forEach((b) => b.addEventListener("click", () => taskModal(b.dataset.task)));
    $$("[data-new-task]", root).forEach((b) => b.addEventListener("click", () => taskModal(null, b.dataset.newTask || "")));
    $$("[data-new-project]", root).forEach((b) => b.addEventListener("click", () => projectModal(null)));
    $$("[data-edit-project]", root).forEach((b) => b.addEventListener("click", () => projectModal(b.dataset.editProject)));
    $$("[data-edit-person]", root).forEach((b) => b.addEventListener("click", () => personModal(b.dataset.editPerson)));
    $$("[data-del-project]", root).forEach((b) => b.addEventListener("click", async () => {
      const p = project(b.dataset.delProject);
      const n = progressOf(p.id).total;
      if (!confirm(`Excluir o projeto “${p.name}”${n ? ` e as ${n} tarefas dele` : ""}? Não dá para desfazer.`)) return;
      if (await run(() => api.deleteProject(p.id), "Projeto excluído.")) location.hash = "#/projetos";
    }));
    $$("[data-toggle]", root).forEach((c) => c.addEventListener("change", () =>
      run(() => api.saveTask({ id: c.dataset.toggle, status: c.checked ? "concluida" : "a_fazer" }), c.checked ? "Tarefa concluída." : "Tarefa reaberta.")));
    $$("[data-move]", root).forEach((b) => b.addEventListener("click", () =>
      run(() => api.saveTask({ id: b.dataset.move, status: b.dataset.to }), `Movida para ${STATUS_TASK[b.dataset.to]}.`)));
    $$("[data-mode-set]", root).forEach((b) => b.addEventListener("click", () => { state[b.dataset.modeSet] = b.dataset.val; store.set(b.dataset.modeSet, b.dataset.val); render(); }));
    $$("[data-preset]", root).forEach((a) => a.addEventListener("click", () => {
      const v = a.dataset.preset;
      state.tf = { q: "", project: "", who: v === "minhas" ? "me" : "", status: v === "atrasadas" ? "atrasadas" : "abertas", priority: "" };
    }));
    $$("[data-tf]", root).forEach((el) => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
      state.tf[el.dataset.tf] = el.value;
      rerenderKeepingFocus(el);
    }));
    $$("[data-pf]", root).forEach((el) => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
      state.pf[el.dataset.pf] = el.value;
      rerenderKeepingFocus(el);
    }));
    $("[data-account]", root)?.addEventListener("click", accountModal);
    $$("[data-df]", root).forEach((el) => el.addEventListener("change", () => { state.df[el.dataset.df] = el.value; render(); }));
    $$("[data-export]", root).forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.export === "pdf") { window.print(); return; }
      b.disabled = true;
      try { await exportExcel(); toast("Planilha gerada."); } catch (e) { toast(friendly(e), true); } finally { b.disabled = false; }
    }));
    $("[data-refresh]", root)?.addEventListener("click", () => run(async () => {}, "Dados atualizados."));

    // arrastar e soltar no quadro
    $$("[data-drag]", root).forEach((c) => {
      c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", c.dataset.drag); c.classList.add("dragging"); });
      c.addEventListener("dragend", () => c.classList.remove("dragging"));
    });
    $$("[data-col]", root).forEach((col) => {
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", () => col.classList.remove("over"));
      col.addEventListener("drop", (e) => {
        e.preventDefault(); col.classList.remove("over");
        const tid = e.dataTransfer.getData("text/plain");
        const t = state.tasks.find((x) => x.id === tid);
        if (t && t.status !== col.dataset.col) run(() => api.saveTask({ id: tid, status: col.dataset.col }), `Movida para ${STATUS_TASK[col.dataset.col]}.`);
      });
    });
  }

  function rerenderKeepingFocus(el) {
    const key = el.dataset.tf ? `[data-tf="${el.dataset.tf}"]` : `[data-pf="${el.dataset.pf}"]`;
    const pos = el.selectionStart;
    render();
    const n = $(key);
    if (n) { n.focus(); if (pos != null && n.setSelectionRange) n.setSelectionRange(pos, pos); }
  }

  function render() {
    if (state.screen === "auth") return renderAuth();
    if (state.screen === "recovery") return renderRecovery();
    if (state.screen === "app" && state.me) return renderApp();
    $("#app").innerHTML = `<p class="boot">Carregando…</p>`;
  }

  const tip = document.createElement("div");
  tip.id = "tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip);
  const showTip = (el, x, y) => {
    tip.textContent = el.dataset.tip; tip.className = "show";
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px";
    tip.style.top = Math.max(8, y - h - 12) + "px";
  };
  document.addEventListener("mousemove", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) showTip(el, e.clientX, e.clientY); else tip.className = "";
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); } else tip.className = "";
  });

  window.addEventListener("hashchange", () => { if (state.screen === "app") { render(); window.scrollTo(0, 0); } });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.screen === "app" && Date.now() - state.loadedAt > 60000 && !modal().open) {
      refresh().then(render).catch(() => {});
    }
  });

  // ------------------------------------------------------------------ início
  (async () => {
    if (!DEMO && !window.supabase) {
      $("#app").innerHTML = `<p class="boot">Não foi possível carregar a biblioteca de login. Verifique a internet e recarregue a página.</p>`;
      return;
    }
    api.onAuth((ev, s) => setTimeout(() => handleAuth(ev, s), 0));
    try {
      const s = await api.getSession();
      if (state.screen === "boot") { if (s) await enter(s); else { state.screen = "auth"; render(); } }
    } catch (e) {
      state.screen = "auth"; state.authMsg = friendly(e); render();
    }
  })();
})();
