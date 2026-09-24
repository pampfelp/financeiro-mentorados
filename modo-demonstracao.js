// Modo de demonstração.
//
// Só entra em cena enquanto o firebase-init.js ainda estiver com a config de
// exemplo. Ele preenche o sistema para dar para navegar por todas as telas
// antes de criar o projeto no Firebase.
//
// Nomes de cliente e de pessoa da folha são fictícios de propósito: este
// repositório é público, e folha de pagamento e carteira de cliente de
// terceiro não vão para lá. Os valores mantêm a ordem de grandeza real só
// para as telas ficarem verossímeis.
//
// Nada é salvo: é para conferir as telas, não para usar de verdade. Assim que
// a config real for colada, este arquivo para de ser carregado sozinho, e
// pode ser apagado.

import { D } from "./dados.js";
import { SESSAO } from "./auth.js";
import { hojeISO, mesRefDe } from "./shared.js";

const MES = "2026-07";

const LINHAS = [
  { id: "l1", nome: "Kit solar",   padrao: true, ordem: 1 },
  { id: "l2", nome: "Instalação",  padrao: true, ordem: 2 },
  { id: "l3", nome: "Vistoria",    padrao: true, ordem: 3 },
  { id: "l4", nome: "Engenharia",  padrao: true, ordem: 4 },
  { id: "l5", nome: "Custo de obra", padrao: false, ordem: 90 }
];

// Onze vendas de exemplo, com custo base e comissões.
const VENDAS = [
  ["CLIENTE UM", "VENDEDOR A",     2,  5.49, 20000, 10259, [["vendedor", 600], ["prospectador", 1000]]],
  ["CLIENTE DOIS",          "DIRETORIA", 3,  3.72, 14000, 8530,  []],
  ["CLIENTE TRES",  "VENDEDOR A",     5,  4.88, 17000, 9874,  [["vendedor", 510], ["prospectador", 1000]]],
  ["CLIENTE QUATRO",          "VENDEDOR B",     8,  null, 21500, 11247, [["prospectador", 1000]]],
  ["CLIENTE CINCO",          "VENDEDOR C",      9,  8.54, 27000, 14839, []],
  ["CLIENTE SEIS",      "VENDEDOR D",    11, 3.66, 13735, 8145,  [["vendedor", 274.70]]],
  ["CLIENTE SETE",    "VENDEDOR A",     12, 4.88, 16500, 11488, [["vendedor", 495], ["prospectador", 1000]]],
  ["CLIENTE OITO",    "GERENCIA",  12, 26.92, 65000, 44024, []],
  ["CLIENTE NOVE", "VENDEDOR D",    17, 7.81, 23321, 12296, [["vendedor", 466.42]]],
  ["CLIENTE DEZ",        "VENDEDOR D",    22, 4.88, 18000, 9740,  [["vendedor", 360]]],
  ["CLIENTE ONZE",        "VENDEDOR A",     26, 4.27, 15000, 8528,  [["vendedor", 450]]]
];

const FIXOS = [
  ["Custo operacional", 70075, 5],
  ["Imposto",            7500, 20],
  ["Tráfego pago",       2500, 10],
  ["Insumos",            1000, 15]
];

const FOLHA = [
  ["SOCIO 1",        "CEO",           "Administrativo e diretoria", 10000, 2400, true],
  ["SOCIO 2",        "CEO",           "Administrativo e diretoria", 10000, 2400, true],
  ["SOCIO 3",        "SÓCIO GERENTE", "Administrativo e diretoria",  8000, 0,    true],
  ["COLABORADOR 1",  "PÓS-VENDA",     "Administrativo e diretoria",  2000, 0,    false],
  ["COLABORADOR 2",  "FINANCEIRO",    "Administrativo e diretoria",  1600, 900,  false],
  ["VENDEDOR A",     "VENDEDOR",      "Vendedores",                     0, 2000, false],
  ["VENDEDOR D",     "VENDEDOR",      "Vendedores",                     0, 2000, false],
  ["VENDEDOR B",     "VENDEDOR",      "Vendedores",                     0, 1500, false],
  ["PROSPECTADOR 1", "PROSPECTADOR",  "Prospectadores",                 0, 1600, false],
  ["PROSPECTADOR 2", "PROSPECTADOR",  "Prospectadores",                 0, 1600, false]
];

