// Sistema Financeiro dos Mentorados — Jornada do M1lhão
//
// Uma tela por função, todas filtradas pelo mesmo recorte de período e
// unidade. Clicar num gráfico refiltra os KPIs, as listas e os outros
// gráficos: o gesto que lê é o mesmo que filtra.

import { SESSAO, SENHA_INICIAL, iniciarAuth, sair, podeEditar, ehJornada,
  criarContaAuth, enviarLinkDeSenha } from "./auth.js";
import * as DB from "./dados.js";
import * as P from "./projecao.js";
import { D } from "./dados.js";
import {
  esc, moeda, moedaCurta, pct, numero, ICONS, toast, abrirModal, fecharModal,
  molduraModal, confirmar, hojeISO, fmtData, fmtDataCurta, mesRefDe, nomeMesRef,
  diasNoMes, iniciais, arredondar2, lerValor, imagemParaBase64, mascaraCNPJ,
  aplicarMascara, MES_CURTO, MES_NOME, iniciarBannerInstalacao, podeInstalar, instalarAgora
} from "./shared.js";

// Banner de instalação (Android e iPhone). O evento do navegador pode chegar
// cedo, então isto roda antes de qualquer outra coisa.
iniciarBannerInstalacao();

/* ============ estado da interface ============ */
const S = {
  tela: "visao",
  mesRef: mesRefDe(hojeISO()),
  dia: null,
  unidade: "todas",
  zoom: "mes",        // "ano" | "mes" — nível do gráfico de linha em Vendas
  abaFixos: "fixo",
  abaVisao: "realizado",   // "realizado" | "projecao"
  sim: null,               // valores do simulador da projeção
  filtroCusto: "todos",
  pronto: false
};

const TELAS = {
  visao:  { nome: "Visão Geral",     icone: "painel"     },
  vendas: { nome: "Vendas",          icone: "vendas"     },
  pend:   { nome: "Pendências",      icone: "relogio"    },
  custos: { nome: "Custos",          icone: "custos"     },
  fixos:  { nome: "Fixos e Folha",   icone: "predio"     },
  config: { nome: "Configurações",   icone: "engrenagem" }
};

// A equipe da Jornada não tem empresa própria: a navegação dela é outra.
const TELAS_JORNADA = {
  mentorados: { nome: "Mentorados", icone: "predio" },
  acessos:    { nome: "Acessos",    icone: "pessoas" }
};

const anoDe = m => m.slice(0, 4);
const mesNum = m => Number(m.slice(5, 7));
const rotuloPeriodo = () => S.dia
  ? `${String(S.dia).padStart(2, "0")} de ${nomeMesRef(S.mesRef)}`
  : nomeMesRef(S.mesRef).replace(/^./, c => c.toUpperCase());

/* ============ chassi ============ */
function telasDoPapel() {
  return (ehJornada() && !SESSAO.empresaId) ? TELAS_JORNADA : TELAS;
}

function montarNavegacao() {
  const T = telasDoPapel();
  const itens = Object.entries(T)
    .filter(([k]) => k !== "config")
    .map(([k, t]) => `<button data-ir="${k}"><span class="ic">${ICONS[t.icone]}</span><span class="tip">${t.nome}</span></button>`).join("");

  document.getElementById("rail").innerHTML =
    `<div class="mark"><img src="img/bussola.png" alt=""></div>${itens}
     <div class="sep"></div>
     ${T === TELAS && !ehJornada() ? `<button data-ir="config">${ICONS.engrenagem}<span class="tip">Configurações</span></button>` : ""}`;

  document.getElementById("tabbar").innerHTML = Object.entries(T)
    .filter(([k]) => k !== "config")
    .map(([k, t]) => `<button data-ir="${k}">${ICONS[t.icone]}<span>${t.nome.replace("Visão Geral", "Visão")}</span></button>`).join("");

  document.querySelectorAll("[data-ir]").forEach(b =>
    b.addEventListener("click", () => { S.tela = b.dataset.ir; render(); }));

  document.getElementById("pil-mes").addEventListener("click", abrirSeletorMes);
  document.getElementById("pil-unidade").addEventListener("click", abrirSeletorUnidade);
  document.getElementById("btn-conta").addEventListener("click", abrirMenuConta);
}

function pintar(html) {
  const cnt = document.getElementById("cnt");
  // Re-desenho causado por dado novo (não por navegação): sem recomeçar as
  // animações de entrada e sem jogar a página pro topo.
  cnt.classList.toggle("sem-anim", S.silencioso);
  cnt.innerHTML = html;
  if (!S.silencioso) window.scrollTo({ top: 0 });
}

/* Atualização vinda do banco. Várias chegam em sequência (vendas, custos,
   fechamentos, e cada gravação ainda volta como confirmação), então agrupa
   numa só, e não mexe na tela se a pessoa está digitando. */
