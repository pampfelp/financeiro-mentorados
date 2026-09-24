// Camada de dados: leitura, escrita e os cálculos derivados.
//
// As sete regras de economia de leitura do PLANO.md vivem aqui:
//  1. toda consulta de vendas e custos sai filtrada por mesRef
//  2. uma escuta por coleção por mês, compartilhada entre as telas
//  3. persistência offline ligada (firebase-init.js)
//  4. o gráfico de doze meses lê `fechamentos`, não um ano de lançamentos
//  5. nenhum getDocs dentro de laço
//  6. get() em vez de onSnapshot no que não muda o tempo todo
//  7. o mês que sai de foco tem a escuta fechada

import { db } from "./firebase-init.js";
import {
  collection, doc, query, where, onSnapshot, getDocs, getDoc,
  setDoc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { SESSAO } from "./auth.js";
import {
  arredondar2, rastrearSincronizacao, emSegundoPlano, hojeISO, mesRefDe, diasNoMes
} from "./shared.js";

/* ============ estado dos dados ============ */
export const D = {
  empresa: null,
  linhasCusto: [],
  fixos: [],            // base de custos fixos e folha
  fechamentos: {},      // mesRef -> totais congelados
  mes: null,            // mesRef carregado
  vendas: [],
  custos: []
};

const escutas = {};     // chave -> unsubscribe
let aoMudar = () => {};
export function quandoMudar(fn) { aoMudar = fn; }

function base() { return `empresas/${SESSAO.empresaId}`; }

function fecharEscuta(chave) {
  if (escutas[chave]) { escutas[chave](); delete escutas[chave]; }
}
export function fecharTudo() {
  Object.keys(escutas).forEach(fecharEscuta);
}

/* ============ carga inicial ============ */
export async function carregarEmpresa() {
  const snap = await getDoc(doc(db, "empresas", SESSAO.empresaId));
  D.empresa = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  return D.empresa;
}

/* Catálogo e base de recorrentes mudam de vez em quando: leitura única, e
   relidos só depois de uma escrita. Não precisam de tempo real. */
export async function carregarBase() {
  const [lc, fx] = await Promise.all([
    getDocs(collection(db, base(), "linhasCusto")),
    getDocs(collection(db, base(), "custosFixos"))
  ]);
  D.linhasCusto = lc.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  D.fixos = fx.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.valor || 0) - (a.valor || 0));
}

/* Doze documentos por ano. É o que alimenta o gráfico do ano inteiro. */
export function escutarFechamentos() {
  fecharEscuta("fechamentos");
  escutas.fechamentos = onSnapshot(
    collection(db, base(), "fechamentos"),
    { includeMetadataChanges: true },
    snap => {
      rastrearSincronizacao("fechamentos", snap);
      D.fechamentos = {};
      snap.forEach(d => { D.fechamentos[d.id] = d.data(); });
      aoMudar();
    },
    e => console.error("Falha ao escutar fechamentos.", e)
  );
}

/* O mês em foco é o único com escuta ao vivo. Trocar de mês fecha a anterior. */
export function escutarMes(mesRef) {
  // No modo de demonstração não há Firestore: o mês semeado volta da memória,
  // e os outros ficam vazios, que é o que aconteceria de verdade.
  if (D.demo) {
    D.mes = mesRef;
    const tem = mesRef === D.demoMes;
    D.vendas = tem ? D.demoSeed.vendas : [];
    D.custos = tem ? D.demoSeed.custos : [];
    return;
  }
  if (D.mes === mesRef && escutas.vendas) return;
  fecharEscuta("vendas");
  fecharEscuta("custos");
  D.mes = mesRef;
  D.vendas = [];
  D.custos = [];

  escutas.vendas = onSnapshot(
    query(collection(db, base(), "vendas"), where("mesRef", "==", mesRef)),
    { includeMetadataChanges: true },
    snap => {
      rastrearSincronizacao("vendas", snap);
      D.vendas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.data || "").localeCompare(b.data || ""));
      aoMudar();
    },
    e => console.error("Falha ao escutar vendas.", e)
  );

  escutas.custos = onSnapshot(
    query(collection(db, base(), "custos"), where("mesRef", "==", mesRef)),
    { includeMetadataChanges: true },
    snap => {
      rastrearSincronizacao("custos", snap);
      D.custos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.dataPagamento || "").localeCompare(b.dataPagamento || ""));
      aoMudar();
    },
    e => console.error("Falha ao escutar custos.", e)
  );
}