// Fechamentos dos meses anteriores.
const FECHAMENTOS = {
  "2026-02": { venda: 392000, lucroBruto: 139394,   lucroLiquido: 46621,      nVendas: 6 },
  "2026-03": { venda: 214076, lucroBruto: 74972.18, lucroLiquido: -15301.08,  nVendas: 10 },
  "2026-04": { venda: 217400, lucroBruto: 80825,    lucroLiquido: -4477,      nVendas: 9 },
  "2026-05": { venda: 241000, lucroBruto: 64137,    lucroLiquido: -20235,     nVendas: 6 },
  "2026-06": { venda: 134500, lucroBruto: 50578,    lucroLiquido: -31247,     nVendas: 6 }
};

export function ativar() {
  SESSAO.uid = "demo";
  SESSAO.email = "demonstracao@exemplo.com";
  SESSAO.nome = "Modo demonstração";
  SESSAO.papel = "dono";
  SESSAO.empresaId = "demo";

  D.empresa = {
    id: "demo", nome: "Empresa Demonstração", cnpj: "",
    mesAbertura: "2026-02", unidades: ["Matriz", "Marambaia", "Mauriti"],
    autorizaJornada: true, logoBase64: null, ultimoLancamento: hojeISO()
  };
  D.linhasCusto = LINHAS.slice();
  D.fechamentos = { ...FECHAMENTOS };
  D.mes = MES;

  D.vendas = VENDAS.map(([cliente, vendedor, dia, kwp, valor, custo, coms], i) => ({
    id: "v" + i, cliente, vendedor, unidade: "Marambaia",
    data: `${MES}-${String(dia).padStart(2, "0")}`, mesRef: MES, kwp,
    valorVenda: valor,
    comissoes: coms.map(([papel, v]) => ({ papel, tipo: "valor", valor: v, pct: v / valor * 100 })),
    // a última venda fica com duas linhas em branco, pra tela de Pendências
    // ter o que mostrar
    custosEsperados: ["l1", "l2", "l3", "l4"],
    pendencias: 0,
    _custo: custo
  }));

  const custos = [];
  let n = 0;
  D.vendas.forEach(v => {
    // reparte o custo base da venda nas quatro linhas padrão
    const partes = [[0.78, "l1", "Kit solar"], [0.19, "l2", "Instalação"],
                    [0.013, "l3", "Vistoria"], [0.017, "l4", "Engenharia"]];
    // duas vendas ficam com custo pendente de propósito, pra tela de
    // Pendências ter o que mostrar
    const pular = v.cliente === "CLIENTE OITO" ? 2 : v.cliente === "CLIENTE QUATRO" ? 1 : 0;
    partes.slice(0, 4 - pular).forEach(([f, lid, nome]) => {
      custos.push({
        id: "c" + (n++), descricao: nome, linhaCustoId: lid,
        dataPagamento: v.data, mesRef: MES, valor: Math.round(v._custo * f),
        unidade: v.unidade, origem: "venda", vendaId: v.id, clienteId: null, fixoId: null
      });
    });
  });

  FIXOS.forEach(([nome, valor, dia], i) => custos.push({
    id: "f" + i, descricao: nome, linhaCustoId: null,
    dataPagamento: `${MES}-${String(dia).padStart(2, "0")}`, mesRef: MES,
    valor, unidade: "Marambaia",
    origem: /imposto/i.test(nome) ? "imposto" : "fixo",
    vendaId: null, clienteId: null, fixoId: "fx" + i
  }));

  custos.push({
    id: "np1", descricao: "Tinta e pintura do escritório", linhaCustoId: null,
    dataPagamento: `${MES}-18`, mesRef: MES, valor: 1240, unidade: "Marambaia",
    origem: "avulso", vendaId: null, clienteId: null, fixoId: null
  });
  custos.push({
    id: "np2", descricao: "Revisita de obra entregue", linhaCustoId: null,
    dataPagamento: `${MES}-22`, mesRef: MES, valor: 860, unidade: "Marambaia",
    origem: "avulso", vendaId: null, clienteId: "CLIENTE DOZE", fixoId: null
  });

  D.custos = custos;
  // guardado para o mês voltar quando o usuário navegar e retornar
  D.demo = true;
  D.demoMes = MES;
  D.demoSeed = { vendas: D.vendas, custos: D.custos };

  D.fixos = [
    ...FIXOS.map(([nome, valor, dia], i) => ({
      id: "fx" + i, nome, valor, diaVencimento: dia, ativo: true, tipo: "fixo", unidade: "Marambaia"
    })),
    ...FOLHA.map(([nome, funcao, grupo, salario, ajuda, pl], i) => ({
      id: "fo" + i, nome, funcao, grupo, valor: salario, ajudaCusto: ajuda,
      extras: 0, proLabore: pl, ativo: true, tipo: "folha", unidade: "Matriz",
      diaVencimento: 5
    }))
  ];
}

export const MES_DEMO = MES;
