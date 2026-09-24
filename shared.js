// Utilitários compartilhados por todas as telas.
// Um arquivo só, importado como módulo — nunca colar o mesmo utilitário em
// dois lugares.

/* ============ formatação ============ */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function moeda(n) {
  const v = Number(n) || 0;
  return (v < 0 ? "−" : "") + "R$ " + Math.abs(v)
    .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function moedaCurta(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1000) return (v < 0 ? "−" : "") + "R$ " + (a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return moeda(v);
}

export function pct(n, casas = 2) {
  return (Number(n) || 0).toLocaleString("pt-BR",
    { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
}

export function numero(n, casas = 2) {
  return (Number(n) || 0).toLocaleString("pt-BR",
    { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/* Datas sempre em America/Sao_Paulo e sempre como string AAAA-MM-DD.
   Nunca `new Date(str)` em data pura: isso interpreta como UTC e volta um
   dia em fuso negativo. Este é o bug que já apareceu cinco vezes. */
export function hojeISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
export function parseDataLocal(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(a, m - 1, d);
}
export function fmtData(iso) {
  if (!iso) return "—";
  const [a, m, d] = String(iso).split("-");
  return `${d}/${m}/${a}`;
}
export function fmtDataCurta(iso) {
  if (!iso) return "—";
  const [, m, d] = String(iso).split("-");
  return `${d}/${m}`;
}
export const mesRefDe = iso => String(iso || "").slice(0, 7);   // AAAA-MM

export const MES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MES_CURTO = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function nomeMesRef(mesRef) {
  if (!mesRef) return "";
  const [a, m] = mesRef.split("-");
  return `${MES_NOME[+m - 1]} de ${a}`;
}
export function diasNoMes(mesRef) {
  const [a, m] = mesRef.split("-").map(Number);
  return new Date(a, m, 0).getDate();
}

export function iniciais(nome) {
  return String(nome || "?").trim().split(/\s+/).slice(0, 2)
    .map(p => p[0]).join("").toUpperCase();
}

export function arredondar2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ============ ícones (SVG inline, estilo feather — nunca emoji) ============ */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS = {
  painel: svg(`<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>`),
  vendas: svg(`<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>`),
  relogio: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 1.8"/>`),
  custos: svg(`<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18.5" cy="17" r="2.2"/>`),
  predio: svg(`<path d="M3 21V9l7-5 7 5v12"/><path d="M9 21v-5h4v5"/><path d="M17 12h4v9h-4"/>`),
  engrenagem: svg(`<circle cx="12" cy="12" r="3"/><path d="M19.9 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H4a2 2 0 110-4h.1A1.7 1.7 0 003.7 8a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H10a1.7 1.7 0 001-1.5V4a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V10a1.7 1.7 0 001.5 1h.2a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>`),
  mais: svg(`<path d="M12 5v14M5 12h14"/>`),
  x: svg(`<path d="M18 6L6 18M6 6l12 12"/>`),
  lapis: svg(`<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>`),
  lixeira: svg(`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>`),
  seta: svg(`<path d="M9 6l6 6-6 6"/>`),
  baixar: svg(`<path d="M12 15V3M8 11l4 4 4-4M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3"/>`),
  enviar: svg(`<path d="M12 3v12M8 7l4-4 4 4M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3"/>`),
  calendario: svg(`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>`),
  filtro: svg(`<path d="M4 6h16M7 12h10M10 18h4"/>`),
  sair: svg(`<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>`),
  aviso: svg(`<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>`),
  check: svg(`<path d="M20 6L9 17l-5-5"/>`)
};

/* ============ toast ============ */
export function toast(msg, tipo = "info", ms = 4500) {
  let caixa = document.getElementById("toasts");
  if (!caixa) {
    caixa = document.createElement("div");
    caixa.id = "toasts";
    document.body.appendChild(caixa);
  }
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.innerHTML = `<span class="ic">${tipo === "erro" ? ICONS.aviso : ICONS.check}</span><span>${esc(msg)}</span>`;
  caixa.appendChild(t);
  setTimeout(() => {
    t.classList.add("saindo");
    setTimeout(() => t.remove(), 260);
  }, ms);
}

/* ============ modal ============ */
// Nunca confirm(), alert() ou prompt() nativos.
let aoFecharModal = null;

export function abrirModal(html, { aoFechar } = {}) {
  const alvo = document.getElementById("modal");
  alvo.innerHTML = html;
  aoFecharModal = aoFechar || null;
  const scrim = alvo.querySelector(".scrim");
  scrim.addEventListener("click", e => { if (e.target === scrim) fecharModal(); });
  alvo.querySelectorAll("[data-fechar]").forEach(b =>
    b.addEventListener("click", fecharModal));
  const primeiro = alvo.querySelector("input,textarea,select,button");
  if (primeiro) setTimeout(() => primeiro.focus(), 60);
}

export function fecharModal() {
  const alvo = document.getElementById("modal");
  const m = alvo.querySelector(".modal");
  if (!m) return;
  m.style.animation = "pular .18s var(--ease) reverse forwards";
  setTimeout(() => {
    alvo.innerHTML = "";
    if (aoFecharModal) { const f = aoFecharModal; aoFecharModal = null; f(); }
  }, 160);
}

export function molduraModal(titulo, sub, corpo, rodape, { largura = 620 } = {}) {
  return `<div class="scrim"><div class="modal" style="max-width:${largura}px">
    <header>
      <div style="flex:1"><h3>${esc(titulo)}</h3>${sub ? `<div class="sb">${esc(sub)}</div>` : ""}</div>
      <button class="x" data-fechar aria-label="Fechar">${ICONS.x}</button>
    </header>
    <div class="cnt">${corpo}</div>
    ${rodape ? `<footer>${rodape}</footer>` : ""}
  </div></div>`;
}

export function confirmar(mensagem, { textoConfirmar = "Excluir", perigo = true } = {}) {
  return new Promise(resolve => {
    let respondido = false;
    abrirModal(molduraModal("Confirmar", "", `<p class="txt">${esc(mensagem)}</p>`,
      `<button class="btn" data-fechar>Cancelar</button>
       <div style="flex:1"></div>
       <button class="btn ${perigo ? "perigo" : "pri"}" id="btn-confirma">${esc(textoConfirmar)}</button>`,
      { largura: 440 }), {
      aoFechar: () => { if (!respondido) { respondido = true; resolve(false); } }
    });
    document.getElementById("btn-confirma").addEventListener("click", () => {
      respondido = true; resolve(true); fecharModal();
    });
  });
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") fecharModal();
});

/* ============ escrita otimista ============ */
// A tela muda na hora; a Promise do Firestore só serve pra avisar de erro
// real. Com persistência offline ligada, set()/update() só resolve quando o
// servidor confirma — sem sinal, ela fica pendurada pra sempre.
export async function emSegundoPlano(promise, msgErro, aoFalhar) {
  try {
    await promise;
    return true;
  } catch (e) {
    console.error(msgErro, e);
    toast(msgErro, "erro");
    if (aoFalhar) aoFalhar(e);
    return false;
  }
}

/* ============ indicador de sincronização ============ */
const pendencias = new Set();
export function marcarSincronizando(chave, ativo) {
  if (ativo) pendencias.add(chave); else pendencias.delete(chave);
  const el = document.getElementById("sinc");
  if (el) el.classList.toggle("ativo", pendencias.size > 0);
}

/* Passe { includeMetadataChanges: true } em todo onSnapshot e chame isto
   com o snapshot: a bolinha acende enquanto houver escrita não confirmada. */
export function rastrearSincronizacao(chave, snap) {
  marcarSincronizando(chave, snap.metadata.hasPendingWrites);
}

/* ============ imagem: redimensiona e devolve base64 ============ */
// A logo do mentorado mora no documento da empresa, que é lido uma vez por
// sessão. Teto de 120 KB porque o documento do Firestore para em 1 MB.
export function imagemParaBase64(file, { maxLado = 480, tetoKB = 120 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("O arquivo precisa ser uma imagem."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxLado || h > maxLado) {
        const k = maxLado / Math.max(w, h);
        w = Math.round(w * k); h = Math.round(h * k);
      }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      // PNG preserva a transparência da logo; se ficar grande demais, cai
      // pra JPEG com fundo, que é pior mas cabe.
      let saida = c.toDataURL("image/png");
      if (saida.length / 1.37 / 1024 > tetoKB) {
        saida = c.toDataURL("image/jpeg", 0.82);
      }
      if (saida.length / 1.37 / 1024 > tetoKB) {
        return reject(new Error(`A imagem ficou acima de ${tetoKB} KB mesmo reduzida. Use um arquivo menor.`));
      }
      resolve(saida);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui ler esta imagem.")); };
    img.src = url;
  });
}

/* ============ máscaras ============ */
export function mascaraCNPJ(v) {
  return String(v).replace(/\D/g, "").slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
export function aplicarMascara(input, fn) {
  input.addEventListener("input", () => {
    const p = input.selectionStart, antes = input.value.length;
    input.value = fn(input.value);
    const d = input.value.length - antes;
    input.setSelectionRange(p + d, p + d);
  });
}

/* ============ entrada de valor em reais ============ */
export function lerValor(str) {
  if (typeof str === "number") return str;
  const s = String(str || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