/* ============ cálculos derivados ============ */
// Nada aqui é gravado no documento. custoTotal e lucroBruto são sempre soma
// dos custos vinculados: dois números pra mesma coisa divergem em silêncio
// quando um custo chega atrasado.

export function custosDaVenda(vendaId) {
  return D.custos.filter(c => c.vendaId === vendaId);
}
export function custoDaVenda(vendaId) {
  return arredondar2(custosDaVenda(vendaId).reduce((s, c) => s + (c.valor || 0), 0));
}
export function comissaoDaVenda(v) {
  return arredondar2((v.comissoes || []).reduce((s, c) => s + (c.valor || 0), 0));
}
export function lucroBrutoDaVenda(v) {
  return arredondar2((v.valorVenda || 0) - custoDaVenda(v.id) - comissaoDaVenda(v));
}
export function pendenciasDaVenda(v) {
  const lancados = new Set(custosDaVenda(v.id).map(c => c.linhaCustoId));
  return (v.custosEsperados || []).filter(id => !lancados.has(id));
}

/* A conta do mês inteiro, na ordem da cadeia. */
export function resumoDoMes() {
  const venda = arredondar2(D.vendas.reduce((s, v) => s + (v.valorVenda || 0), 0));
  const soma = f => arredondar2(D.custos.filter(f).reduce((s, c) => s + (c.valor || 0), 0));

  const base_ = soma(c => c.origem === "venda");
  const comissoes = arredondar2(D.vendas.reduce((s, v) => s + comissaoDaVenda(v), 0));
  const lucroBruto = arredondar2(venda - base_ - comissoes);

  const naoPrevisto = soma(c => c.origem === "avulso");
  const fixos = soma(c => c.origem === "fixo" || c.origem === "folha");
  const imposto = soma(c => c.origem === "imposto");
  const lucroLiquido = arredondar2(lucroBruto - naoPrevisto - fixos - imposto);

  return {
    venda, base: base_, comissoes, lucroBruto, naoPrevisto, fixos, imposto, lucroLiquido,
    nVendas: D.vendas.length,
    margemBruta: venda ? lucroBruto / venda * 100 : 0,
    margemLiquida: venda ? lucroLiquido / venda * 100 : 0,
    custoTotal: arredondar2(base_ + comissoes + naoPrevisto + fixos + imposto)
  };
}

/* Vendas por dia do mês, para o gráfico de linha. */
export function vendasPorDia(mesRef) {
  const n = diasNoMes(mesRef);
  const acc = Array.from({ length: n }, () => 0);
  D.vendas.forEach(v => {
    const d = Number(String(v.data || "").slice(8, 10));
    if (d >= 1 && d <= n) acc[d - 1] += v.valorVenda || 0;
  });
  return acc.map((valor, i) => ({ dia: i + 1, valor: arredondar2(valor) }));
}

/* Doze meses do ano, lidos dos fechamentos. */
export function serieDoAno(ano) {
  return Array.from({ length: 12 }, (_, i) => {
    const mesRef = `${ano}-${String(i + 1).padStart(2, "0")}`;
    const f = D.fechamentos[mesRef];
    // o mês em foco vem do cálculo ao vivo, que é mais novo que o fechamento
    const vivo = D.mes === mesRef ? resumoDoMes() : null;
    return {
      mesRef, i,
      venda: vivo ? vivo.venda : (f?.venda || 0),
      lucroBruto: vivo ? vivo.lucroBruto : (f?.lucroBruto || 0),
      lucroLiquido: vivo ? vivo.lucroLiquido : (f?.lucroLiquido || 0),
      temDado: !!(f || vivo?.nVendas)
    };
  });
}

