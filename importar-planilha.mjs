// Importa o histórico de uma planilha de custos para dentro do sistema.
// Roda uma vez, no computador, fora do navegador.
//
//   npm install xlsx firebase
//   node importar-planilha.mjs --empresa <ID_DA_EMPRESA> --conferir
//   node importar-planilha.mjs --empresa <ID_DA_EMPRESA> --gravar
//
// Sem `--gravar` ele só mostra o que faria. Confira antes.
//
// O que ele sabe sobre as planilhas, levantado antes de escrever isto:
//
//  1. Só a aba JULHO tem Cliente e Vendedor. As outras oito têm os números e
//     nenhum nome, e entram como "Venda N de <mês>".
//  2. As colunas mudam de aba pra aba (17 a 23). Por isso a leitura é pelo
//     NOME do cabeçalho, nunca pela posição: ler por posição gravaria kit
//     solar no campo de vistoria sem erro nenhum aparecer.
//  3. Não existe coluna de data da venda em aba nenhuma. Todas as vendas
//     importadas caem no dia 1º do mês, e o gráfico diário só passa a valer
//     do primeiro mês lançado dentro do sistema em diante.
//  4. Quatro células de kWp estão corrompidas: o Excel entendeu "6.10" como
//     data e gravou 2026-10-06. Essas entram vazias.
//  5. Em MAIO as linhas de custo fixo somam mais que o total declarado do
//     mês. O script usa o TOTAL DECLARADO e ajusta as linhas
//     proporcionalmente, porque é o total que a empresa usa.

// O firebase só é carregado na hora de gravar: assim a conferência roda com
// `npm install xlsx` apenas.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

/* ============ configuração ============ */
// Pasta onde está a planilha .xlsx a importar. Ela fica FORA do repositório.
const PASTA = process.env.PLANILHAS || String.raw`.\planilhas`;

// Cole a mesma config do firebase-init.js
const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI.firebasestorage.app",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

const ABAS = {
  "FEV MARAMBAIA": ["2026-02", "Marambaia"],
  "FEV MAURITI":   ["2026-02", "Mauriti"],
  "MAR MARAMBAIA": ["2026-03", "Marambaia"],
  "MAR MAURITI":   ["2026-03", "Mauriti"],
  "ABR MARAMBAIA": ["2026-04", "Marambaia"],
  "ABR MAURITI":   ["2026-04", "Mauriti"],
  "MAI MARAMBAIA": ["2026-05", "Marambaia"],
  "JUN MARAMBAIA": ["2026-06", "Marambaia"],
  "JULHO":         ["2026-07", "Marambaia"]
};

const LINHAS_PADRAO = [
  { id: "kit",        nome: "Kit solar",   colunas: ["Kit Solar"] },
  { id: "instalacao", nome: "Instalação",  colunas: ["Instalação"] },
  { id: "vistoria",   nome: "Vistoria",    colunas: ["Vistoria", "vistoria"] },
  { id: "engenharia", nome: "Engenharia",  colunas: ["Engenharia"] },
  { id: "obra",       nome: "Custo de obra", colunas: ["Custos com obras"] }
];

/* ============ argumentos ============ */
const args = process.argv.slice(2);
const pega = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const EMPRESA = pega("--empresa");
const GRAVAR = args.includes("--gravar");

if (!EMPRESA) {
  console.error("Faltou o ID da empresa.\n  node importar-planilha.mjs --empresa <ID> --conferir");
  process.exit(1);
}

/* ============ leitura ============ */
const arquivo = fs.readdirSync(PASTA).find(f => f.includes("CUSTOS") && f.endsWith(".xlsx"));
if (!arquivo) { console.error("Não achei a planilha de custos em " + PASTA); process.exit(1); }
const wb = XLSX.readFile(path.join(PASTA, arquivo));