let timerDados = null;
function dadosMudaram() {
  clearTimeout(timerDados);
  timerDados = setTimeout(() => {
    if (!S.pronto) return;
    const a = document.activeElement;
    if (a && a.closest && a.closest("#cnt") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    // saindo do "Carregando…" a tela entra animada; depois disso, em silêncio
    S.silencioso = !S.carregandoTela;
    try { render(); } finally { S.silencioso = false; }
  }, 160);
}

function render() {
  document.querySelectorAll("[data-ir]").forEach(b =>
    b.classList.toggle("on", b.dataset.ir === S.tela));

  document.getElementById("pil-mes").innerHTML =
    `${ICONS.calendario}<span>${esc(rotuloPeriodo())}</span>`;
  const pu = document.getElementById("pil-unidade");
  pu.innerHTML = `${ICONS.filtro}<span>${S.unidade === "todas" ? "Todas as unidades" : esc(S.unidade)}</span>`;
  pu.classList.toggle("on", S.unidade !== "todas");
  document.getElementById("btn-conta").textContent = iniciais(SESSAO.nome);

  const logo = document.getElementById("logo-empresa");
  if (D.empresa?.logoBase64) {
    logo.className = "";
    logo.innerHTML = `<img src="${D.empresa.logoBase64}" alt="${esc(D.empresa.nome)}">`;
  } else {
    logo.className = "ph";
    logo.textContent = D.empresa?.nome ? D.empresa.nome.toUpperCase().slice(0, 22) : "LOGO DA EMPRESA";
  }

  const soJornada = ehJornada() && !SESSAO.empresaId;
  document.getElementById("pil-mes").classList.toggle("oculto", soJornada);
  document.getElementById("pil-unidade").classList.toggle("oculto", soJornada);
  if (soJornada && !TELAS_JORNADA[S.tela]) S.tela = "mentorados";

  if (ehJornada() && SESSAO.empresaId && S.tela === "config") S.tela = "visao";
  // Telas que dependem do mês esperam ele chegar do banco. Sem isso a tela
  // pisca o estado "nada lançado" antes de mostrar os dados.
  const soJornadaSemEmpresa = ehJornada() && !SESSAO.empresaId;
  const naProjecao = S.tela === "visao" && S.abaVisao === "projecao";
  document.getElementById("pil-mes").classList.toggle("oculto", soJornada || naProjecao);
  document.getElementById("pil-unidade").classList.toggle("oculto", soJornada || naProjecao);
  if (!soJornadaSemEmpresa && !naProjecao && ["visao", "vendas", "pend", "custos"].includes(S.tela) && !DB.mesCarregado()) {
    S.carregandoTela = true;
    pintar(faixaVisualizacao() + carregando());
    return;
  }
  S.carregandoTela = false;
  pintar(faixaVisualizacao() + ({ visao, vendas, pend, custos, fixos, config, mentorados, acessos })[S.tela]());
  ligar();
  // A Jornada só lê: gravar o fechamento seria escrever em nome da empresa.
  if (!ehJornada()) DB.agendarFechamento(S.mesRef);
}

/* ============ filtro em vigor ============ */
const porUnidade = x => S.unidade === "todas" || x.unidade === S.unidade;
const vendasFiltradas = () => D.vendas.filter(v =>
  porUnidade(v) && (S.dia === null || Number(v.data.slice(8, 10)) === S.dia));
const custosFiltrados = () => D.custos.filter(c =>
  porUnidade(c) && (S.dia === null || Number(c.dataPagamento.slice(8, 10)) === S.dia));

/* Resumo respeitando unidade e dia. O resumoDoMes() de dados.js é o mês
   cheio; este é o que a tela mostra quando há recorte. */
function resumo() {
  if (S.unidade === "todas" && S.dia === null) return DB.resumoDoMes();
  const vs = vendasFiltradas(), cs = custosFiltrados();
  const venda = arredondar2(vs.reduce((s, v) => s + (v.valorVenda || 0), 0));
  const soma = f => arredondar2(cs.filter(f).reduce((s, c) => s + (c.valor || 0), 0));
  const base = soma(c => c.origem === "venda");
  const comissoes = arredondar2(vs.reduce((s, v) => s + DB.comissaoDaVenda(v), 0));
  const lucroBruto = arredondar2(venda - base - comissoes);
  const naoPrevisto = soma(c => c.origem === "avulso");
  const fixos = soma(c => c.origem === "fixo" || c.origem === "folha");
  const imposto = soma(c => c.origem === "imposto");
  const lucroLiquido = arredondar2(lucroBruto - naoPrevisto - fixos - imposto);
  return { venda, base, comissoes, lucroBruto, naoPrevisto, fixos, imposto, lucroLiquido,
    nVendas: vs.length,
    margemBruta: venda ? lucroBruto / venda * 100 : 0,
    margemLiquida: venda ? lucroLiquido / venda * 100 : 0,
    custoTotal: arredondar2(base + comissoes + naoPrevisto + fixos + imposto) };
}

/* ============ componentes ============ */
const seta = () => `<span class="seta">${ICONS.seta}</span>`;

function carregando() {
  return `<div class="carregando"><div class="bolinhas"><i></i><i></i><i></i></div>
    <div>Carregando…</div></div>`;
}

function vazioTela(titulo, texto, acao = "") {
  return `<div class="card anim"><div class="vazio-tela">
    <div class="ic">${ICONS.aviso}</div>
    <h3>${esc(titulo)}</h3><p>${esc(texto)}</p>${acao}
  </div></div>`;
}

function kpi(lab, valor, legenda, { cor, barra } = {}) {
  return `<div class="card kpi">
    <div class="lab">${esc(lab)}</div>
    <div class="val"${cor ? ` style="color:${cor}"` : ""}>${valor}</div>
    <div class="leg">${legenda || ""}</div>
    ${barra != null ? `<div class="bar"><i style="--w:${Math.max(Math.min(barra, 100), 0)}%${cor ? `;background:${cor}` : ""}"></i></div>` : ""}
  </div>`;
}

/* ---------- gráfico de linha ---------- */
function linhaSVG(pontos, id, altura = 210) {
  const W = 1000, PL = 58, PR = 16, PT = 16, PB = 30;
  const iw = W - PL - PR, ih = altura - PT - PB;
  const max = Math.max(...pontos.map(p => p.v), 1);
  const y = v => PT + ih - (v / max) * ih;
  const x = i => pontos.length === 1 ? PL + iw / 2 : PL + (i / (pontos.length - 1)) * iw;

  const co = pontos.map((p, i) => [x(i), y(p.v)]);
  const d = co.map((c, i) => `${i ? "L" : "M"}${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(" ");
  const dArea = `${d} L${co[co.length - 1][0].toFixed(1)} ${PT + ih} L${co[0][0].toFixed(1)} ${PT + ih} Z`;
  const len = co.reduce((s, c, i) => i ? s + Math.hypot(c[0] - co[i - 1][0], c[1] - co[i - 1][1]) : 0, 0);

  const grades = [0, .5, 1].map(f =>
    `<line class="gl" x1="${PL}" x2="${W - PR}" y1="${PT + ih - f * ih}" y2="${PT + ih - f * ih}"/>
     <text class="yl" x="${PL - 9}" y="${PT + ih - f * ih + 3.5}">${f ? moedaCurta(max * f).replace("R$ ", "") : "0"}</text>`).join("");

  const vazio = pontos.every(p => p.v === 0);
  return `<div class="lc" data-lc="${id}">
    <svg viewBox="0 0 ${W} ${altura}" preserveAspectRatio="none" style="height:${altura}px">
      <defs><linearGradient id="gl-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FED116" stop-opacity=".22"/>
        <stop offset="100%" stop-color="#FED116" stop-opacity="0"/>
      </linearGradient></defs>
      ${grades}
      ${vazio ? `<text class="vazio" x="${W / 2}" y="${PT + ih / 2}">Nenhuma venda no período</text>`
              : `<path class="area" d="${dArea}" fill="url(#gl-${id})"/>
                 <path class="linha" d="${d}" style="--len:${len.toFixed(0)}"/>`}
      ${pontos.map((p, i) => `<circle class="pt ${p.sel ? "sel" : ""}" cx="${x(i)}" cy="${y(p.v)}"
        r="${p.sel ? 6 : 4.2}" style="animation-delay:${.5 + i * .03}s"
        data-i="${i}" data-chave="${p.chave}" data-rot="${esc(p.rd)}" data-val="${p.v}"/>`).join("")}
      ${pontos.map((p, i) => `<text class="xl ${p.sel ? "sel" : ""}" x="${x(i)}" y="${altura - 9}"
        data-i="${i}" data-chave="${p.chave}">${esc(p.r)}</text>`).join("")}
    </svg>
  </div>`;
}

function pontosDoAno() {
  const serie = DB.serieDoAno(anoDe(S.mesRef));
  return serie.map(p => ({
    r: MES_CURTO[p.i], rd: `${MES_NOME[p.i]} de ${anoDe(S.mesRef)}`,
    v: p.venda, sel: p.mesRef === S.mesRef, chave: p.mesRef
  }));
}
function pontosDosDias() {
  const mm = S.mesRef.slice(5, 7);
  return DB.vendasPorDia(S.mesRef).map(p => ({
    r: (p.dia % 5 === 0 || p.dia === 1) ? String(p.dia) : "",
    rd: `${String(p.dia).padStart(2, "0")}/${mm}`,
    v: p.valor, sel: S.dia === p.dia, chave: "d" + p.dia
  }));
}

/* ---------- rosca ---------- */
function fatias(r) {
  return [
    { k: "base",    n: "Custos variáveis",     d: "vinculados às vendas",    v: r.base,        c: "#FED116" },
    { k: "fixo",    n: "Custos fixos e folha", d: "aluguel, salários, etc",  v: r.fixos,       c: "#8A6A0C" },
    { k: "imp",     n: "Impostos",             d: "",                        v: r.imposto,     c: "#4A4A4A" },
    { k: "com",     n: "Comissões",            d: "vendedor e prospecção",   v: r.comissoes,   c: "#6E6E6E" },
    { k: "naoprev", n: "Custos não previstos", d: "revisita e retrabalho",   v: r.naoPrevisto, c: "#EF4444" }
  ].filter(f => f.v > 0);
}

function rosca(r) {
  const F = fatias(r);
  if (!F.length) return `<div class="txt" style="padding:22px 0">Nenhum custo lançado no período.</div>`;
  const tot = F.reduce((s, f) => s + f.v, 0);
  const R = 60, W = 12, C = 2 * Math.PI * R;
  let off = 0;
  const arcos = F.map((f, i) => {
    const frac = f.v / tot;
    const el = `<circle class="f fat" data-fat="${f.k}" cx="78" cy="78" r="${R}" fill="none"
      stroke="${f.c}" stroke-width="${W}"
      style="--da:${(frac * C).toFixed(2)} ${C.toFixed(2)};--c:${C.toFixed(2)};--do:${(-off * C).toFixed(2)};animation-delay:${.25 + i * .1}s"
      transform="rotate(-90 78 78)"></circle>`;
    off += frac; return el;
  }).join("");
  const leg = F.map(f => `<div class="leg-row fat" data-fat="${f.k}">
      <i style="width:9px;height:9px;border-radius:2px;background:${f.c};flex:none"></i>
      <div style="flex:1;min-width:0"><div style="font-size:13px">${f.n}</div>
        ${f.d ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:1px">${f.d}</div>` : ""}</div>
      <div class="num" style="font-size:13px;font-weight:600;width:50px;text-align:right;color:${f.c === "#EF4444" ? "var(--debit)" : "var(--ink)"}">${numero(f.v / tot * 100, 1)}%</div>
      <div class="num" style="font-size:12.5px;color:var(--ink-soft);width:100px;text-align:right">${moeda(f.v)}</div>
      ${seta()}
    </div>`).join("");

  return `<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
    <div class="rosca" style="position:relative;width:156px;height:156px;flex:none">
      <svg viewBox="0 0 156 156" style="width:156px;height:156px">${arcos}</svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none">
        <div style="font-size:9.5px;color:var(--ink-faint);letter-spacing:.5px">CUSTO TOTAL</div>
        <div class="num" style="font-size:16px;font-weight:600;margin-top:3px">${moedaCurta(tot)}</div>
        ${r.venda ? `<div style="font-size:9.5px;color:var(--ink-faint);margin-top:3px">${numero(tot / r.venda * 100, 1)}% da receita</div>` : ""}
      </div>
    </div>
    <div style="flex:1;min-width:270px">${leg}</div>
  </div>`;
}

/* ============ TELA: VISÃO GERAL ============ */
function visao() {
  if (S.abaVisao === "projecao") return projecao();
  const r = resumo();
  const serie = DB.serieDoAno(anoDe(S.mesRef)).filter(p => p.temDado);
  const iAtual = serie.findIndex(p => p.mesRef === S.mesRef);
  const ant = iAtual > 0 ? serie[iAtual - 1] : null;
  const varMes = ant && ant.venda ? (r.venda / ant.venda - 1) * 100 : null;
  const mediaMB = serie.length
    ? serie.reduce((s, p) => s + (p.venda ? p.lucroBruto / p.venda * 100 : 0), 0) / serie.length : 0;

  const maxV = Math.max(...serie.map(p => p.venda), 1);
  const maxR = Math.max(...serie.map(p => Math.abs(p.lucroLiquido)), 1);
  const barras = serie.map((p, i) => {
    const neg = p.lucroLiquido < 0;
    return `<div class="col ${p.mesRef === S.mesRef ? "hot" : ""}" data-mes="${p.mesRef}">
      <div class="stack"><div class="b" style="height:${Math.round(p.venda / maxV * 100)}%;animation-delay:${i * .05}s"></div></div>
      <div style="width:100%;height:60px;display:flex;flex-direction:column;align-items:center;border-top:1px dashed var(--line)">
        <div class="b" style="height:${Math.max(Math.round(Math.abs(p.lucroLiquido) / maxR * 100), 6)}%;background:${neg ? "var(--debit)" : "var(--credit)"};border-radius:0 0 5px 5px;width:64%;animation-delay:${i * .05 + .08}s"></div>
        <div class="num" style="font-size:10px;margin-top:4px;color:${neg ? "var(--debit)" : "var(--credit)"}">${neg ? "−" : "+"}${Math.round(Math.abs(p.lucroLiquido) / 1000)}k</div>
      </div>
      <div class="lb">${MES_CURTO[p.i]}</div></div>`;
  }).join("");

  if (!D.vendas.length && !D.custos.length) {
    // O botão chama o mesmo id da tela de Vendas. Antes usava data-ir, que só
    // ganha clique no menu lateral: aqui dentro ele não fazia nada.
    return `${cabecalho(rotuloPeriodo(), D.empresa?.nome || "", "")}
      ${abasVisao()}
      ${vazioTela("Nada lançado neste mês ainda",
        "Comece cadastrando as vendas do mês. Os custos de cada uma entram dentro dela.",
        podeEditar() ? `<button class="btn pri" id="btn-nova-venda">${ICONS.mais}Nova venda</button>` : "")}`;
  }

  const l = (k, nome, valor, neg) =>
    `<div class="row ${neg ? "neg" : ""} ab" data-abre="${k}"><div class="nm">${nome}</div>
      <div class="vl">${neg ? "− " : ""}${moeda(valor)}</div>${seta()}</div>`;

  return `${cabecalho(rotuloPeriodo(), D.empresa?.nome || "",
    `<button class="btn" id="btn-dre">${ICONS.baixar}Exportar DRE</button>`)}
  ${abasVisao()}

  <div class="grid anim" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;animation-delay:.04s">
    ${kpi("Faturamento do mês", moeda(r.venda),
      `${varMes !== null ? `<span class="tag ${varMes >= 0 ? "up" : "dn"}">${varMes >= 0 ? "+" : "−"}${numero(Math.abs(varMes), 1)}%</span> contra o mês anterior, ` : ""}com ${r.nVendas} venda${r.nVendas === 1 ? "" : "s"}.`)}
    ${kpi("Lucro bruto", moeda(r.lucroBruto),
      `<span class="tag nt">${pct(r.margemBruta)} de margem</span> ${r.margemBruta >= mediaMB ? "acima" : "abaixo"} da média do ano, de ${pct(mediaMB)}.`,
      { barra: r.margemBruta })}
    ${kpi("Lucro líquido", moeda(r.lucroLiquido),
      `<span class="tag ${r.lucroLiquido < 0 ? "dn" : "up"}">${pct(r.margemLiquida)} de margem</span> ${r.lucroLiquido < 0 ? "o custo fixo passou do lucro bruto." : "sobrou caixa no mês."}`,
      { cor: r.lucroLiquido < 0 ? "var(--debit)" : "var(--dourado)", barra: r.margemLiquida })}
  </div>

  <div class="card anim" style="margin-bottom:14px;animation-delay:.08s">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:2px;flex-wrap:wrap">
      <div class="lab" style="font-size:11.5px;color:var(--ink-faint);letter-spacing:.4px;text-transform:uppercase;flex:1">Vendas por dia</div>
      <span class="num" style="font-size:13px;color:var(--ink-soft)">${moeda(r.venda)} no mês</span>
    </div>
    ${linhaSVG(pontosDosDias(), "visao", 190)}
  </div>

  <div class="grid anim" style="grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);animation-delay:.12s">
    <div class="card">
      <div class="lab" style="font-size:11.5px;color:var(--ink-faint);letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">Do faturamento ao que sobra</div>
      <div class="dre">
        ${l("faturamento", "Faturamento", r.venda, false)}
        ${l("base", "Custos vinculados às vendas", r.base, true)}
        ${l("com", "Comissões", r.comissoes, true)}
        <div class="row tot"><div class="nm">LUCRO BRUTO</div><div class="vl">${moeda(r.lucroBruto)}</div><span class="tag nt">${pct(r.margemBruta)}</span></div>
        ${r.naoPrevisto ? l("naoprev", "Custos não previstos", r.naoPrevisto, true) : ""}
        ${l("fixo", "Custos fixos e folha", r.fixos, true)}
        ${l("imp", "Impostos", r.imposto, true)}
        <div class="row tot gold"><div class="nm">LUCRO LÍQUIDO</div>
          <div class="vl" style="color:${r.lucroLiquido < 0 ? "var(--debit)" : "var(--dourado)"}">${moeda(r.lucroLiquido)}</div>
          <span class="tag ${r.lucroLiquido < 0 ? "dn" : "up"}">${pct(r.margemLiquida)}</span></div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:2px;flex-wrap:wrap">
        <div class="lab" style="font-size:11.5px;color:var(--ink-faint);letter-spacing:.4px;text-transform:uppercase;flex:1">Faturamento e resultado, mês a mês</div>
        <span style="font-size:11.5px;color:var(--ink-faint);display:flex;align-items:center;gap:5px"><i style="width:9px;height:9px;border-radius:2px;background:var(--panel-3);display:inline-block"></i>faturado</span>
        <span style="font-size:11.5px;color:var(--ink-faint);display:flex;align-items:center;gap:5px"><i style="width:9px;height:9px;border-radius:2px;background:var(--debit);display:inline-block"></i>prejuízo</span>
      </div>
      <div class="chart">${barras || `<div class="txt" style="padding:30px 0">Ainda não há meses fechados.</div>`}</div>
      <div style="border-top:1px solid var(--line);margin:18px -20px 0;padding:18px 20px 0">
        <div class="lab" style="font-size:11.5px;color:var(--ink-faint);letter-spacing:.4px;text-transform:uppercase;margin-bottom:4px">Para onde foi o dinheiro</div>
        ${rosca(r)}
      </div>
    </div>
  </div>`;
}

function abasVisao() {
  return `<div class="tabs anim">
    <button class="${S.abaVisao !== "projecao" ? "on" : ""}" data-visao="realizado">Realizado</button>
    <button class="${S.abaVisao === "projecao" ? "on" : ""}" data-visao="projecao">Projeção</button>
  </div>`;
}

/* ============ SUBTELA: PROJEÇÃO ============ */
// Não usa o mês em foco: usa os fechamentos de todos os meses, depois de tirar
// os que estão mal preenchidos (ver projecao.js).
let modeloAtual = null;

function projecao() {
  const m = P.montarModelo(D.fechamentos, mesRefDe(hojeISO()));
  modeloAtual = m;
  const cab = `${cabecalho("Projeção", "Com base no histórico da empresa", "")}${abasVisao()}`;

  if (!m.ok) {
    const fora = m.fora.filter(f => f.motivo !== "mês ainda em andamento");
    return `${cab}${vazioTela("Ainda não dá para projetar",
      `A projeção precisa de pelo menos dois meses completos, com vendas e custos lançados. ${
        m.usados.length === 1 ? "Hoje há um." : "Hoje não há nenhum."}${
        fora.length ? " Fora da conta: " + fora.map(f => `${nomeMesRef(f.mes)} (${f.motivo})`).join("; ") + "." : ""}`)}`;
  }

  // valores iniciais do simulador: a média dos meses usados
  if (!S.sim) S.sim = {
    faturamento: Math.round(m.mediaVenda / 1000) * 1000,
    ticket: Math.round(m.ticket),
    conversao: lerConversao()
  };
  const d = P.dreProjetada(m, S.sim.faturamento);
  const f = P.funil(S.sim.faturamento, S.sim.ticket, S.sim.conversao);
  const pctMc = m.margemContribuicao * 100;
  const periodo = `${nomeMesRef(m.usados[0].mes).split(" de ")[0]} a ${nomeMesRef(m.usados[m.usados.length - 1].mes)}`;

  return `${cab}
  <div class="grid anim" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;animation-delay:.04s">
    ${kpi("Ponto de equilíbrio", isFinite(m.equilibrio) ? moeda(m.equilibrio) : "—",
      "faturamento por mês para empatar", { cor: m.mediaVenda < m.equilibrio ? "var(--warn)" : undefined })}
    ${kpi("Faturamento médio", moeda(m.mediaVenda), `${m.usados.length} meses, ${esc(periodo)}`)}
    ${kpi("Ticket médio", moeda(m.ticket), m.ticketRecente
      ? `nos últimos meses: ${moeda(m.ticketRecente)}` : `${m.nVendas} vendas na base`)}
    ${kpi("De cada R$ 100 vendidos", `R$ ${numero(pctMc, 0)}`, "sobram para pagar o fixo e dar lucro",
      { cor: pctMc > 0 ? "var(--dourado)" : "var(--debit)" })}
  </div>

  <div class="grid anim" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-bottom:14px;animation-delay:.08s">
    <div class="card">
      <div class="lab-sec">Simular um mês</div>
      <div class="sim-par">
        <label class="campo"><span>Faturamento do mês</span>
          <input class="num-in" id="sim-fat" inputmode="decimal" value="${numero(S.sim.faturamento, 0)}"></label>
        <span class="sim-seta" aria-hidden="true">⇄</span>
        <label class="campo"><span>Quanto sobra no fim (lucro líquido)</span>
          <input class="num-in" id="sim-lucro" inputmode="decimal" value="${numero(d.lucroLiquido, 0)}"></label>
      </div>
      <div class="chips-sim">
        ${isFinite(m.equilibrio) ? `<button class="chip" data-sim-fat="${Math.ceil(m.equilibrio)}">Empatar</button>` : ""}
        <button class="chip" data-sim-fat="${Math.round(m.mediaVenda)}">Média dos meses</button>
        <button class="chip" data-sim-fat="${Math.round(m.melhorMes.venda)}">Melhor mês</button>
        <button class="chip" data-sim-fat="${Math.round(m.mediaVenda * 1.2)}">Média + 20%</button>
      </div>
      <div class="sim-par" style="margin-top:14px">
        <label class="campo"><span>Ticket médio</span>
          <input class="num-in" id="sim-ticket" inputmode="decimal" value="${numero(S.sim.ticket, 0)}"></label>
        <label class="campo"><span>Conversão das propostas (%)</span>
          <input class="num-in" id="sim-conv" inputmode="decimal" value="${numero(S.sim.conversao, 0)}"></label>
      </div>
      <div class="sim-res">
        <div><div class="l">Vendas no mês</div><div class="v" id="sim-vendas">${f.vendas}</div></div>
        <div><div class="l">Propostas a apresentar</div><div class="v gold" id="sim-propostas">${f.propostas || "—"}</div>
          <div class="l" id="sim-semana">${f.propostas ? `cerca de ${f.propostasSemana} por semana` : "informe a conversão"}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="lab-sec">Resultado projetado</div>
      <div class="dre" id="sim-dre">${drePrevista(d, m)}</div>
    </div>
  </div>

  <div class="card anim" style="margin-bottom:14px;animation-delay:.12s">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px">
      <div class="lab-sec" style="flex:1;margin:0">Tendência</div>
      <span class="leg-mini"><i style="background:var(--credit)"></i>mês com lucro</span>
      <span class="leg-mini"><i style="background:var(--debit)"></i>mês com prejuízo</span>
      <span class="leg-mini"><i class="caixa"></i>projeção</span>
      <span class="leg-mini"><i class="linha-t"></i>tendência</span>
      <span class="leg-mini"><i class="linha-e"></i>ponto de equilíbrio</span>
    </div>
    ${m.tendencia.ok ? graficoTendencia(m) : ""}
    <div class="veredito ${m.tendencia.ok ? m.tendencia.estado : "neutro"}">${esc(m.tendencia.ok ? m.tendencia.texto
      : "Com menos de três meses completos ainda não dá para traçar uma tendência.")}</div>
  </div>

  <div class="card anim" style="animation-delay:.16s">
    <div class="lab-sec">O que olhar para melhorar o resultado</div>
    <div class="insights">${m.insights.map(i => `<div class="insight ${i.tipo}">
      <i></i><div><b>${esc(i.titulo)}</b><p>${esc(i.texto)}</p></div></div>`).join("")}</div>
    <button class="btn plano mini" id="btn-base-proj" style="margin-top:10px">Ver os meses usados na conta</button>
  </div>`;
}

function drePrevista(d, m) {
  const linha = (n, v, neg) => `<div class="row ${neg ? "neg" : ""}"><div class="nm">${n}</div>
    <div class="vl">${neg ? "− " : ""}${moeda(v)}</div></div>`;
  const abaixo = d.faturamento < m.equilibrio;
  return `${linha("Faturamento", d.faturamento)}
    ${linha("Custos das vendas", d.custo, true)}
    ${linha("Comissões", d.comissao, true)}
    <div class="row tot"><div class="nm">LUCRO BRUTO</div><div class="vl">${moeda(d.lucroBruto)}</div><span class="tag nt">${pct(d.margemBruta)}</span></div>
    ${linha("Impostos", d.imposto, true)}
    ${linha("Custos fixos e folha", d.fixo, true)}
    ${d.naoPrevisto ? linha("Custos não previstos", d.naoPrevisto, true) : ""}
    <div class="row tot gold"><div class="nm">LUCRO LÍQUIDO</div>
      <div class="vl" style="color:${d.lucroLiquido < 0 ? "var(--debit)" : "var(--dourado)"}">${moeda(d.lucroLiquido)}</div>
      <span class="tag ${d.lucroLiquido < 0 ? "dn" : "up"}">${pct(d.margemLiquida)}</span></div>
    ${abaixo && isFinite(m.equilibrio) ? `<div class="aviso-sim">Abaixo do ponto de equilíbrio de ${moeda(m.equilibrio)}: o mês fecha no prejuízo.</div>` : ""}`;
}

function graficoTendencia(m) {
  const t = m.tendencia;
  const W = 1000, H = 230, PL = 58, PR = 150, PT = 18, PB = 30;
  const hist = [...m.usados.map(f => ({ ...f, usado: true })), ...m.fora
    .filter(f => f.motivo !== "mês ainda em andamento").map(f => ({ ...f, usado: false }))]
    .sort((a, b) => a.mes.localeCompare(b.mes));
  const reais = [...hist.map(f => ({ mes: f.mes, venda: f.venda, ll: f.lucroLiquido, usado: f.usado, futuro: false })),
    ...t.futuro.map(f => ({ mes: f.mes, venda: f.venda, ll: f.lucroLiquido, usado: true, futuro: true }))];
  // Eixo em meses corridos: mês sem dado entre dois meses aparece vazio, em vez
  // de o gráfico encostar julho em setembro como se agosto não existisse.
  const nIdx = mr => Number(mr.slice(0, 4)) * 12 + Number(mr.slice(5, 7)) - 1;
  const deI = i => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`;
  const porMes = Object.fromEntries(reais.map(p => [p.mes, p]));
  const a0 = nIdx(reais[0].mes), a1 = nIdx(reais[reais.length - 1].mes);
  const pontos = Array.from({ length: a1 - a0 + 1 }, (_, k) => porMes[deI(a0 + k)] || { mes: deI(a0 + k), vazio: true, venda: 0 });
  const eq = isFinite(m.equilibrio) ? m.equilibrio : 0;
  const max = Math.max(eq, ...pontos.map(p => p.venda)) * 1.12 || 1;
  const iw = W - PL - PR, ih = H - PT - PB, n = pontos.length, passo = iw / n;
  const y = v => PT + ih - v / max * ih;
  const xC = i => PL + passo * i + passo / 2;
  const bw = Math.min(46, passo * .56);

  const barras = pontos.map((p, i) => {
    if (p.vazio) return `<text class="xl" x="${xC(i)}" y="${PT + ih - 6}">sem dado</text>`;
    const cor = p.ll < 0 ? "var(--debit)" : "var(--credit)";
    const alt = Math.max(2, PT + ih - y(p.venda));
    return p.futuro
      ? `<rect x="${xC(i) - bw / 2}" y="${y(p.venda)}" width="${bw}" height="${alt}" rx="4" fill="none" stroke="${cor}" stroke-width="1.6" stroke-dasharray="4 4"/>`
      : `<rect x="${xC(i) - bw / 2}" y="${y(p.venda)}" width="${bw}" height="${alt}" rx="4" fill="${cor}" opacity="${p.usado ? .78 : .22}"/>
         ${p.usado ? "" : `<text class="xl" x="${xC(i)}" y="${y(p.venda) - 6}">fora</text>`}`;
  }).join("");

  const idxUsados = pontos.map((p, i) => p.usado && !p.vazio ? i : -1).filter(i => i >= 0);
  const i0 = idxUsados[0], i1 = pontos.length - 1;
  const reta = `<line x1="${xC(i0)}" y1="${y(t.reta(pontos[i0].mes))}" x2="${xC(i1)}" y2="${y(Math.max(0, t.reta(pontos[i1].mes)))}"
      stroke="var(--dourado)" stroke-width="2" stroke-dasharray="7 6"/>`;
  const linhaEq = eq ? `<line x1="${PL}" x2="${W - PR + 10}" y1="${y(eq)}" y2="${y(eq)}" stroke="var(--warn)" stroke-width="1.4" stroke-dasharray="3 4"/>
      <text class="yl" x="${W - PR + 16}" y="${y(eq) - 4}" style="text-anchor:start;fill:var(--warn)">equilíbrio</text>
      <text class="yl" x="${W - PR + 16}" y="${y(eq) + 11}" style="text-anchor:start;fill:var(--warn)">${moedaCurta(eq)}</text>` : "";
  const rot = pontos.map((p, i) => `<text class="xl" x="${xC(i)}" y="${H - 9}">${MES_CURTO[Number(p.mes.slice(5)) - 1]}</text>`).join("");
  const grade = [0, .5, 1].map(fr => `<line class="gl" x1="${PL}" x2="${W - PR}" y1="${PT + ih - fr * ih}" y2="${PT + ih - fr * ih}"/>
      <text class="yl" x="${PL - 9}" y="${PT + ih - fr * ih + 3.5}">${fr ? moedaCurta(max * fr).replace("R$ ", "") : "0"}</text>`).join("");
  return `<div class="lc"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
    ${grade}${barras}${linhaEq}${reta}${rot}</svg></div>`;
}

/* A conversão digitada fica guardada neste navegador, por empresa. */
function chaveConv() { return "fmj_conv_" + (SESSAO.empresaId || ""); }
function lerConversao() { try { return Number(localStorage.getItem(chaveConv())) || 25; } catch { return 25; } }
function gravarConversao(v) { try { localStorage.setItem(chaveConv(), String(v)); } catch {} }

/* Calculadora ao vivo: recalcula e troca só os números, sem redesenhar a tela
   (redesenhar tiraria o cursor do campo a cada tecla). */
function ligarProjecao() {
  const m = modeloAtual;
  if (!m?.ok) return;
  const $ = id => document.getElementById(id);
  const fat = $("sim-fat"), luc = $("sim-lucro"), tic = $("sim-ticket"), conv = $("sim-conv");

  const atualizar = (origem) => {
    if (origem === "lucro") {
      const alvo = lerValor(luc.value);
      const R = P.faturamentoPara(m, alvo);
      S.sim.faturamento = isFinite(R) ? Math.max(0, R) : 0;
      fat.value = numero(S.sim.faturamento, 0);
    } else if (origem === "fat") {
      S.sim.faturamento = Math.max(0, lerValor(fat.value));
    }
    S.sim.ticket = Math.max(0, lerValor(tic.value));
    S.sim.conversao = Math.min(100, Math.max(0, lerValor(conv.value)));
    const d = P.dreProjetada(m, S.sim.faturamento);
    if (origem !== "lucro") luc.value = numero(d.lucroLiquido, 0);
    const f = P.funil(S.sim.faturamento, S.sim.ticket, S.sim.conversao);
    $("sim-vendas").textContent = f.vendas;
    $("sim-propostas").textContent = f.propostas || "—";
    $("sim-semana").textContent = f.propostas ? `cerca de ${f.propostasSemana} por semana` : "informe a conversão";
    $("sim-dre").innerHTML = drePrevista(d, m);
  };
  fat.addEventListener("input", () => atualizar("fat"));
  luc.addEventListener("input", () => atualizar("lucro"));
  tic.addEventListener("input", () => atualizar("outro"));
  conv.addEventListener("input", () => { atualizar("outro"); gravarConversao(S.sim.conversao); });
  // ao sair do campo, mostra o número formatado
  [fat, luc, tic].forEach(el => el.addEventListener("blur", () => { el.value = numero(lerValor(el.value), 0); }));
  document.querySelectorAll("[data-sim-fat]").forEach(b => b.addEventListener("click", () => {
    fat.value = numero(Number(b.dataset.simFat), 0);
    atualizar("fat");
  }));
  document.getElementById("btn-base-proj")?.addEventListener("click", () => modalBaseProjecao(m));
}

function modalBaseProjecao(m) {
  const linhas = [...m.usados.map(f => ({ ...f, usado: true })), ...m.fora.map(f => ({ ...f, usado: false }))]
    .sort((a, b) => a.mes.localeCompare(b.mes)).map(f => `<tr>
      <td style="padding-left:20px"><div class="nm2">${esc(nomeMesRef(f.mes))}</div>
        ${f.usado ? "" : `<div style="color:var(--ink-faint);font-size:11.5px;margin-top:2px">${esc(f.motivo)}</div>`}</td>
      <td class="r mono">${moeda(f.venda)}</td>
      <td class="r mono">${numero(f.custoVenda * 100, 1)}%</td>
      <td class="r" style="padding-right:20px">${f.usado ? `<span class="tag up">usado</span>` : `<span class="tag nt">fora</span>`}</td>
    </tr>`).join("");
  abrirModal(molduraModal("Meses usados na projeção", "Só entram meses completos e bem preenchidos", `
    <table><thead><tr><th style="padding-left:20px">Mês</th><th class="r">Faturamento</th>
      <th class="r">Custo das vendas</th><th class="r" style="padding-right:20px"></th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="txt" style="font-size:12.5px;margin:16px 20px 4px;padding-left:12px;border-left:2px solid var(--line)">
      Fica fora o mês em andamento, o mês sem venda ou sem custo fixo, e o mês em que o custo das vendas foge muito
      dos outros, o que quase sempre é custo não lançado. As proporções de custo, comissão e imposto saem dos meses
      usados; o custo fixo sai dos três mais recentes.</div>`,
    `<button class="btn" data-fechar>Fechar</button>`, { largura: 620 }));
  document.querySelector("#modal .cnt").style.padding = "6px 0 12px";
}

function cabecalho(titulo, sub, acoes) {
  return `<div class="head anim">
    <div><div class="h1">${esc(titulo)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
    <div class="sp"></div>${acoes || ""}
  </div>`;
}

/* ============ TELA: VENDAS ============ */
function vendas() {
  const lista = vendasFiltradas();
  const r = resumo();
  const maior = lista.slice().sort((a, b) => b.valorVenda - a.valorVenda)[0];
  const pendTotal = lista.reduce((s, v) => s + DB.pendenciasDaVenda(v).length, 0);

  const linhas = lista.length ? lista.map(v => {
    const custo = DB.custoDaVenda(v.id) + DB.comissaoDaVenda(v);
    const lb = DB.lucroBrutoDaVenda(v);
    const p = DB.pendenciasDaVenda(v).length;
    return `<tr data-venda="${v.id}">
      <td style="padding-left:20px"><div class="who"><div class="ci">${esc(iniciais(v.cliente))}</div>
        <div><div class="nm2">${esc(v.cliente)}</div>
        <div class="sb">${esc(v.vendedor || "—")} · ${fmtDataCurta(v.data)}</div></div></div></td>
      <td class="mono">${v.kwp ? numero(v.kwp) : '<span style="color:var(--ink-faint)">—</span>'}</td>
      <td class="r mono">${moeda(v.valorVenda)}</td>
      <td class="r mono" style="color:var(--ink-soft)">${moeda(custo)}</td>
      <td class="r mono" style="color:${p ? "var(--ink-faint)" : "var(--credit)"}">${moeda(lb)}</td>
      <td class="r" style="padding-right:20px">${p
        ? `<span class="tag wr">${p} pendente${p > 1 ? "s" : ""}</span>`
        : `<span class="tag up">completa</span>`}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" class="vazia">Nenhuma venda no período selecionado</td></tr>`;

  const migalha = `<div class="migalha">
    <button class="chip ${S.zoom === "ano" ? "on" : ""}" data-zoom="ano">${anoDe(S.mesRef)}</button>
    <span style="color:var(--ink-faint)">›</span>
    <button class="chip ${S.zoom === "mes" && S.dia === null ? "on" : ""}" data-zoom="mes">${nomeMesRef(S.mesRef).split(" de ")[0].replace(/^./, c => c.toUpperCase())}</button>
    ${S.dia !== null ? `<span style="color:var(--ink-faint)">›</span>
      <button class="chip on" data-zoom="mes">${ICONS.x} dia ${String(S.dia).padStart(2, "0")}</button>` : ""}
  </div>`;

  return `${cabecalho("Vendas", rotuloPeriodo(),
    podeEditar() ? `<button class="btn pri" id="btn-nova-venda">${ICONS.mais}Nova venda</button>` : "")}

  <div class="card anim" style="margin-bottom:14px;animation-delay:.04s">
    ${migalha}
    ${linhaSVG(S.zoom === "ano" ? pontosDoAno() : pontosDosDias(), "vendas", 220)}
  </div>

  <div class="grid anim" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;animation-delay:.08s">
    ${kpi("Nº de vendas", String(lista.length), rotuloPeriodo())}
    ${kpi("Total de venda", moeda(r.venda), `${lista.length} venda${lista.length === 1 ? "" : "s"} no período`)}
    ${kpi("Ticket médio", moeda(lista.length ? r.venda / lista.length : 0), maior ? `maior: ${moeda(maior.valorVenda)}` : "—")}
    ${kpi("Lucro bruto", moeda(r.lucroBruto),
      pendTotal ? `<span class="tag wr">${pendTotal} custo${pendTotal > 1 ? "s" : ""} pendente${pendTotal > 1 ? "s" : ""}</span>`
                : `<span class="tag nt">${pct(r.margemBruta)} de margem</span>`,
      { cor: "var(--dourado)" })}
  </div>

  <div class="card anim" style="padding:18px 8px 6px;animation-delay:.12s">
    <table><thead><tr>
      <th style="padding-left:20px">Cliente e vendedor</th><th>kWp</th>
      <th class="r">Valor da venda</th><th class="r">Custo total</th>
      <th class="r">Lucro bruto</th><th class="r" style="padding-right:20px">Situação</th>
    </tr></thead><tbody>${linhas}</tbody></table>
  </div>`;
}

/* ============ TELA: PENDÊNCIAS ============ */
function pend() {
  const itens = [];
  D.vendas.filter(porUnidade).forEach(v => {
    DB.pendenciasDaVenda(v).forEach(linhaId => {
      const linha = D.linhasCusto.find(l => l.id === linhaId);
      itens.push({ venda: v, linhaId, nome: linha?.nome || "Custo", dias: diasDesde(v.data) });
    });
  });
  itens.sort((a, b) => b.dias - a.dias);
  const velhos = itens.filter(i => i.dias > 30).length;
  const vendasComPend = new Set(itens.map(i => i.venda.id)).size;

  const linhas = itens.length ? itens.map(i => `<tr>
    <td style="padding-left:20px"><div class="who"><div class="ci">${esc(iniciais(i.venda.cliente))}</div>
      <div><div class="nm2">${esc(i.venda.cliente)}</div><div class="sb">${esc(i.venda.vendedor || "—")}</div></div></div></td>
    <td class="mono" style="color:var(--ink-soft)">${fmtData(i.venda.data)}</td>
    <td>${esc(i.nome)}</td>
    <td class="r">${i.dias > 30 ? `<span class="tag dn">${i.dias} dias</span>` : `<span class="tag wr">aguardando</span>`}</td>
    <td class="r" style="padding-right:20px">${podeEditar()
      ? `<button class="btn mini" data-lancar="${i.venda.id}|${i.linhaId}">Lançar valor</button>` : ""}</td>
  </tr>`).join("") : `<tr><td colspan="5" class="vazia">Nenhuma pendência. Todos os custos esperados foram lançados.</td></tr>`;

  return `${cabecalho("Pendências", "Custos esperados ainda não preenchidos", "")}
  <div class="grid anim" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;animation-delay:.04s">
    ${kpi("Custos pendentes", String(itens.length), `em ${vendasComPend} venda${vendasComPend === 1 ? "" : "s"}`,
      { cor: itens.length ? "var(--warn)" : undefined })}
    ${kpi("Vendas com margem provisória", String(vendasComPend), "o lucro bruto delas ainda pode mudar")}
    ${kpi("Parado há mais de 30 dias", String(velhos), velhos ? "vale correr atrás" : "nada atrasado",
      { cor: velhos ? "var(--debit)" : undefined })}
  </div>
  <div class="card anim" style="padding:18px 8px 6px;animation-delay:.08s">
    <table><thead><tr><th style="padding-left:20px">Cliente</th><th>Data da venda</th>
      <th>Custo pendente</th><th class="r">Situação</th><th class="r" style="padding-right:20px"></th></tr></thead>
      <tbody>${linhas}</tbody></table>
  </div>`;
}

function diasDesde(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return Math.max(0, Math.round((Date.now() - new Date(a, m - 1, d)) / 86400000));
}

/* ============ TELA: CUSTOS ============ */
const FILTROS_CUSTO = [
  ["todos", "Todos"], ["venda", "Vinculados à venda"], ["avulso", "Não previstos"],
  ["fixo", "Fixos"], ["folha", "Folha"], ["imposto", "Impostos"], ["comissao", "Comissões"]
];

function custos() {
  const r = resumo();
  const base = custosFiltrados();
  // comissões vivem dentro da venda; aqui viram linhas só de leitura
  const comiss = [];
  vendasFiltradas().forEach(v => (v.comissoes || []).forEach((c, i) => {
    if (c.valor > 0) comiss.push({
      id: `${v.id}#c${i}`, descricao: `Comissão — ${c.papel || "vendedor"}`, origem: "comissao",
      ref: v.cliente, dataPagamento: v.data, valor: c.valor, unidade: v.unidade, soLeitura: true
    });
  }));

  const todos = [...base.map(c => ({ ...c, ref: rotuloRef(c) })), ...comiss];
  const lista = S.filtroCusto === "todos" ? todos : todos.filter(c => c.origem === S.filtroCusto);
  const totalFiltro = arredondar2(lista.reduce((s, c) => s + (c.valor || 0), 0));

  const cor = { venda: "nt", avulso: "dn", fixo: "nt", folha: "nt", imposto: "nt", comissao: "nt" };
  const rotulo = { venda: "venda", avulso: "não previsto", fixo: "fixo", folha: "folha", imposto: "imposto", comissao: "comissão" };

  const linhas = lista.length ? lista.map(c => `<tr ${c.soLeitura ? "" : `data-custo="${c.id}"`}>
    <td style="padding-left:20px"><div class="nm2">${esc(c.descricao)}</div>
      <div style="color:var(--ink-faint);font-size:11.5px;margin-top:2px">${esc(c.ref || "")}</div></td>
    <td><span class="tag ${cor[c.origem]}">${rotulo[c.origem]}</span></td>
    <td class="mono" style="color:var(--ink-soft)">${fmtDataCurta(c.dataPagamento)}</td>
    <td style="color:var(--ink-soft)">${esc(c.unidade || "—")}</td>
    <td class="r mono" style="padding-right:20px">${moeda(c.valor)}</td>
  </tr>`).join("") : `<tr><td colspan="5" class="vazia">Nenhum custo com esses filtros</td></tr>`;

  const semOcorrencias = D.fixos.filter(f => f.ativo !== false).length
    && !D.custos.some(c => c.fixoId);

  return `${cabecalho("Custos", rotuloPeriodo(),
    podeEditar() ? `<button class="btn pri" id="btn-novo-custo">${ICONS.mais}Lançar custo</button>` : "")}

  ${semOcorrencias && podeEditar() ? `<div class="card anim" style="margin-bottom:14px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <div style="flex:1;min-width:240px"><b style="font-size:13.5px">Os custos fixos deste mês ainda não foram lançados</b>
      <div class="txt" style="font-size:12.5px;margin-top:4px">Gerar cria um lançamento para cada linha ativa da base, com o valor e o vencimento cadastrados.</div></div>
    <button class="btn pri" id="btn-gerar">Gerar lançamentos do mês</button>
  </div>` : ""}

  <div class="filtros anim">
    ${FILTROS_CUSTO.map(([k, n]) => `<button class="pill ${S.filtroCusto === k ? "on" : ""}" data-fc="${k}">${n}</button>`).join("")}
  </div>

  <div class="grid anim" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;animation-delay:.04s">
    ${kpi("Variáveis, vinculados", moeda(r.base), "antes do lucro bruto")}
    ${kpi("Não previstos", moeda(r.naoPrevisto), "depois do lucro bruto",
      { cor: r.naoPrevisto ? "var(--debit)" : undefined })}
    ${kpi("Fixos, folha e imposto", moeda(r.fixos + r.imposto), "recorrentes do mês")}
    ${kpi(S.filtroCusto === "todos" ? "Total do mês" : "Total filtrado", moeda(totalFiltro),
      `${lista.length} lançamento${lista.length === 1 ? "" : "s"}`)}
  </div>

  <div class="card anim" style="padding:18px 8px 6px;animation-delay:.08s">
    <table><thead><tr><th style="padding-left:20px">Custo</th><th>Origem</th>
      <th>Pago em</th><th>Unidade</th><th class="r" style="padding-right:20px">Valor</th></tr></thead>
      <tbody>${linhas}</tbody></table>
  </div>`;
}

function rotuloRef(c) {
  if (c.vendaId) {
    const v = D.vendas.find(x => x.id === c.vendaId);
    return v ? v.cliente : "venda";
  }
  if (c.fixoId) return "recorrente";
  if (c.clienteId) return c.clienteId;
  return "sem vínculo";
}

/* ============ TELA: FIXOS E FOLHA ============ */
function fixos() {
  const doTipo = t => D.fixos.filter(f => (f.tipo || "fixo") === t);
  const aba = S.abaFixos;

  const tFixo = doTipo("fixo").length ? doTipo("fixo").map(f => `<tr data-fixo="${f.id}">
    <td style="padding-left:20px"><div class="nm2">${esc(f.nome)}</div></td>
    <td class="mono" style="color:var(--ink-soft)">dia ${f.diaVencimento || 5}</td>
    <td class="r mono">${moeda(f.valor)}</td>
    <td class="r" style="padding-right:20px">
      <span class="tag ${f.ativo === false ? "nt" : "up"}">${f.ativo === false ? "pausado" : "ativo"}</span></td>
  </tr>`).join("") : `<tr><td colspan="4" class="vazia">Nenhuma linha de custo fixo cadastrada</td></tr>`;

  const grupos = {};
  doTipo("folha").forEach(p => (grupos[p.grupo || "Equipe"] ||= []).push(p));
  const tFolha = Object.keys(grupos).length ? Object.entries(grupos).map(([g, ps]) =>
    `<tr><td colspan="5" style="padding:18px 20px 9px;border-bottom:1px solid var(--line)">
      <span style="font-size:11.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--ink-soft)">${esc(g)}</span></td></tr>`
    + ps.map(p => `<tr data-fixo="${p.id}">
      <td style="padding-left:20px"><div class="who"><div class="ci">${esc(iniciais(p.nome))}</div>
        <div><div class="nm2">${esc(p.nome)}</div>
        <div class="sb">${esc(p.funcao || "—")}${p.proLabore ? " · pró-labore" : ""}</div></div></div></td>
      <td class="r mono" style="color:var(--ink-soft)">${p.valor ? moeda(p.valor) : "—"}</td>
      <td class="r mono" style="color:var(--ink-soft)">${p.ajudaCusto ? moeda(p.ajudaCusto) : "—"}</td>
      <td class="r mono">${moeda((p.valor || 0) + (p.ajudaCusto || 0) + (p.extras || 0))}</td>
      <td class="r" style="padding-right:20px">
        <span class="tag ${p.ativo === false ? "nt" : "up"}">${p.ativo === false ? "pausado" : "ativo"}</span></td>
    </tr>`).join("")).join("")
    : `<tr><td colspan="5" class="vazia">Ninguém cadastrado na folha</td></tr>`;

  return `${cabecalho("Custos Fixos e Folha", "O que se repete todo mês",
    podeEditar() ? `<button class="btn pri" id="btn-novo-fixo">${ICONS.mais}Nova linha</button>` : "")}
  <div class="tabs anim">
    <button class="${aba === "fixo" ? "on" : ""}" data-aba="fixo">Custo fixo</button>
    <button class="${aba === "folha" ? "on" : ""}" data-aba="folha">Folha</button>
  </div>
  <div class="card anim" style="padding:18px 8px 6px;animation-delay:.04s">
    ${aba === "folha"
      ? `<table><thead><tr><th style="padding-left:20px">Pessoa</th><th class="r">Salário</th>
          <th class="r">Ajuda de custo</th><th class="r">Total</th>
          <th class="r" style="padding-right:20px">Situação</th></tr></thead><tbody>${tFolha}</tbody></table>`
      : `<table><thead><tr><th style="padding-left:20px">Linha</th><th>Vence</th>
          <th class="r">Valor base</th><th class="r" style="padding-right:20px">Situação</th></tr></thead><tbody>${tFixo}</tbody></table>`}
  </div>`;
}

/* ============ TELA: CONFIGURAÇÕES ============ */
function config() {
  const e = D.empresa || {};
  const unidades = e.unidades || [];
  const podeMexer = podeEditar();

  return `${cabecalho("Configurações", e.nome || "", "")}
  <div class="grid anim" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);animation-delay:.04s">
    <div class="card">
      <div class="blk">A empresa</div>
      <div class="field"><div class="fl">Nome</div>
        <div class="campo"><input id="cfg-nome" value="${esc(e.nome || "")}" ${podeMexer ? "" : "disabled"}></div></div>
      <div class="field"><div class="fl">CNPJ</div>
        <div class="campo"><input id="cfg-cnpj" value="${esc(e.cnpj || "")}" placeholder="00.000.000/0001-00" ${podeMexer ? "" : "disabled"}></div></div>
      <div class="field"><div class="fl">Mês de abertura</div>
        <div class="campo"><input type="month" id="cfg-abertura" value="${esc(e.mesAbertura || "")}" ${podeMexer ? "" : "disabled"}></div></div>
      <div class="field"><div class="fl">Unidades</div>
        <div style="flex:1;display:flex;gap:7px;flex-wrap:wrap" id="cfg-unidades">
          ${unidades.map(u => `<span class="tag nt">${esc(u)}${podeMexer ? ` <button class="rm" data-rm-uni="${esc(u)}" aria-label="Remover">×</button>` : ""}</span>`).join("")}
          ${podeMexer ? `<button class="btn mini" id="btn-add-unidade">+ unidade</button>` : ""}
        </div></div>

      <div class="blk">Logo da empresa</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:110px;height:62px;border:1px dashed var(--line);border-radius:11px;display:grid;place-items:center;flex:none;overflow:hidden;padding:6px">
          ${e.logoBase64 ? `<img src="${e.logoBase64}" alt="" style="max-width:100%;max-height:100%;object-fit:contain">`
                         : `<span style="font-size:11px;color:var(--ink-faint);text-align:center;line-height:1.4">PNG<br>até 120 KB</span>`}
        </div>
        <div style="flex:1;min-width:200px">
          ${podeMexer ? `<input type="file" id="cfg-logo" accept="image/png,image/jpeg" style="display:none">
          <button class="btn" id="btn-logo">${ICONS.enviar}Enviar PNG</button>
          ${e.logoBase64 ? `<button class="btn plano mini" id="btn-tirar-logo" style="margin-left:6px">Remover</button>` : ""}` : ""}
          <div style="font-size:12px;color:var(--ink-faint);margin-top:9px;line-height:1.5">
            Fundo transparente, até 120 KB.<br>Aparece no topo do sistema.</div>
        </div>
      </div>
      ${podeMexer ? `<button class="btn pri" id="btn-salvar-empresa" style="margin-top:20px">Salvar alterações</button>` : ""}
    </div>

    <div class="card">
      <div class="blk">Linhas de custo padrão</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px" id="cfg-linhas">
        ${D.linhasCusto.map(l => `<span class="tag ${l.padrao ? "nt" : "wr"}">${esc(l.nome)}${podeMexer && !l.padrao ? ` <button class="rm" data-rm-linha="${l.id}" aria-label="Remover">×</button>` : ""}</span>`).join("")
        || `<span class="txt" style="font-size:12.5px">Nenhuma linha cadastrada.</span>`}
        ${podeMexer ? `<button class="btn mini" id="btn-add-linha">+ linha</button>` : ""}
      </div>
      <div style="font-size:12px;color:var(--ink-faint);line-height:1.55">
        Toda venda nova abre com as linhas cinzas esperando valor. Em dourado, as que você criou:
        ficam disponíveis pra acrescentar na venda quando fizer sentido.</div>

      <div class="blk">Acesso da Jornada</div>
      <div style="display:flex;align-items:flex-start;gap:14px;background:var(--dourado-soft);
        border:1px solid rgba(254,209,22,.22);border-radius:12px;padding:15px 16px">
        <div class="switch ${e.autorizaJornada ? "" : "off"}" id="sw-jornada" role="switch"
          aria-checked="${!!e.autorizaJornada}" tabindex="0"><i></i></div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13.5px">Autorizar acesso da Jornada do M1lhão</div>
          <div style="font-size:12.5px;color:var(--ink-soft);margin-top:6px;line-height:1.55">
            Ligada, seu mentor enxerga os números desta empresa. Desligada, ninguém de fora vê os valores.</div>
          <div style="font-size:12px;color:var(--ink-faint);margin-top:9px">Você liga e desliga quando quiser.</div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ============ área da Jornada ============ */
// A equipe da Jornada não tem empresa própria. Ela cadastra mentorado, cria
// acesso, e enxerga os números só das empresas que ligaram a autorização.

const J = { empresas: [], acessos: [], carregado: false };

async function carregarJornada() {
  const [e, a] = await Promise.all([DB.listarEmpresas(), DB.listarAcessos()]);
  J.empresas = e; J.acessos = a; J.carregado = true;
}

/* ---------- a Jornada olhando os números de uma empresa (somente leitura) ---------- */
function faixaVisualizacao() {
  if (!(ehJornada() && SESSAO.empresaId)) return "";
  return `<div class="card anim" style="margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;border-color:rgba(254,209,22,.3)">
    <span class="tag wr">somente leitura</span>
    <div style="flex:1;min-width:200px;font-size:13.5px">Você está vendo os números de <b>${esc(D.empresa?.nome || "")}</b>,
      liberados por ela. Nada aqui pode ser alterado.</div>
    <button class="btn" id="btn-voltar-mentorados">Voltar aos mentorados</button>
  </div>`;
}

async function abrirEmpresa(id) {
  SESSAO.empresaId = id;
  S.tela = "visao"; S.dia = null; S.unidade = "todas";
  S.mesRef = mesRefDe(hojeISO());
  montarNavegacao();
  pintar(carregando());
  try {
    await DB.carregarEmpresa();
    await DB.carregarBase();
    // abre no mês mais recente que tem dado, senão a tela abre vazia
    S.mesRef = (await DB.ultimoMesComDado()) || S.mesRef;
    DB.escutarFechamentos();
    DB.escutarMes(S.mesRef);
    DB.quandoMudar(dadosMudaram);
    render();
  } catch (e) {
    console.error(e);
    toast("Não consegui abrir esta empresa. Ela pode ter desligado o acesso.", "erro", 7000);
    voltarAosMentorados();
  }
}

function voltarAosMentorados() {
  DB.fecharTudo();
  SESSAO.empresaId = null;
  D.empresa = null; D.vendas = []; D.custos = []; D.fixos = []; D.linhasCusto = []; D.fechamentos = {};
  S.tela = "mentorados"; S.dia = null;
  montarNavegacao();
  render();
}

function mentorados() {
  if (!J.carregado) return carregando();
  const autorizadas = J.empresas.filter(e => e.autorizaJornada).length;
  const paradas = J.empresas.filter(e => !e.ultimoLancamento || diasDesde(e.ultimoLancamento) > 15).length;

  const linhas = J.empresas.length ? J.empresas.map(e => {
    const pessoas = J.acessos.filter(a => a.empresaId === e.id).length;
    return `<tr ${e.autorizaJornada ? `data-ver="${e.id}"` : ""}>
      <td style="padding-left:20px"><div class="who"><div class="ci">${esc(iniciais(e.nome))}</div>
        <div><div class="nm2">${esc(e.nome)}</div><div class="sb">${esc(e.cnpj || "sem CNPJ")}</div></div></div></td>
      <td>${pessoas} ${pessoas === 1 ? "acesso" : "acessos"}</td>
      <td class="mono" style="color:var(--ink-soft)">${e.ultimoLancamento ? fmtData(e.ultimoLancamento) : "nunca"}</td>
      <td class="r" style="padding-right:20px">${e.autorizaJornada
        ? `<span class="tag up">ver números</span>` : `<span class="tag nt">privado</span>`}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="4" class="vazia">Nenhuma empresa cadastrada ainda</td></tr>`;

  return `${cabecalho("Mentorados", `${J.empresas.length} empresa${J.empresas.length === 1 ? "" : "s"} no sistema`,
    `<button class="btn pri" id="btn-nova-empresa">${ICONS.mais}Nova empresa</button>`)}
  <div class="grid anim" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;animation-delay:.04s">
    ${kpi("Empresas", String(J.empresas.length), "cadastradas")}
    ${kpi("Com acesso autorizado", String(autorizadas), "você enxerga os números destas")}
    ${kpi("Sem lançar há 15 dias", String(paradas), paradas ? "vale um toque" : "todas em dia",
      { cor: paradas ? "var(--warn)" : undefined })}
  </div>
  <div class="card anim" style="padding:18px 8px 6px;animation-delay:.08s">
    <table><thead><tr><th style="padding-left:20px">Empresa</th><th>Pessoas</th>
      <th>Último lançamento</th><th class="r" style="padding-right:20px">Acesso</th></tr></thead>
      <tbody>${linhas}</tbody></table>
  </div>`;
}

function acessos() {
  if (!J.carregado) return carregando();
  const daJornada = J.acessos.filter(a => a.papel === "jornada");
  const deMentorado = J.acessos.filter(a => a.papel !== "jornada");

  const linha = a => {
    const emp = J.empresas.find(e => e.id === a.empresaId);
    const orfao = a.papel !== "jornada" && !emp;
    return `<tr data-acesso="${a.uid}">
      <td style="padding-left:20px"><div class="who"><div class="ci">${esc(iniciais(a.nome || a.email))}</div>
        <div><div class="nm2">${esc(a.nome || "—")}</div><div class="sb">${esc(a.email || "")}</div></div></div></td>
      <td>${a.papel === "jornada"
        ? `<span class="tag wr">equipe Jornada</span>`
        : `<span class="tag nt">${esc(a.papel)}</span>`}</td>
      <td style="color:var(--ink-soft)">${a.papel === "jornada" ? "—"
        : orfao ? `<span class="tag dn">empresa não encontrada</span>` : esc(emp.nome)}</td>
      <td class="r" style="padding-right:20px">${a.uid === SESSAO.uid
        ? `<span class="tag up">você</span>` : ""}</td>
    </tr>`;
  };

  const bloco = (titulo, lista, vazio) => `<tr><td colspan="4" style="padding:18px 20px 9px;border-bottom:1px solid var(--line)">
      <span style="font-size:11.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--ink-soft)">${titulo}</span></td></tr>`
    + (lista.length ? lista.map(linha).join("")
       : `<tr><td colspan="4" class="vazia" style="padding:26px 12px">${vazio}</td></tr>`);

  return `${cabecalho("Acessos", `${J.acessos.length} pessoa${J.acessos.length === 1 ? "" : "s"} com acesso`,
    `<button class="btn pri" id="btn-novo-acesso">${ICONS.pessoaMais}Novo acesso</button>`)}
  <div class="card anim" style="padding:0 8px 6px;animation-delay:.04s">
    <table><thead><tr><th style="padding-left:20px">Pessoa</th><th>Papel</th>
      <th>Empresa</th><th class="r" style="padding-right:20px"></th></tr></thead><tbody>
      ${bloco("Mentorados", deMentorado, "Nenhum mentorado com acesso ainda")}
      ${bloco("Equipe da Jornada", daJornada, "Ninguém da equipe além de você")}
    </tbody></table>
  </div>
  <div class="txt" style="font-size:12.5px;margin-top:14px;padding-left:12px;border-left:2px solid var(--line)">
    A senha inicial de todo acesso novo é <b>${esc(SENHA_INICIAL)}</b>. Na primeira entrada o
    sistema obriga a troca, e ninguém entra sem trocar.</div>`;
}

/* ---------- modal: nova empresa ---------- */
function modalEmpresa() {
  abrirModal(molduraModal("Nova empresa", "A empresa do mentorado", `
    <div class="campo" style="margin-bottom:14px"><span>Nome da empresa</span>
      <input id="e-nome" placeholder="Como ela é conhecida"></div>
    <div class="campo" style="margin-bottom:14px"><span>CNPJ (opcional)</span>
      <input id="e-cnpj" placeholder="00.000.000/0001-00"></div>
    <div class="campo" style="margin-bottom:14px"><span>Mês de abertura no sistema</span>
      <input type="month" id="e-abertura" value="${esc(S.mesRef)}"></div>
    <div class="campo"><span>Unidades, separadas por vírgula (opcional)</span>
      <input id="e-unidades" placeholder="Matriz, Filial"></div>
    <div class="txt" style="font-size:12.5px;margin-top:16px;padding-left:12px;border-left:2px solid var(--line)">
      As quatro linhas de custo do ramo já entram cadastradas: kit solar, instalação,
      vistoria e engenharia.</div>`,
    `<button class="btn pri" id="e-salvar">Criar empresa</button>
     <button class="btn" data-fechar>Cancelar</button>`, { largura: 520 }));

  aplicarMascara(document.getElementById("e-cnpj"), mascaraCNPJ);
  document.getElementById("e-salvar").addEventListener("click", async () => {
    const nome = document.getElementById("e-nome").value.trim();
    if (!nome) return toast("Escreva o nome da empresa.", "erro");
    const btn = document.getElementById("e-salvar");
    btn.disabled = true; btn.textContent = "Criando…";
    try {
      await DB.criarEmpresa({
        nome, cnpj: document.getElementById("e-cnpj").value.trim(),
        mesAbertura: document.getElementById("e-abertura").value || null,
        unidades: document.getElementById("e-unidades").value
          .split(",").map(u => u.trim()).filter(Boolean)
      });
      await carregarJornada();
      fecharModal(); render();
      toast("Empresa criada. Agora crie o acesso da pessoa.", "ok");
    } catch (e) {
      console.error(e);
      btn.disabled = false; btn.textContent = "Criar empresa";
      toast("Não consegui criar a empresa.", "erro");
    }
  });
}

/* ---------- modal: novo acesso ---------- */
function modalAcesso() {
  const temEmpresa = J.empresas.length > 0;

  abrirModal(molduraModal("Novo acesso", "", `
    <div class="field"><div class="fl">Tipo de acesso</div>
      <div class="seg"><button type="button" class="a-tipo on" data-t="mentorado">Mentorado</button>
        <button type="button" class="a-tipo" data-t="jornada">Equipe Jornada</button></div></div>

    <div class="field"><div class="fl">Nome</div>
      <div class="campo"><input id="a-nome" placeholder="Nome de quem vai usar"></div></div>
    <div class="field"><div class="fl">E-mail</div>
      <div class="campo"><input type="email" id="a-email" placeholder="email@empresa.com" autocomplete="off"></div></div>

    <div id="a-bloco-mentorado">
      <div class="field"><div class="fl">Empresa</div>
        <div class="campo">${temEmpresa
          ? `<select id="a-empresa">${J.empresas.map(e =>
              `<option value="${e.id}">${esc(e.nome)}</option>`).join("")}</select>`
          : `<div class="inp ph">nenhuma empresa cadastrada</div>`}</div></div>
      <div class="field"><div class="fl">Papel na empresa</div>
        <div class="campo"><select id="a-papel">
          <option value="dono">Dono — lança e configura tudo</option>
          <option value="financeiro">Financeiro — lança tudo, não configura</option>
          <option value="leitura">Leitura — só enxerga</option>
        </select></div></div>
      ${!temEmpresa ? `<div class="txt" style="font-size:12.5px;margin-top:6px;padding-left:12px;border-left:2px solid var(--debit)">
        Cadastre a empresa antes, em Mentorados.</div>` : ""}
    </div>

    <div id="a-bloco-jornada" class="oculto">
      <div class="txt" style="font-size:13px;margin-top:6px;padding-left:12px;border-left:2px solid var(--line)">
        Acesso da equipe da Jornada: enxerga a lista de mentorados e cria novos acessos.
        Só vê os números das empresas que ligaram a autorização, e nunca lança nada por elas.</div>
    </div>

    <div class="blk">Senha inicial</div>
    <div class="field"><div class="fl">Senha</div>
      <div class="inp">${esc(SENHA_INICIAL)}</div></div>
    <div class="txt" style="font-size:12.5px;margin-top:8px;padding-left:12px;border-left:2px solid var(--line)">
      Combine essa senha com a pessoa. Na primeira entrada o sistema obriga a troca,
      e ela não usa o sistema antes de trocar.</div>`,
    `<button class="btn pri" id="a-salvar">Criar acesso</button>
     <button class="btn" data-fechar>Cancelar</button>`, { largura: 620 }));

  let tipo = "mentorado";
  document.querySelectorAll(".a-tipo").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".a-tipo").forEach(o => o.classList.remove("on"));
    b.classList.add("on");
    tipo = b.dataset.t;
    document.getElementById("a-bloco-mentorado").classList.toggle("oculto", tipo !== "mentorado");
    document.getElementById("a-bloco-jornada").classList.toggle("oculto", tipo !== "jornada");
  }));

  document.getElementById("a-salvar").addEventListener("click", async () => {
    const nome = document.getElementById("a-nome").value.trim();
    const email = document.getElementById("a-email").value.trim().toLowerCase();
    if (!nome) return toast("Escreva o nome da pessoa.", "erro");
    if (!email || !email.includes("@")) return toast("Escreva um e-mail válido.", "erro");
    if (tipo === "mentorado" && !temEmpresa)
      return toast("Cadastre a empresa antes, na tela de Mentorados.", "erro");
    if (J.acessos.some(a => (a.email || "").toLowerCase() === email))
      return toast("Já existe acesso com esse e-mail.", "erro");

    const btn = document.getElementById("a-salvar");
    btn.disabled = true; btn.textContent = "Criando…";
    try {
      // 1. a conta no Firebase Auth, numa instância separada pra não derrubar
      //    a sessão de quem está cadastrando
      const uid = await criarContaAuth(email, SENHA_INICIAL);
      // 2. o vínculo, gravado pela sessão principal, que é a que a regra
      //    reconhece como equipe da Jornada
      await DB.gravarAcesso(uid, {
        nome, email,
        papel: tipo === "jornada" ? "jornada" : document.getElementById("a-papel").value,
        empresaId: tipo === "jornada" ? null : document.getElementById("a-empresa").value
      });
      await carregarJornada();
      fecharModal(); render();
      toast(`Acesso criado. Passe o e-mail e a senha ${SENHA_INICIAL} para ${nome}.`, "ok", 9000);
    } catch (e) {
      console.error(e);
      btn.disabled = false; btn.textContent = "Criar acesso";
      toast(e.message || "Não consegui criar o acesso.", "erro", 7000);
    }
  });
}

/* ---------- modal: acesso existente ---------- */
function modalEditarAcesso(uid) {
  const a = J.acessos.find(x => x.uid === uid);
  if (!a) return;
  const euMesmo = uid === SESSAO.uid;
  const emp = J.empresas.find(e => e.id === a.empresaId);

  abrirModal(molduraModal(a.nome || a.email, a.email, `
    <div class="field"><div class="fl">Papel</div>
      <div class="campo">${euMesmo
        ? `<div class="inp">${esc(a.papel)}</div>`
        : `<select id="ea-papel">
            ${["dono", "financeiro", "leitura", "jornada"].map(p =>
              `<option value="${p}" ${a.papel === p ? "selected" : ""}>${p === "jornada" ? "equipe Jornada" : p}</option>`).join("")}
           </select>`}</div></div>
    <div class="field"><div class="fl">Empresa</div>
      <div class="campo"><div class="inp">${esc(emp?.nome || (a.papel === "jornada" ? "—" : "não encontrada"))}</div></div></div>
    ${euMesmo ? `<div class="txt" style="font-size:12.5px;margin-top:14px;padding-left:12px;border-left:2px solid var(--line)">
      Você não altera o próprio papel nem remove o próprio acesso. É o que impede a última
      pessoa da Jornada de se trancar do lado de fora.</div>` : ""}
    <div class="blk">Senha</div>
    <button class="btn" id="ea-link">${ICONS.chave}Enviar link de troca de senha</button>`,
    euMesmo ? `<button class="btn" data-fechar>Fechar</button>`
      : `<button class="btn pri" id="ea-salvar">Salvar</button>
         <button class="btn" data-fechar>Cancelar</button>
         <div style="flex:1"></div>
         <button class="btn plano" id="ea-remover">${ICONS.lixeira}Remover acesso</button>`,
    { largura: 540 }));

  document.getElementById("ea-link").addEventListener("click", async () => {
    try {
      await enviarLinkDeSenha(a.email);
      toast(`Link enviado para ${a.email}.`, "ok");
    } catch { toast("Não consegui enviar o link agora.", "erro"); }
  });

  document.getElementById("ea-salvar")?.addEventListener("click", async () => {
    const papel = document.getElementById("ea-papel").value;
    await DB.atualizarAcesso(uid, {
      papel, empresaId: papel === "jornada" ? null : (a.empresaId || null)
    });
    await carregarJornada();
    fecharModal(); render();
    toast("Acesso atualizado.", "ok");
  });

  document.getElementById("ea-remover")?.addEventListener("click", async () => {
    const ok = await confirmar(
      `Remover o acesso de ${a.nome || a.email}? A pessoa deixa de entrar em qualquer empresa. ` +
      `A conta continua existindo no Firebase e pode ser religada depois.`,
      { textoConfirmar: "Remover acesso" });
    if (!ok) return;
    await DB.excluirAcesso(uid);
    await carregarJornada();
    fecharModal(); render();
    toast("Acesso removido.", "ok");
  });
}

/* ============ ligações ============ */
function ligar() {
  const q = sel => document.querySelectorAll(sel);

  q("[data-venda]").forEach(tr => tr.addEventListener("click", () => modalVenda(tr.dataset.venda)));
  q("[data-custo]").forEach(tr => tr.addEventListener("click", () => modalCusto(tr.dataset.custo)));
  q("[data-fixo]").forEach(tr => tr.addEventListener("click", () => modalFixo(tr.dataset.fixo)));
  q("[data-mes]").forEach(c => c.addEventListener("click", () => trocarMes(c.dataset.mes)));
  q("[data-abre]").forEach(el => el.addEventListener("click", () => modalComposicao(el.dataset.abre)));
  q("[data-fc]").forEach(b => b.addEventListener("click", () => { S.filtroCusto = b.dataset.fc; render(); }));
  q("[data-aba]").forEach(b => b.addEventListener("click", () => { S.abaFixos = b.dataset.aba; render(); }));
  q("[data-zoom]").forEach(b => b.addEventListener("click", () => {
    S.zoom = b.dataset.zoom; S.dia = null; render();
  }));
  q("[data-lancar]").forEach(b => b.addEventListener("click", () => {
    const [vid, lid] = b.dataset.lancar.split("|");
    modalCusto(null, { vendaId: vid, linhaCustoId: lid });
  }));

  // realce em par entre a fatia da rosca e a linha da legenda
  const fats = q("[data-fat]");
  const realce = (k, on) => fats.forEach(e => {
    const meu = e.dataset.fat === k;
    e.classList.toggle("rea", on && meu);
    if (e.tagName === "circle") e.classList.toggle("apaga", on && !meu);
  });
  fats.forEach(el => {
    el.addEventListener("mouseenter", () => realce(el.dataset.fat, true));
    el.addEventListener("mouseleave", () => realce(el.dataset.fat, false));
    el.addEventListener("click", () => modalComposicao(el.dataset.fat));
  });

  // gráfico de linha: ponto e rótulo navegam
  q(".lc").forEach(lc => {
    const alvo = lc.dataset.lc;
    lc.querySelectorAll(".pt, .xl").forEach(el => {
      const chave = el.dataset.chave;
      el.addEventListener("click", () => {
        if (chave.startsWith("d")) {
          const d = Number(chave.slice(1));
          S.dia = S.dia === d ? null : d;
        } else {
          if (alvo !== "vendas") return;
          S.mesRef = chave; S.dia = null; S.zoom = "mes";
          DB.escutarMes(S.mesRef);
        }
        render();
      });
      if (el.classList.contains("pt")) {
        el.addEventListener("mouseenter", () => {
          const d = document.getElementById("dica");
          d.innerHTML = `${esc(el.dataset.rot)}<span class="v">${moeda(Number(el.dataset.val))}</span>`;
          const r = el.getBoundingClientRect();
          d.style.left = (r.left + r.width / 2) + "px";
          d.style.top = (r.top + window.scrollY) + "px";
          d.style.opacity = 1;
        });
        el.addEventListener("mouseleave", () => document.getElementById("dica").style.opacity = 0);
      }
    });
  });

  // botões de tela
  const liga = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener("click", fn); };
  liga("btn-nova-venda", () => modalVenda(null));
  liga("btn-novo-custo", () => modalCusto(null));
  liga("btn-novo-fixo", () => modalFixo(null));
  liga("btn-dre", exportarDRE);
  q("[data-visao]").forEach(b => b.addEventListener("click", () => { S.abaVisao = b.dataset.visao; render(); }));
  if (S.tela === "visao" && S.abaVisao === "projecao") ligarProjecao();
  liga("btn-nova-empresa", modalEmpresa);
  liga("btn-voltar-mentorados", voltarAosMentorados);
  q("[data-ver]").forEach(tr => tr.addEventListener("click", () => abrirEmpresa(tr.dataset.ver)));
  liga("btn-novo-acesso", modalAcesso);
  q("[data-acesso]").forEach(tr => tr.addEventListener("click", () => modalEditarAcesso(tr.dataset.acesso)));
  liga("btn-gerar", async () => {
    const n = await DB.gerarOcorrencias(S.mesRef);
    toast(n ? `${n} lançamento${n > 1 ? "s" : ""} criado${n > 1 ? "s" : ""}.` : "Nada novo para gerar.", "ok");
  });

  ligarConfig();
}

function trocarMes(mesRef) {
  S.mesRef = mesRef; S.dia = null;
  DB.escutarMes(mesRef);
  render();
}

/* ============ seletores do topo ============ */
function abrirSeletorMes() {
  const ano = Number(anoDe(S.mesRef));
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mr = `${ano}-${String(i + 1).padStart(2, "0")}`;
    return `<button class="chip ${mr === S.mesRef ? "on" : ""}" data-sel-mes="${mr}"
      style="justify-content:center">${MES_CURTO[i]}</button>`;
  }).join("");

  abrirModal(molduraModal("Período", "", `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="btn icone" data-ano="${ano - 1}">‹</button>
      <div style="flex:1;text-align:center;font-family:var(--display);font-weight:700;font-size:17px">${ano}</div>
      <button class="btn icone" data-ano="${ano + 1}">›</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${meses}</div>
    ${S.dia !== null ? `<button class="btn plano" id="limpa-dia" style="margin-top:16px;width:100%;justify-content:center">Mostrar o mês inteiro</button>` : ""}
  `, "", { largura: 380 }));

  document.querySelectorAll("[data-sel-mes]").forEach(b => b.addEventListener("click", () => {
    fecharModal(); trocarMes(b.dataset.selMes);
  }));
  document.querySelectorAll("[data-ano]").forEach(b => b.addEventListener("click", () => {
    S.mesRef = `${b.dataset.ano}-${S.mesRef.slice(5)}`;
    fecharModal(); trocarMes(S.mesRef);
  }));
  const ld = document.getElementById("limpa-dia");
  if (ld) ld.addEventListener("click", () => { S.dia = null; fecharModal(); render(); });
}

function abrirSeletorUnidade() {
  const us = ["todas", ...(D.empresa?.unidades || [])];
  abrirModal(molduraModal("Unidade", "", `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${us.map(u => `<button class="chip ${S.unidade === u ? "on" : ""}" data-sel-uni="${esc(u)}"
        style="justify-content:flex-start;height:40px">${u === "todas" ? "Todas as unidades" : esc(u)}</button>`).join("")}
    </div>`, "", { largura: 340 }));
  document.querySelectorAll("[data-sel-uni]").forEach(b => b.addEventListener("click", () => {
    S.unidade = b.dataset.selUni; fecharModal(); render();
  }));
}

function abrirMenuConta() {
  const velho = document.querySelector(".menu-conta");
  if (velho) return velho.remove();
  const m = document.createElement("div");
  m.className = "menu-conta";
  m.innerHTML = `<div class="quem"><b>${esc(SESSAO.nome)}</b><span>${esc(SESSAO.email)} · ${esc(SESSAO.papel)}</span></div>
    ${podeInstalar() ? `<button id="mc-instalar">${ICONS.celular}Instalar aplicativo</button>` : ""}
    <button id="mc-sair">${ICONS.sair}Sair</button>`;
  document.body.appendChild(m);
  document.getElementById("mc-sair").addEventListener("click", sair);
  document.getElementById("mc-instalar")?.addEventListener("click", () => { m.remove(); instalarAgora(); });
  setTimeout(() => document.addEventListener("click", function fecha(e) {
    if (!m.contains(e.target)) { m.remove(); document.removeEventListener("click", fecha); }
  }), 0);
}

/* ============ MODAL: venda ============ */
function modalVenda(id) {
  const v = id ? D.vendas.find(x => x.id === id) : null;
  const novo = !v;
  const unidades = D.empresa?.unidades || [];
  const esperados = v ? (v.custosEsperados || []) : D.linhasCusto.filter(l => l.padrao).map(l => l.id);
  const lancados = v ? DB.custosDaVenda(v.id) : [];
  const custo = v ? DB.custoDaVenda(v.id) : 0;
  const com = v ? DB.comissaoDaVenda(v) : 0;
  const lb = v ? DB.lucroBrutoDaVenda(v) : 0;
  const pendentes = v ? DB.pendenciasDaVenda(v) : esperados;

  const linhasCustoHtml = esperados.map(lid => {
    const linha = D.linhasCusto.find(l => l.id === lid);
    const lanc = lancados.find(c => c.linhaCustoId === lid);
    return `<div class="linha-custo">
      <div class="nome">${esc(linha?.nome || "Custo")}</div>
      ${lanc ? `<div class="inp">${moeda(lanc.valor)}</div>
                ${podeEditar() ? `<button class="btn icone" data-edita-custo="${lanc.id}" title="Editar">${ICONS.lapis}</button>` : ""}`
             : `<div class="inp ph">a preencher</div><span class="tag wr">pendente</span>
                ${podeEditar() && v ? `<button class="btn mini" data-lancar="${v.id}|${lid}">Lançar</button>` : ""}`}
    </div>`;
  }).join("");

  const extras = lancados.filter(c => !esperados.includes(c.linhaCustoId));

  const corpo = `
    <div class="blk">A venda</div>
    <div class="field"><div class="fl">Cliente</div>
      <div class="campo"><input id="v-cliente" value="${esc(v?.cliente || "")}" placeholder="Nome do cliente"></div></div>
    <div class="field"><div class="fl">Vendedor</div>
      <div class="campo"><input id="v-vendedor" value="${esc(v?.vendedor || "")}" placeholder="Quem fechou"></div></div>
    <div class="field"><div class="fl">Data da venda</div>
      <div class="campo"><input type="date" id="v-data" value="${esc(v?.data || hojeISO())}"></div></div>
    ${unidades.length ? `<div class="field"><div class="fl">Unidade</div>
      <div class="campo"><select id="v-unidade">${["", ...unidades].map(u =>
        `<option value="${esc(u)}" ${v?.unidade === u ? "selected" : ""}>${u || "— sem unidade —"}</option>`).join("")}</select></div></div>` : ""}
    <div class="field"><div class="fl">Potência (kWp)</div>
      <div class="campo"><input class="num-in" id="v-kwp" value="${v?.kwp ?? ""}" placeholder="0,00"></div></div>
    <div class="field"><div class="fl">Valor da venda</div>
      <div class="campo"><input class="num-in" id="v-valor" value="${v ? numero(v.valorVenda) : ""}" placeholder="0,00"></div></div>

    <div class="blk">Comissões</div>
    <div id="v-comissoes">${(v?.comissoes?.length ? v.comissoes : [{ papel: "vendedor", tipo: "valor", valor: 0 }])
      .map((c, i) => linhaComissao(c, i)).join("")}</div>
    <button class="addline" id="v-add-com">${ICONS.mais}Acrescentar comissão</button>

    ${v ? `<div class="blk">Custos desta venda</div>
      ${linhasCustoHtml}
      ${extras.map(c => `<div class="linha-custo">
        <div class="nome">${esc(c.descricao)}</div><div class="inp">${moeda(c.valor)}</div>
        ${podeEditar() ? `<button class="btn icone" data-edita-custo="${c.id}">${ICONS.lapis}</button>` : ""}
      </div>`).join("")}
      ${podeEditar() ? `<button class="addline" id="v-add-custo">${ICONS.mais}Acrescentar linha de custo</button>` : ""}

      <div class="viv">
        <div class="it"><div class="l">Custo total</div><div class="v">${moeda(custo + com)}</div></div>
        <div class="it"><div class="l">Lucro bruto</div><div class="v gold">${moeda(lb)}</div></div>
        <div class="it"><div class="l">Margem</div><div class="v">${v.valorVenda ? pct(lb / v.valorVenda * 100) : "—"}</div></div>
        ${pendentes.length ? `<div class="it" style="flex:1.5;min-width:190px"><span class="tag wr">provisório</span>
          <div class="l" style="margin-top:6px;line-height:1.45">A margem muda quando ${pendentes.length === 1 ? "o custo pendente for lançado" : "os custos pendentes forem lançados"}.</div></div>` : ""}
      </div>`
    : `<div class="txt" style="margin-top:18px;padding-left:12px;border-left:2px solid var(--line)">
        Depois de salvar, as linhas de custo desta venda aparecem aqui para preenchimento.</div>`}
  `;

  const rodape = podeEditar()
    ? `<button class="btn pri" id="v-salvar">Salvar</button>
       <button class="btn" data-fechar>Cancelar</button>
       <div style="flex:1"></div>
       ${v ? `<button class="btn plano" id="v-excluir">${ICONS.lixeira}Excluir</button>` : ""}`
    : `<button class="btn" data-fechar>Fechar</button>`;

  abrirModal(molduraModal(v ? v.cliente : "Nova venda",
    v ? `${v.vendedor || "—"} · ${fmtData(v.data)}${v.unidade ? " · " + v.unidade : ""}` : "",
    corpo, rodape, { largura: 720 }));

  ligarModalVenda(v);
}

function linhaComissao(c, i) {
  const papeis = ["vendedor", "SDR", "prospectador"];
  return `<div class="field com-linha" data-i="${i}">
    <div class="fl"><select class="c-papel">${papeis.map(p =>
      `<option ${c.papel === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>
    <div class="seg"><button type="button" class="c-tipo ${c.tipo === "pct" ? "on" : ""}" data-t="pct">%</button>
      <button type="button" class="c-tipo ${c.tipo !== "pct" ? "on" : ""}" data-t="valor">R$</button></div>
    <div class="campo" style="max-width:130px"><input class="num-in c-num" value="${numero(c.tipo === "pct" ? (c.pct || 0) : (c.valor || 0))}"></div>
    <div class="calc c-espelho">—</div>
    <button type="button" class="btn icone c-rm" title="Remover">${ICONS.x}</button>
  </div>`;
}

function ligarModalVenda(v) {
  const box = document.getElementById("v-comissoes");

  const recalcular = () => {
    const valor = lerValor(document.getElementById("v-valor")?.value);
    box?.querySelectorAll(".com-linha").forEach(l => {
      const pctAtivo = l.querySelector('.c-tipo[data-t="pct"]').classList.contains("on");
      const n = lerValor(l.querySelector(".c-num").value);
      l.querySelector(".c-espelho").textContent = pctAtivo
        ? `= ${moeda(valor * n / 100)}`
        : `= ${valor ? numero(n / valor * 100) : "0,00"}% do valor`;
    });
  };

  document.getElementById("v-valor")?.addEventListener("input", recalcular);
  const ligaLinhas = () => {
    box?.querySelectorAll(".com-linha").forEach(l => {
      l.querySelectorAll(".c-tipo").forEach(b => b.onclick = () => {
        l.querySelectorAll(".c-tipo").forEach(o => o.classList.remove("on"));
        b.classList.add("on"); recalcular();
      });
      l.querySelector(".c-num").oninput = recalcular;
      l.querySelector(".c-rm").onclick = () => { l.remove(); recalcular(); };
    });
  };
  ligaLinhas(); recalcular();

  document.getElementById("v-add-com")?.addEventListener("click", () => {
    box.insertAdjacentHTML("beforeend", linhaComissao({ papel: "vendedor", tipo: "valor", valor: 0 }, box.children.length));
    ligaLinhas(); recalcular();
  });

  document.querySelectorAll("[data-edita-custo]").forEach(b =>
    b.addEventListener("click", e => { e.stopPropagation(); modalCusto(b.dataset.editaCusto); }));
  document.querySelectorAll("#modal [data-lancar]").forEach(b =>
    b.addEventListener("click", () => {
      const [vid, lid] = b.dataset.lancar.split("|");
      modalCusto(null, { vendaId: vid, linhaCustoId: lid });
    }));
  document.getElementById("v-add-custo")?.addEventListener("click", () =>
    modalCusto(null, { vendaId: v.id }));

  document.getElementById("v-salvar")?.addEventListener("click", async () => {
    const cliente = document.getElementById("v-cliente").value.trim();
    const data = document.getElementById("v-data").value;
    const valorVenda = lerValor(document.getElementById("v-valor").value);
    if (!cliente) return toast("Escreva o nome do cliente.", "erro");
    if (!data) return toast("Escolha a data da venda.", "erro");
    if (valorVenda <= 0) return toast("O valor da venda precisa ser maior que zero.", "erro");

    const comissoes = [...(box?.querySelectorAll(".com-linha") || [])].map(l => {
      const pctAtivo = l.querySelector('.c-tipo[data-t="pct"]').classList.contains("on");
      const n = lerValor(l.querySelector(".c-num").value);
      return {
        papel: l.querySelector(".c-papel").value,
        tipo: pctAtivo ? "pct" : "valor",
        pct: pctAtivo ? n : arredondar2(valorVenda ? n / valorVenda * 100 : 0),
        valor: pctAtivo ? arredondar2(valorVenda * n / 100) : n
      };
    }).filter(c => c.valor > 0);

    const esperados = v ? (v.custosEsperados || []) : D.linhasCusto.filter(l => l.padrao).map(l => l.id);
    const dados = {
      cliente, vendedor: document.getElementById("v-vendedor").value.trim(),
      unidade: document.getElementById("v-unidade")?.value || null,
      data, kwp: lerValor(document.getElementById("v-kwp").value) || null,
      valorVenda, descontoTipo: v?.descontoTipo || "pct", descontoValor: v?.descontoValor || 0,
      comissoes, custosEsperados: esperados,
      pendencias: v ? DB.pendenciasDaVenda(v).length : esperados.length
    };
    const novoId = await DB.salvarVenda(v?.id, dados);
    fecharModal();
    toast(v ? "Venda atualizada." : "Venda criada. Agora lance os custos dela.", "ok");
    if (!v) setTimeout(() => modalVenda(novoId), 400);
  });

  document.getElementById("v-excluir")?.addEventListener("click", async () => {
    const n = DB.custosDaVenda(v.id).length;
    const ok = await confirmar(
      `Excluir a venda de ${v.cliente}?${n ? ` Os ${n} custo${n > 1 ? "s" : ""} lançado${n > 1 ? "s" : ""} nela também ${n > 1 ? "somem" : "some"}.` : ""}`);
    if (!ok) return;
    await DB.excluirVenda(v.id);
    fecharModal();
    toast("Venda excluída.", "ok");
  });
}

/* ============ MODAL: custo ============ */
function modalCusto(id, pre = {}) {
  const c = id ? D.custos.find(x => x.id === id) : null;
  const vendaId = c?.vendaId ?? pre.vendaId ?? null;
  const linhaId = c?.linhaCustoId ?? pre.linhaCustoId ?? null;
  const venda = vendaId ? D.vendas.find(v => v.id === vendaId) : null;
  const unidades = D.empresa?.unidades || [];
  const linha = linhaId ? D.linhasCusto.find(l => l.id === linhaId) : null;

  const corpo = `
    <div class="field"><div class="fl">Descrição</div>
      <div class="campo"><input id="c-desc" value="${esc(c?.descricao || linha?.nome || "")}" placeholder="O que foi pago"></div></div>
    <div class="field"><div class="fl">Valor</div>
      <div class="campo"><input class="num-in" id="c-valor" value="${c ? numero(c.valor) : ""}" placeholder="0,00"></div></div>
    <div class="field"><div class="fl">Pago em</div>
      <div class="campo"><input type="date" id="c-data" value="${esc(c?.dataPagamento || hojeISO())}"></div></div>
    ${unidades.length ? `<div class="field"><div class="fl">Unidade</div>
      <div class="campo"><select id="c-unidade">${["", ...unidades].map(u =>
        `<option value="${esc(u)}" ${(c?.unidade || "") === u ? "selected" : ""}>${u || "— sem unidade —"}</option>`).join("")}</select></div></div>` : ""}

    <div class="blk">Vínculo</div>
    <div class="field"><div class="fl">Venda</div>
      <div class="campo"><select id="c-venda">
        <option value="">— sem vínculo (custo não previsto) —</option>
        ${D.vendas.map(v => `<option value="${v.id}" ${vendaId === v.id ? "selected" : ""}>${esc(v.cliente)} · ${fmtDataCurta(v.data)}</option>`).join("")}
      </select></div></div>
    <div class="txt" style="font-size:12.5px;margin-top:10px;padding-left:12px;border-left:2px solid var(--line)">
      Com venda vinculada, o custo entra <b>antes</b> do lucro bruto. Sem vínculo, entra <b>depois</b>,
      junto com os custos não previstos.</div>
  `;

  abrirModal(molduraModal(c ? "Editar custo" : "Lançar custo",
    venda ? `Vinculado a ${venda.cliente}` : "", corpo,
    `<button class="btn pri" id="c-salvar">Salvar</button>
     <button class="btn" data-fechar>Cancelar</button>
     <div style="flex:1"></div>
     ${c && !c.fixoId ? `<button class="btn plano" id="c-excluir">${ICONS.lixeira}Excluir</button>` : ""}`,
    { largura: 560 }));

  document.getElementById("c-salvar").addEventListener("click", async () => {
    const descricao = document.getElementById("c-desc").value.trim();
    const valor = lerValor(document.getElementById("c-valor").value);
    const dataPagamento = document.getElementById("c-data").value;
    if (!descricao) return toast("Escreva a descrição do custo.", "erro");
    if (!dataPagamento) return toast("Escolha a data em que foi pago.", "erro");
    if (valor <= 0) return toast("O valor precisa ser maior que zero.", "erro");

    const vid = document.getElementById("c-venda").value || null;
    await DB.salvarCusto(c?.id, {
      descricao, valor, dataPagamento,
      unidade: document.getElementById("c-unidade")?.value || null,
      linhaCustoId: linhaId || null,
      origem: vid ? "venda" : (c?.fixoId ? c.origem : "avulso"),
      vendaId: vid, clienteId: c?.clienteId || null, fixoId: c?.fixoId || null
    });
    fecharModal();
    toast("Custo salvo.", "ok");
  });

  document.getElementById("c-excluir")?.addEventListener("click", async () => {
    if (!await confirmar(`Excluir o custo "${c.descricao}"?`)) return;
    await DB.excluirCusto(c.id);
    fecharModal();
    toast("Custo excluído.", "ok");
  });
}

/* ============ MODAL: custo fixo e folha ============ */
function modalFixo(id) {
  const f = id ? D.fixos.find(x => x.id === id) : null;
  const tipo = f?.tipo || S.abaFixos;
  const unidades = D.empresa?.unidades || [];
  const folha = tipo === "folha";

  const corpo = `
    <div class="field"><div class="fl">Tipo</div>
      <div class="seg"><button type="button" class="f-tipo ${!folha ? "on" : ""}" data-t="fixo">Custo fixo</button>
        <button type="button" class="f-tipo ${folha ? "on" : ""}" data-t="folha">Folha</button></div></div>
    <div class="field"><div class="fl">${folha ? "Nome da pessoa" : "Nome da linha"}</div>
      <div class="campo"><input id="f-nome" value="${esc(f?.nome || "")}" placeholder="${folha ? "Nome completo" : "Aluguel, internet, energia…"}"></div></div>
    <div class="field"><div class="fl">${folha ? "Salário" : "Valor base"}</div>
      <div class="campo"><input class="num-in" id="f-valor" value="${f ? numero(f.valor) : ""}" placeholder="0,00"></div></div>
    <div class="field"><div class="fl">Dia de vencimento</div>
      <div class="campo"><input type="number" min="1" max="31" id="f-dia" value="${f?.diaVencimento || 5}"></div></div>
    ${unidades.length ? `<div class="field"><div class="fl">Unidade</div>
      <div class="campo"><select id="f-unidade">${["", ...unidades].map(u =>
        `<option value="${esc(u)}" ${(f?.unidade || "") === u ? "selected" : ""}>${u || "— sem unidade —"}</option>`).join("")}</select></div></div>` : ""}

    <div id="f-folha" class="${folha ? "" : "oculto"}">
      <div class="blk">Dados da folha</div>
      <div class="field"><div class="fl">Função</div>
        <div class="campo"><input id="f-funcao" value="${esc(f?.funcao || "")}" placeholder="Vendedor, CEO, financeiro…"></div></div>
      <div class="field"><div class="fl">Grupo</div>
        <div class="campo"><input id="f-grupo" value="${esc(f?.grupo || "")}" placeholder="Administrativo, Vendedores, Prospectadores"></div></div>
      <div class="field"><div class="fl">Ajuda de custo</div>
        <div class="campo"><input class="num-in" id="f-ajuda" value="${f?.ajudaCusto ? numero(f.ajudaCusto) : ""}" placeholder="0,00"></div></div>
      <div class="field"><div class="fl">Gastos extras</div>
        <div class="campo"><input class="num-in" id="f-extras" value="${f?.extras ? numero(f.extras) : ""}" placeholder="0,00"></div></div>
      <div class="field"><div class="fl">É pró-labore</div>
        <div style="flex:1"><div class="switch ${f?.proLabore ? "" : "off"}" id="f-prolabore"><i></i></div></div></div>
    </div>

    <div class="field"><div class="fl">Ativo</div>
      <div style="flex:1"><div class="switch ${f?.ativo === false ? "off" : ""}" id="f-ativo"><i></i></div>
      <div class="txt" style="font-size:12px;margin-top:8px">Pausado, não gera lançamento nos próximos meses.</div></div></div>
  `;

  abrirModal(molduraModal(f ? f.nome : "Nova linha", "", corpo,
    `<button class="btn pri" id="f-salvar">Salvar</button>
     <button class="btn" data-fechar>Cancelar</button>
     <div style="flex:1"></div>
     ${f ? `<button class="btn plano" id="f-excluir">${ICONS.lixeira}Excluir</button>` : ""}`,
    { largura: 600 }));

  let tipoAtual = tipo;
  document.querySelectorAll(".f-tipo").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".f-tipo").forEach(o => o.classList.remove("on"));
    b.classList.add("on");
    tipoAtual = b.dataset.t;
    document.getElementById("f-folha").classList.toggle("oculto", tipoAtual !== "folha");
  }));
  ["f-prolabore", "f-ativo"].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.addEventListener("click", () => el.classList.toggle("off"));
  });

  document.getElementById("f-salvar").addEventListener("click", async () => {
    const nome = document.getElementById("f-nome").value.trim();
    const valor = lerValor(document.getElementById("f-valor").value);
    if (!nome) return toast("Escreva o nome.", "erro");
    const dados = {
      nome, valor, tipo: tipoAtual,
      diaVencimento: Math.min(Math.max(Number(document.getElementById("f-dia").value) || 5, 1), 31),
      ativo: !document.getElementById("f-ativo").classList.contains("off"),
      unidade: document.getElementById("f-unidade")?.value || null
    };
    if (tipoAtual === "folha") Object.assign(dados, {
      funcao: document.getElementById("f-funcao").value.trim(),
      grupo: document.getElementById("f-grupo").value.trim() || "Equipe",
      ajudaCusto: lerValor(document.getElementById("f-ajuda").value),
      extras: lerValor(document.getElementById("f-extras").value),
      proLabore: !document.getElementById("f-prolabore").classList.contains("off")
    });
    await DB.salvarFixo(f?.id, dados);
    fecharModal();
    render();
    toast("Salvo.", "ok");
  });

  document.getElementById("f-excluir")?.addEventListener("click", async () => {
    if (!await confirmar(`Excluir "${f.nome}" da base? Os lançamentos já feitos continuam.`)) return;
    await DB.excluirFixo(f.id);
    fecharModal();
    render();
    toast("Removido da base.", "ok");
  });
}

/* ============ MODAL: composição de um número ============ */
function modalComposicao(chave) {
  const r = resumo();
  const mes = nomeMesRef(S.mesRef);
  let titulo = "", sub = "", itens = [];

  const cs = custosFiltrados();
  if (chave === "faturamento") {
    titulo = "Faturamento"; sub = `Vendas fechadas em ${mes}`;
    itens = vendasFiltradas().slice().sort((a, b) => b.valorVenda - a.valorVenda)
      .map(v => ({ n: v.cliente, d: `${v.vendedor || "—"} · ${fmtDataCurta(v.data)}`, v: v.valorVenda }));
  } else if (chave === "base") {
    titulo = "Custos vinculados às vendas"; sub = `Custo direto dos projetos de ${mes}`;
    itens = cs.filter(c => c.origem === "venda")
      .sort((a, b) => b.valor - a.valor)
      .map(c => ({ n: c.descricao, d: rotuloRef(c), v: c.valor }));
  } else if (chave === "com") {
    titulo = "Comissões"; sub = `Pagas sobre as vendas de ${mes}`;
    vendasFiltradas().forEach(v => (v.comissoes || []).forEach(c => {
      if (c.valor > 0) itens.push({ n: `${c.papel} — ${v.cliente}`, d: c.tipo === "pct" ? `${numero(c.pct)}% da venda` : "valor fixo", v: c.valor });
    }));
    itens.sort((a, b) => b.v - a.v);
  } else if (chave === "fixo" || chave === "imp") {
    const so = chave === "imp";
    titulo = so ? "Impostos" : "Custos fixos e folha";
    sub = `Recorrentes de ${mes}`;
    itens = cs.filter(c => so ? c.origem === "imposto" : (c.origem === "fixo" || c.origem === "folha"))
      .sort((a, b) => b.valor - a.valor)
      .map(c => ({ n: c.descricao, d: fmtData(c.dataPagamento), v: c.valor }));
  } else if (chave === "naoprev") {
    titulo = "Custos não previstos"; sub = `Lançados em ${mes} sem vínculo com venda`;
    itens = cs.filter(c => c.origem === "avulso")
      .sort((a, b) => b.valor - a.valor)
      .map(c => ({ n: c.descricao, d: `${rotuloRef(c)} · pago em ${fmtDataCurta(c.dataPagamento)}`, v: c.valor }));
  }

  const total = arredondar2(itens.reduce((s, x) => s + x.v, 0));
  const corpo = itens.length
    ? `<table><tbody>${itens.map(x => `<tr>
        <td style="padding-left:20px"><div class="nm2">${esc(x.n)}</div>
          ${x.d ? `<div style="color:var(--ink-faint);font-size:11.5px;margin-top:2px">${esc(x.d)}</div>` : ""}</td>
        <td class="r mono" style="padding-right:8px;color:var(--ink-faint);width:64px">${total ? numero(x.v / total * 100, 1) : "0,0"}%</td>
        <td class="r mono" style="padding-right:20px;white-space:nowrap">${moeda(x.v)}</td>
      </tr>`).join("")}</tbody></table>`
    : `<div class="vazia">Nenhum lançamento neste grupo</div>`;

  abrirModal(molduraModal(titulo, sub, corpo,
    `<div style="flex:1;font-size:12.5px;color:var(--ink-soft)">${itens.length} ${itens.length === 1 ? "lançamento" : "lançamentos"}</div>
     <div class="num" style="font-size:16px;font-weight:600">${moeda(total)}</div>`, { largura: 620 }));
  document.querySelector("#modal .cnt").style.padding = "6px 0 0";
}

/* ============ configurações: ligações ============ */
function ligarConfig() {
  if (S.tela !== "config") return;
  const cnpj = document.getElementById("cfg-cnpj");
  if (cnpj) aplicarMascara(cnpj, mascaraCNPJ);

  const sw = document.getElementById("sw-jornada");
  if (sw) {
    const alterna = async () => {
      const ligado = sw.classList.contains("off");
      sw.classList.toggle("off");
      sw.setAttribute("aria-checked", String(ligado));
      await DB.salvarEmpresa({ autorizaJornada: ligado });
      toast(ligado ? "A Jornada passa a enxergar os números desta empresa."
                   : "Acesso da Jornada desligado.", "ok");
    };
    sw.addEventListener("click", alterna);
    sw.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); alterna(); } });
  }

  document.getElementById("btn-logo")?.addEventListener("click", () =>
    document.getElementById("cfg-logo").click());
  document.getElementById("cfg-logo")?.addEventListener("change", async ev => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const b64 = await imagemParaBase64(file);
      await DB.salvarEmpresa({ logoBase64: b64 });
      render();
      toast("Logo atualizada.", "ok");
    } catch (e) { toast(e.message, "erro"); }
  });
  document.getElementById("btn-tirar-logo")?.addEventListener("click", async () => {
    await DB.salvarEmpresa({ logoBase64: null });
    render();
    toast("Logo removida.", "ok");
  });

  document.getElementById("btn-salvar-empresa")?.addEventListener("click", async () => {
    const nome = document.getElementById("cfg-nome").value.trim();
    if (!nome) return toast("A empresa precisa de um nome.", "erro");
    await DB.salvarEmpresa({
      nome, cnpj: document.getElementById("cfg-cnpj").value.trim(),
      mesAbertura: document.getElementById("cfg-abertura").value || null
    });
    render();
    toast("Configurações salvas.", "ok");
  });

  document.getElementById("btn-add-unidade")?.addEventListener("click", () => {
    abrirModal(molduraModal("Nova unidade", "", `
      <div class="campo"><span>Nome da unidade</span>
        <input id="nova-uni" placeholder="Matriz, Marambaia, Mauriti…"></div>`,
      `<button class="btn pri" id="salva-uni">Adicionar</button>
       <button class="btn" data-fechar>Cancelar</button>`, { largura: 420 }));
    document.getElementById("salva-uni").addEventListener("click", async () => {
      const u = document.getElementById("nova-uni").value.trim();
      if (!u) return toast("Escreva o nome.", "erro");
      const lista = [...(D.empresa.unidades || [])];
      if (lista.includes(u)) return toast("Essa unidade já existe.", "erro");
      lista.push(u);
      await DB.salvarEmpresa({ unidades: lista });
      fecharModal(); render(); toast("Unidade adicionada.", "ok");
    });
  });

  document.querySelectorAll("[data-rm-uni]").forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    const u = b.dataset.rmUni;
    if (!await confirmar(`Remover a unidade "${u}"? Os lançamentos que já usam ela continuam como estão.`,
      { textoConfirmar: "Remover" })) return;
    await DB.salvarEmpresa({ unidades: (D.empresa.unidades || []).filter(x => x !== u) });
    render(); toast("Unidade removida.", "ok");
  }));

  document.getElementById("btn-add-linha")?.addEventListener("click", () => {
    abrirModal(molduraModal("Nova linha de custo", "", `
      <div class="campo"><span>Nome da linha</span>
        <input id="nova-linha" placeholder="Custo de obra, guindaste…"></div>
      <div class="txt" style="font-size:12.5px;margin-top:14px">
        Ela fica disponível para acrescentar dentro de uma venda. Não entra sozinha em venda nova.</div>`,
      `<button class="btn pri" id="salva-linha">Adicionar</button>
       <button class="btn" data-fechar>Cancelar</button>`, { largura: 440 }));
    document.getElementById("salva-linha").addEventListener("click", async () => {
      const n = document.getElementById("nova-linha").value.trim();
      if (!n) return toast("Escreva o nome.", "erro");
      await DB.salvarLinhaCusto(null, { nome: n, padrao: false, ordem: 90 + D.linhasCusto.length });
      fecharModal(); render(); toast("Linha criada.", "ok");
    });
  });

  document.querySelectorAll("[data-rm-linha]").forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    const l = D.linhasCusto.find(x => x.id === b.dataset.rmLinha);
    if (!await confirmar(`Remover a linha "${l?.nome}"? Os custos já lançados com ela continuam.`,
      { textoConfirmar: "Remover" })) return;
    await DB.excluirLinhaCusto(b.dataset.rmLinha);
    render(); toast("Linha removida.", "ok");
  }));
}