/* ============ escrita ============ */
function agora() { return { criadoEm: serverTimestamp() }; }

export async function salvarVenda(id, dados) {
  const ref = id ? doc(db, base(), "vendas", id) : doc(collection(db, base(), "vendas"));
  const corpo = { ...dados, mesRef: mesRefDe(dados.data) };
  if (!id) Object.assign(corpo, agora());
  await emSegundoPlano(setDoc(ref, corpo, { merge: true }), "Não consegui salvar a venda.");
  await tocarEmpresa();
  return ref.id;
}

export async function excluirVenda(id) {
  // Os custos vinculados vão junto: custo órfão de venda excluída some de
  // todas as telas e continua entrando na conta.
  const lote = writeBatch(db);
  lote.delete(doc(db, base(), "vendas", id));
  D.custos.filter(c => c.vendaId === id)
    .forEach(c => lote.delete(doc(db, base(), "custos", c.id)));
  await emSegundoPlano(lote.commit(), "Não consegui excluir a venda.");
}

export async function salvarCusto(id, dados) {
  const ref = id ? doc(db, base(), "custos", id) : doc(collection(db, base(), "custos"));
  const corpo = { ...dados, mesRef: mesRefDe(dados.dataPagamento) };
  if (!id) Object.assign(corpo, agora());
  await emSegundoPlano(setDoc(ref, corpo, { merge: true }), "Não consegui salvar o custo.");
  await tocarEmpresa();
  return ref.id;
}

export async function excluirCusto(id) {
  await emSegundoPlano(deleteDoc(doc(db, base(), "custos", id)), "Não consegui excluir o custo.");
}

export async function salvarFixo(id, dados) {
  const ref = id ? doc(db, base(), "custosFixos", id) : doc(collection(db, base(), "custosFixos"));
  if (!id) Object.assign(dados, agora());
  await emSegundoPlano(setDoc(ref, dados, { merge: true }), "Não consegui salvar.");
  await carregarBase();
  return ref.id;
}

export async function excluirFixo(id) {
  await emSegundoPlano(deleteDoc(doc(db, base(), "custosFixos", id)), "Não consegui excluir.");
  await carregarBase();
}

export async function salvarLinhaCusto(id, dados) {
  const ref = id ? doc(db, base(), "linhasCusto", id) : doc(collection(db, base(), "linhasCusto"));
  await emSegundoPlano(setDoc(ref, dados, { merge: true }), "Não consegui salvar a linha.");
  await carregarBase();
  return ref.id;
}

export async function excluirLinhaCusto(id) {
  await emSegundoPlano(deleteDoc(doc(db, base(), "linhasCusto", id)), "Não consegui excluir a linha.");
  await carregarBase();
}

export async function salvarEmpresa(dados) {
  await emSegundoPlano(updateDoc(doc(db, "empresas", SESSAO.empresaId), dados),
    "Não consegui salvar as configurações.");
  await carregarEmpresa();
}

async function tocarEmpresa() {
  // Data do último lançamento: é o que o painel da Jornada usa pra ver quem
  // parou de usar o sistema, sem precisar ler os lançamentos.
  try { await updateDoc(doc(db, "empresas", SESSAO.empresaId), { ultimoLancamento: hojeISO() }); }
  catch (e) { /* não é crítico */ }
}

/* ============ área da Jornada: empresas e acessos ============ */
// Leitura única: essas listas mudam quando alguém cadastra, não o tempo todo.

