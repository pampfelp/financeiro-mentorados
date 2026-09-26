// Projeção financeira a partir do histórico da empresa.
//
// Só cálculo, sem tela e sem banco: recebe os fechamentos mensais e devolve o
// modelo. Fica separado da tela pra poder ser conferido número a número.
//
// O caminho é sempre o mesmo:
//  1. separa os meses que servem de base e diz por que os outros ficaram fora;
//  2. tira dos meses bons as proporções (quanto de cada venda vira custo,
//     comissão e imposto) e os valores fixos do mês;
//  3. com isso responde "se eu faturar X, quanto sobra" e o contrário,
//     "quanto preciso faturar pra sobrar Y".

/* Todo número que decide algo mora aqui, e só aqui. O guia "?" da tela lê este
   objeto: se um limite mudar, o texto que a pessoa lê muda junto. */
export const PARAMETROS = {
  // escolha dos meses
  minMesesProjecao: 2,        // menos que isso, não projeta
  minMesesLimpeza: 3,         // menos que isso, não dá pra julgar um mês contra os outros
  custoVendaMinimo: 0.02,     // custo das vendas abaixo disso = vendas sem custo lançado
  folgaCustoVenda: 0.15,      // diferença mínima (15 pontos) para excluir um mês por custo das vendas
  fatorDesvio: 3,             // e, além dela, 3 desvios típicos da mediana
  difFixoMax: 0.6,            // custo fixo 60% acima ou abaixo da mediana exclui o mês
  // modelo
  mesesFixoRecente: 3,        // o fixo vem dos N meses mais recentes
  mesesProjetados: 3,
  semanasPorMes: 4.33,
  // tendência
  minMesesTendencia: 3,
  r2Min: 0.3,                 // quanto da variação a reta precisa explicar
  variacaoMinPct: 2,          // variação mínima por mês (% da média) para afirmar tendência
  // insights
  limiteCustoVenda: 0.6,      // custo + comissão acima de 60% da venda
  limiteFixoSobreFat: 0.3,    // fixo acima de 30% do faturamento médio
  limiteOscilacao: 0.25,      // variação entre meses acima de 25% da média
  difTicket: 0.05,            // ticket recente 5% diferente do geral
  cenarioCusto: 0.01,         // "1 ponto a menos de custo"
  cenarioFixo: 0.10,          // "10% a menos de fixo"
  cenarioTicket: 0.10         // "10% a mais de ticket"
};
const PR = PARAMETROS;