const num = v => {
  if (typeof v === "number") return v;
  if (v instanceof Date) return null;              // kWp corrompido: entra vazio
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

function lerAba(nomeAba) {
  const ws = wb.Sheets[nomeAba];
  if (!ws) return null;
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // acha a linha de cabeçalho pelo conteúdo, não pela posição
  const iCab = linhas.findIndex(l => l.some(c =>
    typeof c === "string" && /^(Cliente|kWh|kWp)$/i.test(c.trim())));
  if (iCab < 0) return null;
  const cab = linhas[iCab].map(c => String(c ?? "").trim());
  const col = nome => cab.findIndex(c => c.toLowerCase() === nome.toLowerCase());
  const colQualquer = nomes => { for (const n of nomes) { const i = col(n); if (i >= 0) return i; } return -1; };

  const iTotal = colQualquer(["Total de Venda"]);
  const iValor = colQualquer(["Valor de Venda"]);
  const iCli   = colQualquer(["Cliente"]);
  const iVend  = colQualquer(["Vendedor"]);
  const iKwp   = colQualquer(["kWp"]);
  const iCom   = ["Comissão Vendedor", "Comissão SDR", "Comissão Prospectador", "Comissão"]
    .map(n => col(n)).filter(i => i >= 0);

  // A aba tem dois blocos empilhados, separados pela LINHA DE TOTAIS.
  // Isso importa: o valor "Custos Fixos" do bloco de baixo cai exatamente na
  // mesma coluna de "Total de Venda" do bloco de cima. Sem separar, o custo
  // fixo do mês entra como se fosse mais uma venda.
  const iNv = colQualquer(["Nº de Vendas"]);
  let iTotais = -1;
  for (let r = iCab + 1; r < linhas.length; r++) {
    const l = linhas[r]; if (!l) continue;
    const nv = iNv >= 0 ? num(l[iNv]) : 0;
    const cli = iCli >= 0 && l[iCli] ? String(l[iCli]).trim() : null;
    if (!cli && nv > 1) { iTotais = r; break; }
  }
  if (iTotais < 0) iTotais = Math.min(iCab + 30, linhas.length);

  const vendas = [];
  const fixos = [];
  const totalDeclarado = iTotal >= 0 ? num(linhas[iTotais]?.[iTotal]) : 0;
  let lbDeclarado = 0, cfDeclarado = 0;

  // ---- bloco de cima: uma linha por venda ----
  //
  // A coluna que vale é "Total de Venda". Existem linhas com "Valor de Venda"
  // preenchido e "Total de Venda" zerado: a própria planilha não soma essas
  // no fecho do mês, e por isso elas também não entram aqui. São orçamentos
  // digitados e não confirmados. Elas são contadas e avisadas no fim.
  let ignoradas = 0, valorIgnorado = 0;
  for (let r = iCab + 1; r < iTotais; r++) {
    const l = linhas[r]; if (!l) continue;
    const valor = iValor >= 0 ? num(l[iValor]) : 0;
    const total = iTotal >= 0 ? num(l[iTotal]) : 0;
    const cliente = iCli >= 0 && l[iCli] ? String(l[iCli]).trim() : null;
    if (total <= 0) {
      if (valor > 0) { ignoradas++; valorIgnorado += valor; }
      continue;
    }

    const custos = {};
    for (const lc of LINHAS_PADRAO) {
      const i = colQualquer(lc.colunas);
      const v = i >= 0 ? num(l[i]) : 0;
      if (v > 0) custos[lc.id] = v;
    }
    vendas.push({
      cliente,
      vendedor: iVend >= 0 && l[iVend] ? String(l[iVend]).trim() : null,
      kwp: iKwp >= 0 ? num(l[iKwp]) : null,
      valorVenda: total,
      custos,
      comissoes: iCom.map(i => num(l[i])).filter(v => v > 0)
    });
  }

  // ---- bloco de baixo: rótulo e valor do custo fixo ----
  const RESERVADOS = /^(CUSTO FIXO|VALORES|TOTAL|CUSTOS FIXOS|LUCRO BRUTO|LUCRO L[ÍI]QUIDO|LQ|BASE|\/|conciliação bancaria|giro de caixa|planejamento de mercado)$/i;
  for (let r = iTotais + 1; r < linhas.length; r++) {
    const l = linhas[r]; if (!l) continue;
    for (let c = 0; c < l.length; c++) {
      const v = l[c];
      if (typeof v !== "string") continue;
      const nome = v.trim();
      if (!nome) continue;
      if (/^Custos Fixos$/i.test(nome)) { cfDeclarado = num(linhas[r + 1]?.[c]) || num(linhas[r + 2]?.[c]) || cfDeclarado; continue; }
      if (/^Lucro Bruto$/i.test(nome))  { lbDeclarado = num(linhas[r + 1]?.[c]) || num(linhas[r + 2]?.[c]) || lbDeclarado; continue; }
      if (RESERVADOS.test(nome)) continue;
      const val = num(l[c + 2]) || num(l[c + 1]);
      if (val > 0) fixos.push({ nome, valor: val });
    }
  }

  return { vendas, fixos, totalDeclarado, lbDeclarado, cfDeclarado, ignoradas, valorIgnorado };
}

/* ============ montagem ============ */
const porMes = {};
const IGNORADAS = { n: 0, v: 0 };
for (const [aba, [mesRef, unidade]] of Object.entries(ABAS)) {
  const dados = lerAba(aba);
  if (!dados) { console.warn(`Aba ${aba} não lida.`); continue; }
  const m = (porMes[mesRef] ||= { vendas: [], fixos: [], cf: 0 });
  dados.vendas.forEach((v, i) => m.vendas.push({ ...v, unidade, aba, ordem: i + 1 }));
  dados.fixos.forEach(f => m.fixos.push({ ...f, unidade }));
  m.cf += dados.cfDeclarado;
  m.lbDecl = (m.lbDecl || 0) + dados.lbDeclarado;
  m.totalDecl = (m.totalDecl || 0) + dados.totalDeclarado;
  IGNORADAS.n += dados.ignoradas; IGNORADAS.v += dados.valorIgnorado;
}

const MES_NOME = ["janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"];

const docs = { vendas: [], custos: [], fechamentos: [] };

for (const [mesRef, m] of Object.entries(porMes)) {
  const nomeMes = MES_NOME[Number(mesRef.slice(5)) - 1];
  const data = `${mesRef}-01`;      // a planilha não tem data da venda
  let somaVenda = 0, somaBase = 0, somaCom = 0;

  m.vendas.forEach((v, i) => {
    const vid = `imp-${mesRef}-${i}`;
    const comTotal = v.comissoes.reduce((s, c) => s + c, 0);
    somaVenda += v.valorVenda;
    somaCom += comTotal;
    docs.vendas.push({
      id: vid,
      cliente: v.cliente || `Venda ${v.ordem} de ${nomeMes}`,
      vendedor: v.vendedor, unidade: v.unidade, data, mesRef,
      kwp: v.kwp || null, valorVenda: v.valorVenda,
      descontoTipo: "pct", descontoValor: 0,
      comissoes: comTotal > 0
        ? [{ papel: "vendedor", tipo: "valor", valor: comTotal, pct: v.valorVenda ? comTotal / v.valorVenda * 100 : 0 }]
        : [],
      custosEsperados: Object.keys(v.custos),
      pendencias: 0
    });
    for (const [lid, valor] of Object.entries(v.custos)) {
      somaBase += valor;
      docs.custos.push({
        id: `imp-${mesRef}-${i}-${lid}`,
        descricao: LINHAS_PADRAO.find(l => l.id === lid).nome,
        linhaCustoId: lid, dataPagamento: data, mesRef, valor,
        unidade: v.unidade, origem: "venda", vendaId: vid, clienteId: null, fixoId: null
      });
    }
  });

  // custo fixo: ajusta as linhas ao total declarado do mês
  const somaLinhas = m.fixos.reduce((s, f) => s + f.valor, 0);
  const k = somaLinhas && m.cf ? m.cf / somaLinhas : 1;
  let somaFixo = 0, somaImp = 0;
  m.fixos.forEach((f, i) => {
    const valor = Math.round(f.valor * k * 100) / 100;
    const imposto = /imposto/i.test(f.nome);
    if (imposto) somaImp += valor; else somaFixo += valor;
    docs.custos.push({
      id: `imp-${mesRef}-fx${i}`,
      descricao: f.nome, linhaCustoId: null, dataPagamento: `${mesRef}-05`, mesRef,
      valor, unidade: f.unidade, origem: imposto ? "imposto" : "fixo",
      vendaId: null, clienteId: null, fixoId: null
    });
  });

  const lucroBruto = Math.round((somaVenda - somaBase - somaCom) * 100) / 100;
  docs.fechamentos.push({
    id: mesRef, venda: somaVenda, base: somaBase, comissoes: somaCom, lucroBruto,
    naoPrevisto: 0, fixos: somaFixo, imposto: somaImp,
    lucroLiquido: Math.round((lucroBruto - somaFixo - somaImp) * 100) / 100,
    nVendas: m.vendas.length
  });
}

/* ============ conferência ============ */
console.log(`\nArquivo: ${arquivo}\n`);
console.log("mês      vendas   faturamento   faturam.planilha    lucro bruto   l.bruto planilha   diferença");
console.log("─".repeat(103));
let divergem = 0;
docs.fechamentos.sort((a, b) => a.id.localeCompare(b.id)).forEach(f => {
  const n = (v, w = 14) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(w);
  const m = porMes[f.id];
  const dif = f.lucroBruto - (m.lbDecl || 0);
  if (Math.abs(dif) > 0.5) divergem++;
  const marca = Math.abs(f.venda - (m.totalDecl || 0)) > 0.5 ? " !" : "  ";
  console.log(`${f.id}  ${String(f.nVendas).padStart(4)}  ${n(f.venda)}${marca}${n(m.totalDecl || 0, 16)}  ${n(f.lucroBruto)}${n(m.lbDecl || 0, 17)}  ${Math.abs(dif) > 0.5 ? n(dif, 12) : "         ok "}`);
});
console.log("─".repeat(103));
console.log(`\n${docs.vendas.length} vendas, ${docs.custos.length} custos, ${docs.fechamentos.length} fechamentos.`);
const semNome = docs.vendas.filter(v => v.cliente.startsWith("Venda ")).length;
const semKwp = docs.vendas.filter(v => !v.kwp).length;
console.log(`${semNome} vendas sem nome de cliente na origem, ${semKwp} sem kWp.`);
if (IGNORADAS.n) console.log(`${IGNORADAS.n} linha(s) com valor mas sem "Total de Venda" foram puladas, somando ${IGNORADAS.v.toLocaleString("pt-BR",{minimumFractionDigits:2})} — a propria planilha nao conta essas no fecho do mes.`);
console.log(`Todas as vendas entram no dia 1º do mês: a planilha não tem data da venda.\n`);

if (!GRAVAR) {
  console.log("Nada foi gravado. Confira os números acima contra a planilha.");
  console.log("Se estiver certo, rode de novo com --gravar\n");
  process.exit(0);
}

/* ============ gravação ============ */
if (firebaseConfig.projectId === "COLE_AQUI") {
  console.error("Cole a config do Firebase no topo deste arquivo antes de gravar.");
  process.exit(1);
}

const { initializeApp } = await import("firebase/app");
const { getFirestore, doc, writeBatch } = await import("firebase/firestore");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const raiz = `empresas/${EMPRESA}`;

async function gravarLote(caminho, lista) {
  for (let i = 0; i < lista.length; i += 400) {
    const lote = writeBatch(db);
    lista.slice(i, i + 400).forEach(({ id, ...corpo }) =>
      lote.set(doc(db, raiz, caminho, id), corpo));
    await lote.commit();
    console.log(`  ${caminho}: ${Math.min(i + 400, lista.length)}/${lista.length}`);
  }
}

console.log("Gravando…");
// As linhas de custo padrão primeiro, com os mesmos ids usados acima.
const lote0 = writeBatch(db);
LINHAS_PADRAO.forEach((l, i) => lote0.set(doc(db, raiz, "linhasCusto", l.id),
  { nome: l.nome, padrao: l.id !== "obra", ordem: i + 1 }));
await lote0.commit();

await gravarLote("vendas", docs.vendas);
await gravarLote("custos", docs.custos);
await gravarLote("fechamentos", docs.fechamentos);
console.log("\nPronto.\n");
process.exit(0);