export async function listarEmpresas() {
  const snap = await getDocs(collection(db, "empresas"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
}

export async function listarAcessos() {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
}

export async function criarEmpresa(dados) {
  const ref = doc(collection(db, "empresas"));
  await setDoc(ref, {
    nome: dados.nome,
    cnpj: dados.cnpj || "",
    logoBase64: null,
    mesAbertura: dados.mesAbertura || null,
    unidades: dados.unidades || [],
    autorizaJornada: false,
    ultimoLancamento: null,
    criadoEm: serverTimestamp()
  });
  // Semeia o catálogo de linhas de custo do ramo, senão a primeira venda
  // abre sem nenhuma linha esperando valor.
  const lote = writeBatch(db);
  [["kit", "Kit solar"], ["instalacao", "Instalação"],
   ["vistoria", "Vistoria"], ["engenharia", "Engenharia"]]
    .forEach(([id, nome], i) =>
      lote.set(doc(db, "empresas", ref.id, "linhasCusto", id), { nome, padrao: true, ordem: i + 1 }));
  await lote.commit();
  return ref.id;
}

export async function gravarAcesso(uid, dados) {
  await setDoc(doc(db, "usuarios", uid), { ...dados, criadoEm: serverTimestamp() });
}

export async function atualizarAcesso(uid, dados) {
  await emSegundoPlano(updateDoc(doc(db, "usuarios", uid), dados),
    "Não consegui salvar o acesso.");
}

export async function excluirAcesso(uid) {
  // Some o vínculo, não a conta do Firebase Auth: apagar conta exige o Admin
  // SDK, que pede plano pago. Sem vínculo a pessoa não entra em empresa
  // nenhuma, que é o efeito prático.
  await emSegundoPlano(deleteDoc(doc(db, "usuarios", uid)),
    "Não consegui remover o acesso.");
}

/* ============ ocorrências do mês a partir da base ============ */
// A tabela de Custos Fixos e Folha é só a BASE. Ela gera a ocorrência do mês,
// que cai na tela de Custos e pode ser editada ou adiada sem mexer na base.
export async function gerarOcorrencias(mesRef) {
  const jaTem = new Set(D.custos.filter(c => c.fixoId).map(c => c.fixoId));
  const criar = D.fixos.filter(f => f.ativo !== false && !jaTem.has(f.id));
  if (!criar.length) return 0;

  const ultimoDia = diasNoMes(mesRef);
  const lote = writeBatch(db);
  criar.forEach(f => {
    const dia = Math.min(Math.max(Number(f.diaVencimento) || 5, 1), ultimoDia);
    const ref = doc(collection(db, base(), "custos"));
    lote.set(ref, {
      descricao: f.nome,
      linhaCustoId: null,
      dataPagamento: `${mesRef}-${String(dia).padStart(2, "0")}`,
      mesRef,
      valor: Number(f.valor) || 0,
      unidade: f.unidade || null,
      origem: /imposto/i.test(f.nome) ? "imposto" : (f.tipo === "folha" ? "folha" : "fixo"),
      vendaId: null, clienteId: null, fixoId: f.id,
      criadoEm: serverTimestamp()
    });
  });
  await emSegundoPlano(lote.commit(), "Não consegui gerar os lançamentos do mês.");
  return criar.length;
}

/* ============ fechamento do mês ============ */
// Mês fechado não muda mais, então congelar o total aqui é seguro e é o que
// faz o gráfico do ano custar doze leituras.
export async function gravarFechamento(mesRef) {
  const r = resumoDoMes();
  await emSegundoPlano(setDoc(doc(db, base(), "fechamentos", mesRef), {
    venda: r.venda, base: r.base, comissoes: r.comissoes, lucroBruto: r.lucroBruto,
    naoPrevisto: r.naoPrevisto, fixos: r.fixos, imposto: r.imposto,
    lucroLiquido: r.lucroLiquido, nVendas: r.nVendas, atualizadoEm: serverTimestamp()
  }), "Não consegui gravar o fechamento.");
}

/* Mantém o fechamento do mês em foco em dia sem custo de leitura: ele é
   gravado a partir do que já está na memória, com folga pra agrupar escritas
   seguidas numa só. */
let timerFecho = null;
export function agendarFechamento(mesRef) {
  clearTimeout(timerFecho);
  timerFecho = setTimeout(() => gravarFechamento(mesRef), 2500);
}