/* ============ exportar DRE ============ */
function exportarDRE() {
  const r = resumo();
  const e = D.empresa || {};
  const linha = (n, v, neg) => `<tr><td>${n}</td><td class="r">${neg ? "− " : ""}${moeda(v)}</td></tr>`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>DRE ${rotuloPeriodo()} — ${esc(e.nome || "")}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;max-width:720px;margin:36px auto;padding:0 24px}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#666;font-size:13px;margin-bottom:26px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td{padding:10px 0;border-bottom:1px solid #eee} td.r{text-align:right;font-variant-numeric:tabular-nums}
  tr.tot td{font-weight:700;border-top:2px solid #111;border-bottom:none;padding-top:14px;font-size:15px}
  .rod{margin-top:30px;font-size:11px;color:#999}
  @media print{body{margin:0}}
</style></head><body>
<h1>${esc(e.nome || "Empresa")}</h1>
<div class="sub">Demonstrativo de resultado · ${esc(rotuloPeriodo())}${S.unidade !== "todas" ? " · " + esc(S.unidade) : ""}</div>
<table>
  ${linha("Faturamento", r.venda)}
  ${linha("Custos vinculados às vendas", r.base, true)}
  ${linha("Comissões", r.comissoes, true)}
  <tr class="tot"><td>Lucro bruto (${pct(r.margemBruta)})</td><td class="r">${moeda(r.lucroBruto)}</td></tr>
  ${r.naoPrevisto ? linha("Custos não previstos", r.naoPrevisto, true) : ""}
  ${linha("Custos fixos e folha", r.fixos, true)}
  ${linha("Impostos", r.imposto, true)}
  <tr class="tot"><td>Lucro líquido (${pct(r.margemLiquida)})</td><td class="r">${moeda(r.lucroLiquido)}</td></tr>
</table>
<div class="rod">Gerado em ${fmtData(hojeISO())} · ${r.nVendas} venda${r.nVendas === 1 ? "" : "s"} no período</div>
<script>print()<\/script></body></html>`;

  const w = window.open("", "_blank");
  if (!w) return toast("O navegador bloqueou a janela. Libere os pop-ups para exportar.", "erro");
  w.document.write(html);
  w.document.close();
}

/* ============ partida ============ */
// Enquanto a config do Firebase for a de exemplo, o sistema abre em modo de
// demonstração, com dados fictícios, para dar pra conferir todas
// as telas antes de criar o projeto. Assim que a config real for colada, este
// desvio deixa de acontecer sozinho.
const { firebaseConfig } = await import("./firebase-init.js");
if (firebaseConfig.projectId === "COLE_AQUI") {
  const demo = await import("./modo-demonstracao.js");
  demo.ativar();
  S.mesRef = demo.MES_DEMO;
  document.getElementById("entrada").classList.add("oculto");
  document.getElementById("app").classList.remove("oculto");
  montarNavegacao();
  S.pronto = true;
  render();
  toast("Modo demonstração: nada é salvo. Cole a config do Firebase para usar de verdade.", "ok", 9000);
} else {
iniciarAuth({
  aoEntrar: async () => {
    montarNavegacao();
    pintar(carregando());
    if (ehJornada() && !SESSAO.empresaId) {
      S.tela = "mentorados";
      try { await carregarJornada(); } catch (e) { console.error(e); }
      S.pronto = true;
      render();
      return;
    }
    try {
      await DB.carregarEmpresa();
      if (!D.empresa) {
        pintar(vazioTela("Empresa não encontrada",
          "O acesso existe, mas a empresa vinculada a ele não. Fale com a Jornada."));
        return;
      }
      await DB.carregarBase();
      DB.escutarFechamentos();
      DB.escutarMes(S.mesRef);
      DB.quandoMudar(dadosMudaram);
      S.pronto = true;
      render();
    } catch (e) {
      console.error(e);
      pintar(vazioTela("Não consegui carregar", "Confira sua conexão e recarregue a página."));
    }
  },
  aoSair: () => { DB.fecharTudo(); S.pronto = false; }
});
}