const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = m => MES[Number(m.slice(5, 7)) - 1];
const idx = m => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const deIdx = i => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`;
const mediana = xs => { const a = [...xs].sort((p, q) => p - q); const n = a.length;
  return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; };
const pct = x => (x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

/* Fechamento todo zerado não é mês com dado: é o rastro de alguém que abriu
   o mês sem lançar nada. */
export function fechamentoVazio(f) {
  return !f || (!f.venda && !f.nVendas && !f.fixos && !f.imposto && !f.base && !f.naoPrevisto);
}

/* Custo fixo do mês. Fechamento antigo pode não ter o campo separado; aí sai
   pela diferença entre lucro bruto e lucro líquido. */
function fixoDo(f) {
  if (f.fixos != null) return f.fixos;
  return Math.max(0, (f.lucroBruto || 0) - (f.lucroLiquido || 0) - (f.naoPrevisto || 0) - (f.imposto || 0));
}

/* ============ 1. quais meses servem de base ============ */
export function separarMeses(fechamentos, mesAtual) {
  const usados = [], fora = [];
  const todos = Object.entries(fechamentos || {})
    .filter(([m, f]) => !fechamentoVazio(f))
    .map(([m, f]) => ({ mes: m, ...f }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  for (const f of todos) {
    const custoVenda = f.venda ? (f.venda - (f.lucroBruto || 0)) / f.venda : 0;
    const item = { ...f, custoVenda, fixo: fixoDo(f) };
    if (f.mes >= mesAtual)          fora.push({ ...item, motivo: "mês ainda em andamento" });
    else if (!(f.venda > 0))        fora.push({ ...item, motivo: "sem venda lançada" });
    else if (!(item.fixo + (f.imposto || 0) > 0)) fora.push({ ...item, motivo: "sem custo fixo lançado" });
    else if (custoVenda < PR.custoVendaMinimo) fora.push({ ...item, motivo: "vendas sem custo lançado" });
    else usados.push(item);
  }

  // Mês com o custo das vendas muito diferente dos outros é, quase sempre,
  // custo que não foi lançado (ou lançado duas vezes). Só dá pra julgar com
  // três meses ou mais. A folga mínima de 15 pontos existe pra não jogar fora
  // um mês que foi ruim de verdade: ruim não é o mesmo que mal preenchido.
  if (usados.length >= PR.minMesesLimpeza) {
    const med = mediana(usados.map(f => f.custoVenda));
    const mad = mediana(usados.map(f => Math.abs(f.custoVenda - med)));
    const limite = Math.max(PR.folgaCustoVenda, PR.fatorDesvio * 1.4826 * mad);
    const medFixo = mediana(usados.map(f => f.fixo));
    for (const f of [...usados]) {
      let motivo = null;
      if (Math.abs(f.custoVenda - med) > limite)
        motivo = `custo das vendas em ${pct(f.custoVenda)}, contra ${pct(med)} dos outros meses`;
      else if (medFixo > 0 && Math.abs(f.fixo - medFixo) / medFixo > PR.difFixoMax)
        motivo = `custo fixo muito diferente dos outros meses`;
      if (motivo) { usados.splice(usados.indexOf(f), 1); fora.push({ ...f, motivo }); }
    }
  }
  fora.sort((a, b) => a.mes.localeCompare(b.mes));
  return { usados, fora };
}

/* ============ 2. o modelo ============ */
export function montarModelo(fechamentos, mesAtual) {
  const { usados, fora } = separarMeses(fechamentos, mesAtual);
  const base = { usados, fora, ok: usados.length >= PR.minMesesProjecao };
  if (!base.ok) return base;

  const soma = k => usados.reduce((s, f) => s + (f[k] || 0), 0);
  const totalVenda = soma("venda");
  const temSeparacao = usados.every(f => f.base != null);

  // Proporções: ponderadas pelo faturamento, pra um mês pequeno não pesar
  // igual a um mês grande.
  const pCusto = temSeparacao ? soma("base") / totalVenda
    : usados.reduce((s, f) => s + (f.venda - f.lucroBruto), 0) / totalVenda;
  const pComissao = temSeparacao ? soma("comissoes") / totalVenda : 0;
  const pImposto = soma("imposto") / totalVenda;

  // Valores fixos do mês: os três meses mais recentes, porque fixo muda com o
  // tempo (contratação, aluguel) e o recente é o que vale pro próximo mês.
  const recentes = usados.slice(-PR.mesesFixoRecente);
  const fixo = recentes.reduce((s, f) => s + f.fixo, 0) / recentes.length;
  const naoPrevisto = recentes.reduce((s, f) => s + (f.naoPrevisto || 0), 0) / recentes.length;

  const margemContribuicao = 1 - pCusto - pComissao - pImposto;
  const nVendas = soma("nVendas");
  const mediaVenda = totalVenda / usados.length;
  const ticket = nVendas ? totalVenda / nVendas : 0;
  const ticketRecente = (() => {
    const r = recentes.reduce((s, f) => s + (f.nVendas || 0), 0);
    return r ? recentes.reduce((s, f) => s + f.venda, 0) / r : 0;
  })();

  const m = {
    ...base, pCusto, pComissao, pImposto, fixo, naoPrevisto, margemContribuicao,
    mediaVenda, ticket, ticketRecente, nVendas,
    melhorMes: usados.reduce((a, f) => f.venda > a.venda ? f : a, usados[0]),
    equilibrio: margemContribuicao > 0 ? (fixo + naoPrevisto) / margemContribuicao : Infinity
  };
  m.tendencia = tendencia(m, mesAtual);
  m.insights = insights(m);
  return m;
}

/* ============ 3. respostas ============ */
export function dreProjetada(m, faturamento) {
  const R = Math.max(0, faturamento || 0);
  const custo = R * m.pCusto, comissao = R * m.pComissao;
  const lucroBruto = R - custo - comissao;
  const imposto = R * m.pImposto;
  const lucroLiquido = lucroBruto - imposto - m.fixo - m.naoPrevisto;
  return {
    faturamento: R, custo, comissao, lucroBruto, imposto,
    fixo: m.fixo, naoPrevisto: m.naoPrevisto, lucroLiquido,
    margemBruta: R ? lucroBruto / R * 100 : 0,
    margemLiquida: R ? lucroLiquido / R * 100 : 0
  };
}

/* "Quanto preciso faturar pra sobrar X no fim do mês?" */
export function faturamentoPara(m, lucroDesejado) {
  if (!(m.margemContribuicao > 0)) return Infinity;
  return (m.fixo + m.naoPrevisto + (lucroDesejado || 0)) / m.margemContribuicao;
}

/* Do faturamento até o número de propostas. Sempre arredonda pra cima: meia
   venda não existe, e arredondar pra baixo entrega uma meta que não fecha a
   conta. */
export function funil(faturamento, ticket, conversaoPct) {
  const vendas = ticket > 0 ? Math.ceil(faturamento / ticket) : 0;
  const conv = conversaoPct > 0 ? conversaoPct / 100 : 0;
  const propostas = conv > 0 ? Math.ceil(vendas / conv) : 0;
  return { vendas, propostas, propostasSemana: Math.ceil(propostas / PR.semanasPorMes) };
}

/* ============ tendência ============ */
// Reta pelos meses usados (mínimos quadrados), com o eixo em meses de verdade:
// um mês fora da base deixa um buraco, não encosta os vizinhos.
function tendencia(m, mesAtual) {
  const pts = m.usados.map(f => ({ x: idx(f.mes), y: f.venda }));
  const n = pts.length;
  if (n < PR.minMesesTendencia) return { ok: false, motivo: "poucos meses para uma tendência" };
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const inclinacao = sxx ? pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx : 0;
  const intercepto = my - inclinacao * mx;
  const reta = x => intercepto + inclinacao * x;
  const ssTot = pts.reduce((s, p) => s + (p.y - my) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - reta(p.x)) ** 2, 0);
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;

  const ultimo = Math.max(...pts.map(p => p.x));
  // Projeta do mês atual pra frente. Mês que já passou sem dado não é
  // projeção, é lançamento que falta, e fica vazio no gráfico.
  const inicio = Math.max(ultimo + 1, mesAtual ? idx(mesAtual) : ultimo + 1);
  const futuro = Array.from({ length: PR.mesesProjetados }, (_, k) => k).map(k => {
    const venda = Math.max(0, reta(inicio + k));
    return { mes: deIdx(inicio + k), venda, lucroLiquido: dreProjetada(m, venda).lucroLiquido };
  });
  const cresce = inclinacao > 0;
  // "acima" é o nível de AGORA (a reta no último mês usado). A projeção entra
  // no "passa dele em N meses", não no veredito de hoje.
  const acima = reta(ultimo) >= m.equilibrio;
  const variacaoMensal = m.mediaVenda ? inclinacao / m.mediaVenda * 100 : 0;
  const brl = v => "R$ " + Math.round(v).toLocaleString("pt-BR");
  let estado, texto;

  // Só se afirma tendência quando ela existe: a reta precisa explicar parte
  // razoável da variação (r²) e a mudança precisa ser de verdade (2% ao mês).
  // Sem isso, dizer "caindo" por causa de uma inclinação de -0,4% seria ler
  // ruído como direção.
  if (r2 < PR.r2Min || Math.abs(variacaoMensal) < PR.variacaoMinPct) {
    const naMedia = m.mediaVenda >= m.equilibrio;
    return {
      ok: true, inclinacao, r2, futuro, variacaoMensal, fraca: true, reta: x => reta(idx(x)),
      estado: naMedia ? "atencao" : "ruim",
      texto: `Sem tendência clara: o faturamento oscila em volta de ${brl(m.mediaVenda)}, ${naMedia
        ? "acima do ponto de equilíbrio. Mantido esse nível, a empresa segue no azul."
        : "abaixo do ponto de equilíbrio. Mantido esse nível, a empresa segue fechando no prejuízo."}`
    };
  }
  if (cresce && acima) { estado = "bom"; texto = "Faturamento crescendo e acima do ponto de equilíbrio."; }
  else if (cresce) {
    const meses = Math.ceil((m.equilibrio - reta(ultimo)) / inclinacao);
    estado = "atencao";
    texto = `Faturamento crescendo, mas ainda abaixo do ponto de equilíbrio. No ritmo atual, passa dele em cerca de ${meses} ${meses === 1 ? "mês" : "meses"}.`;
  } else if (acima) {
    const meses = inclinacao < 0 ? Math.max(1, Math.floor((reta(ultimo) - m.equilibrio) / -inclinacao)) : null;
    estado = "atencao";
    texto = meses ? `Faturamento caindo. Ainda acima do ponto de equilíbrio, mas no ritmo atual chega nele em cerca de ${meses} ${meses === 1 ? "mês" : "meses"}.`
                  : "Faturamento estável e acima do ponto de equilíbrio.";
  } else { estado = "ruim"; texto = "Faturamento caindo e abaixo do ponto de equilíbrio: cada mês tende a fechar com prejuízo maior."; }

  return {
    ok: true, inclinacao, r2, futuro, estado, texto, variacaoMensal, fraca: false,
    reta: x => reta(idx(x))
  };
}

/* ============ o que melhorar ============ */
// Cada item traz o número que muda e quanto ele vale, nunca conselho solto.
function insights(m) {
  const out = [];
  const R = m.mediaVenda, mc = m.margemContribuicao;
  const brl = v => "R$ " + Math.round(v).toLocaleString("pt-BR");
  const abaixo = m.usados.filter(f => f.venda < m.equilibrio).length;

  if (isFinite(m.equilibrio)) {
    out.push(R < m.equilibrio
      ? { tipo: "ruim", titulo: "A média de faturamento não cobre o custo da empresa",
          texto: `Para empatar, é preciso faturar ${brl(m.equilibrio)} por mês. A média dos meses usados foi ${brl(R)}, e ${abaixo} de ${m.usados.length} ficaram abaixo disso.` }
      : { tipo: "bom", titulo: "A média de faturamento está acima do ponto de equilíbrio",
          texto: `O ponto de equilíbrio é ${brl(m.equilibrio)} por mês e a média foi ${brl(R)}. ${abaixo ? `Mesmo assim, ${abaixo} de ${m.usados.length} meses ficaram abaixo.` : "Nenhum mês ficou abaixo."}` });
  } else {
    out.push({ tipo: "ruim", titulo: "O custo das vendas passa do preço",
      texto: "Custo, comissão e imposto somados consomem todo o faturamento. Nenhum volume de venda fecha no azul com essa margem." });
  }

  const pVar = m.pCusto + m.pComissao;
  if (mc > 0) {
    const eqMenos = (m.fixo + m.naoPrevisto) / (mc + PR.cenarioCusto);
    out.push({ tipo: pVar > PR.limiteCustoVenda ? "atencao" : "neutro", titulo: "Custo de cada venda",
      texto: `De cada R$ 100 vendidos, R$ ${(pVar * 100).toFixed(0)} vão para o custo do projeto e a comissão. Baixar 1 ponto nisso rende ${brl(R * PR.cenarioCusto)} a mais por mês na média atual e reduz o ponto de equilíbrio para ${brl(eqMenos)}.` });
    const eqFixo = (m.fixo * (1 - PR.cenarioFixo) + m.naoPrevisto) / mc;
    out.push({ tipo: m.fixo / R > PR.limiteFixoSobreFat ? "atencao" : "neutro", titulo: "Custo fixo",
      texto: `O fixo recente é ${brl(m.fixo)} por mês, ${pct(m.fixo / R)} do faturamento médio. Cortar ${Math.round(PR.cenarioFixo * 100)}% dele (${brl(m.fixo * PR.cenarioFixo)}) baixa o ponto de equilíbrio para ${brl(eqFixo)}.` });
    out.push({ tipo: "neutro", titulo: "Ticket médio",
      texto: `O ticket médio é ${brl(m.ticket)}${m.ticketRecente && Math.abs(m.ticketRecente / m.ticket - 1) > PR.difTicket
        ? `, e nos meses mais recentes está em ${brl(m.ticketRecente)} (${m.ticketRecente > m.ticket ? "subindo" : "caindo"})` : ""}. Subir ${Math.round(PR.cenarioTicket * 100)}% no ticket, com o mesmo número de vendas, deixa ${brl(R * PR.cenarioTicket * mc)} a mais por mês.` });
  }

  if (m.naoPrevisto > 0 && R * mc > 0)
    out.push({ tipo: "atencao", titulo: "Custos não previstos",
      texto: `Retrabalho e custo sem venda levam ${brl(m.naoPrevisto)} por mês, ${pct(m.naoPrevisto / (R * (1 - pVar)))} do lucro bruto médio.` });

  const desvio = Math.sqrt(m.usados.reduce((s, f) => s + (f.venda - R) ** 2, 0) / m.usados.length);
  if (R && desvio / R > PR.limiteOscilacao)
    out.push({ tipo: "atencao", titulo: "Faturamento oscila muito",
      texto: `De um mês para o outro o faturamento varia em torno de ${pct(desvio / R)}. Planeje o custo fixo pelo mês fraco, não pela média.` });

  if (m.fora.some(f => f.motivo !== "mês ainda em andamento"))
    out.push({ tipo: "neutro", titulo: "Meses fora da conta",
      texto: m.fora.filter(f => f.motivo !== "mês ainda em andamento")
        .map(f => `${nomeMes(f.mes)[0].toUpperCase() + nomeMes(f.mes).slice(1)}: ${f.motivo}.`).join(" ")
        + " Completar esses lançamentos deixa a projeção mais precisa." });
  return out;
}
