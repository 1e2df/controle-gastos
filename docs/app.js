/* global Chart */
const $ = (seletor) => document.querySelector(seletor);

const estado = {
  mes: mesDe(new Date()), // 'AAAA-MM' exibido
  categorias: [],
  transacoes: [],
  editandoId: null,
};
const graficos = { categorias: null, anual: null };
let ultimoResumo = null;
let ultimoAnual = null;

// ---------- Utilidades ----------

function mesDe(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function hojeIso() {
  const d = new Date();
  return `${mesDe(d)}-${String(d.getDate()).padStart(2, '0')}`;
}
function somarMes(mes, delta) {
  const [a, m] = mes.split('-').map(Number);
  return mesDe(new Date(a, m - 1 + delta, 1));
}

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const reais = (centavos) => fmtBRL.format(centavos / 100);
const dataBr = (iso) => iso.split('-').reverse().join('/');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// "1.234,56", "1234.56", "50" -> centavos (inteiro) ou null se inválido.
function lerValor(texto) {
  let t = texto.replace(/[R$\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const centavos = Math.round(Number(t) * 100);
  return centavos > 0 ? centavos : null;
}

function mostrarErro(el, mensagem) {
  el.textContent = mensagem || '';
  el.hidden = !mensagem;
}

function criar(tag, props = {}, ...filhos) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...filhos);
  return el;
}

// ---------- Carregamento ----------

async function carregarTudo() {
  const ano = estado.mes.slice(0, 4);
  const [transacoes, resumo, anual] = await Promise.all([
    Dados.transacoes(estado.mes),
    Dados.resumo(estado.mes),
    Dados.anual(ano),
  ]);
  estado.transacoes = transacoes;
  ultimoResumo = resumo;
  ultimoAnual = anual;
  $('#mes').value = estado.mes;
  $('#ano-titulo').textContent = ano;
  desenharCartoes(resumo);
  desenharTabela();
  desenharGraficoCategorias(resumo);
  desenharGraficoAnual(anual);
}

async function carregarCategorias() {
  estado.categorias = await Dados.categorias();
  desenharCategorias();
  preencherSelectCategorias();
}

// ---------- Cartões e tabela ----------

function desenharCartoes(r) {
  $('#total-receitas').textContent = reais(r.receitas);
  $('#total-despesas').textContent = reais(r.despesas);
  $('#total-saldo').textContent = reais(r.saldo);
  let nota = '';
  if (r.receitas > 0 && r.saldo >= 0) nota = `Você guardou ${Math.round((r.saldo / r.receitas) * 100)}% das receitas.`;
  else if (r.saldo < 0) nota = 'As despesas passaram das receitas.';
  $('#saldo-nota').textContent = nota;
}

function desenharTabela() {
  const corpo = $('#tabela tbody');
  corpo.replaceChildren(
    ...estado.transacoes.map((t) => {
      const sinal = t.tipo === 'despesa' ? '− ' : '+ ';
      const editar = criar('button', { type: 'button', textContent: 'Editar' });
      const excluir = criar('button', { type: 'button', textContent: 'Excluir' });
      editar.addEventListener('click', () => iniciarEdicao(t));
      excluir.addEventListener('click', () => excluirTransacao(t));
      return criar(
        'tr',
        { className: t.id === estado.editandoId ? 'editando' : '' },
        criar('td', { className: 'data', textContent: dataBr(t.data) }),
        criar('td', { className: 'desc', textContent: t.descricao }),
        criar('td', { className: 'cat' }, criar('i', { className: `ponto ${t.tipo}` }), ` ${t.categoria}`),
        criar('td', { className: 'num', textContent: sinal + reais(t.valor_centavos) }),
        criar('td', { className: 'botoes' }, editar, excluir)
      );
    })
  );
  $('#tabela').hidden = estado.transacoes.length === 0;
  $('#vazio-tabela').hidden = estado.transacoes.length > 0;
}

async function excluirTransacao(t) {
  if (!confirm(`Excluir "${t.descricao}" (${reais(t.valor_centavos)})?`)) return;
  try {
    await Dados.excluirTransacao(t.id);
    if (estado.editandoId === t.id) cancelarEdicao();
    await carregarTudo();
  } catch (erro) {
    alert(erro.message);
  }
}

// ---------- Formulário de lançamento ----------

const form = $('#form-transacao');

function preencherSelectCategorias(selecionada) {
  const tipo = form.elements.tipo.value;
  const select = form.elements.categoria_id;
  const atual = selecionada ?? select.value;
  select.replaceChildren(
    ...estado.categorias
      .filter((c) => c.tipo === tipo)
      .map((c) => criar('option', { value: String(c.id), textContent: c.nome }))
  );
  if ([...select.options].some((o) => o.value === String(atual))) select.value = String(atual);
}

function iniciarEdicao(t) {
  estado.editandoId = t.id;
  form.elements.tipo.value = t.tipo;
  form.elements.descricao.value = t.descricao;
  form.elements.valor.value = (t.valor_centavos / 100).toFixed(2).replace('.', ',');
  form.elements.data.value = t.data;
  preencherSelectCategorias(t.categoria_id);
  $('#form-titulo').textContent = 'Editar lançamento';
  $('#form-salvar').textContent = 'Salvar alterações';
  $('#form-cancelar').hidden = false;
  mostrarErro($('#form-erro'));
  desenharTabela();
  if (celular.matches) return abrirFolha();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.elements.descricao.focus({ preventScroll: true });
}

function cancelarEdicao() {
  estado.editandoId = null;
  const tipo = form.elements.tipo.value;
  form.reset();
  form.elements.tipo.value = tipo;
  form.elements.data.value = hojeIso();
  preencherSelectCategorias();
  $('#form-titulo').textContent = 'Novo lançamento';
  $('#form-salvar').textContent = 'Adicionar';
  $('#form-cancelar').hidden = true;
  mostrarErro($('#form-erro'));
  desenharTabela();
  fecharFolha();
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'tipo') preencherSelectCategorias();
});
$('#form-cancelar').addEventListener('click', cancelarEdicao);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroEl = $('#form-erro');
  const descricao = form.elements.descricao.value.trim();
  const valor = lerValor(form.elements.valor.value);
  const data = form.elements.data.value;
  const categoriaId = Number(form.elements.categoria_id.value);

  if (!descricao) return mostrarErro(erroEl, 'Informe uma descrição.');
  if (valor === null) return mostrarErro(erroEl, 'Informe um valor maior que zero, como 59,90.');
  if (!data) return mostrarErro(erroEl, 'Informe a data.');
  if (!categoriaId) return mostrarErro(erroEl, 'Crie uma categoria deste tipo antes de lançar.');

  const corpo = { tipo: form.elements.tipo.value, descricao, valor_centavos: valor, data, categoria_id: categoriaId };
  try {
    await Dados.salvarTransacao(corpo, estado.editandoId);
    estado.mes = data.slice(0, 7); // mostra o mês em que o lançamento caiu
    cancelarEdicao();
    await carregarTudo();
    if (!celular.matches) form.elements.descricao.focus({ preventScroll: true });
  } catch (erro) {
    mostrarErro(erroEl, erro.message);
  }
});

// ---------- Categorias ----------

function desenharCategorias() {
  for (const tipo of ['despesa', 'receita']) {
    $(`#cats-${tipo}`).replaceChildren(
      ...estado.categorias
        .filter((c) => c.tipo === tipo)
        .map((c) => {
          const remover = criar('button', { type: 'button', textContent: '×', title: `Excluir ${c.nome}` });
          remover.setAttribute('aria-label', `Excluir categoria ${c.nome}`);
          remover.addEventListener('click', async () => {
            if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
            try {
              await Dados.excluirCategoria(c.id);
              mostrarErro($('#cat-erro'));
              await carregarCategorias();
            } catch (erro) {
              mostrarErro($('#cat-erro'), erro.message);
            }
          });
          return criar('li', {}, c.nome, remover);
        })
    );
  }
}

$('#form-categoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  try {
    await Dados.criarCategoria({ nome: f.elements.nome.value, tipo: f.elements.tipo.value });
    f.elements.nome.value = '';
    mostrarErro($('#cat-erro'));
    await carregarCategorias();
  } catch (erro) {
    mostrarErro($('#cat-erro'), erro.message);
  }
});

// ---------- Gráficos ----------

function tema() {
  const css = getComputedStyle(document.documentElement);
  const v = (nome) => css.getPropertyValue(nome).trim();
  return {
    receita: v('--receita'), despesa: v('--despesa'), tinta: v('--tinta'), tinta2: v('--tinta-2'),
    apagado: v('--apagado'), grade: v('--grade'), eixo: v('--eixo'), superficie: v('--superficie'),
  };
}

function opcoesBase(t) {
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.tinta2;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    tooltip: {
      backgroundColor: t.tinta, titleColor: t.superficie, bodyColor: t.superficie,
      padding: 10, cornerRadius: 8, boxPadding: 4, usePointStyle: true,
    },
  };
}

const eixoValor = (t) => ({
  beginAtZero: true,
  border: { display: false },
  grid: { color: t.grade },
  ticks: { color: t.apagado, maxTicksLimit: 5, maxRotation: 0, callback: (v) => 'R$ ' + fmtCompacto.format(v) },
});
const eixoRotulo = (t) => ({
  border: { color: t.eixo },
  grid: { display: false },
  ticks: { color: t.tinta2, maxRotation: 0 },
});

function desenharGraficoCategorias(resumo) {
  const t = tema();
  const base = opcoesBase(t);
  const dados = resumo.porCategoria.filter((c) => c.tipo === 'despesa');
  graficos.categorias?.destroy();
  graficos.categorias = null;
  $('#vazio-categorias').hidden = dados.length > 0;
  $('#caixa-categorias').hidden = dados.length === 0;
  if (dados.length === 0) return;

  $('#caixa-categorias').style.height = `${Math.max(120, dados.length * 34 + 40)}px`;
  graficos.categorias = new Chart($('#grafico-categorias'), {
    type: 'bar',
    data: {
      labels: dados.map((c) => c.categoria),
      datasets: [{
        label: 'Despesas',
        data: dados.map((c) => c.total / 100),
        backgroundColor: t.despesa,
        borderRadius: 4,
        maxBarThickness: 18,
      }],
    },
    options: {
      ...base,
      indexAxis: 'y',
      scales: { x: eixoValor(t), y: eixoRotulo(t) },
      plugins: {
        legend: { display: false }, // série única: o título já diz o que é
        tooltip: {
          ...base.tooltip,
          callbacks: {
            label: (ctx) => {
              const pct = Math.round((ctx.parsed.x * 100 * 100) / resumo.despesas);
              return ` ${fmtBRL.format(ctx.parsed.x)} (${pct}% das despesas)`;
            },
          },
        },
      },
    },
  });
}

function desenharGraficoAnual(anual) {
  const t = tema();
  const base = opcoesBase(t);
  const serie = (label, campo, cor) => ({
    label, data: anual.map((m) => m[campo] / 100),
    backgroundColor: cor, borderRadius: 4, maxBarThickness: 22, pointStyle: 'rectRounded',
  });
  graficos.anual?.destroy();
  graficos.anual = new Chart($('#grafico-anual'), {
    type: 'bar',
    data: {
      labels: MESES,
      datasets: [serie('Receitas', 'receitas', t.receita), serie('Despesas', 'despesas', t.despesa)],
    },
    options: {
      ...base,
      interaction: { mode: 'index', intersect: false },
      datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.88 } },
      scales: { x: eixoRotulo(t), y: eixoValor(t) },
      // Clicar em um mês do gráfico navega para ele.
      onClick: (_evento, elementos) => {
        if (!elementos.length) return;
        irParaMes(`${estado.mes.slice(0, 4)}-${String(elementos[0].index + 1).padStart(2, '0')}`);
      },
      onHover: (evento, elementos) => {
        evento.native.target.style.cursor = elementos.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { usePointStyle: true, boxWidth: 10, boxHeight: 10, color: t.tinta2 },
        },
        tooltip: {
          ...base.tooltip,
          callbacks: {
            title: (itens) => `${itens[0].label}/${estado.mes.slice(0, 4)}`,
            label: (ctx) => ` ${ctx.dataset.label}: ${fmtBRL.format(ctx.parsed.y)}`,
            footer: (itens) => {
              const saldo = (itens[0]?.chart.data.datasets[0].data[itens[0].dataIndex] ?? 0) -
                (itens[0]?.chart.data.datasets[1].data[itens[0].dataIndex] ?? 0);
              return `Saldo: ${fmtBRL.format(saldo)}`;
            },
          },
        },
      },
    },
  });
}

// Redesenha com as cores certas quando o sistema troca entre claro e escuro.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (ultimoResumo) desenharGraficoCategorias(ultimoResumo);
  if (ultimoAnual) desenharGraficoAnual(ultimoAnual);
});

// ---------- Navegação por mês ----------

function irParaMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes)) return;
  estado.mes = mes;
  carregarTudo().catch((erro) => alert(erro.message));
}
$('#mes-anterior').addEventListener('click', () => irParaMes(somarMes(estado.mes, -1)));
$('#mes-seguinte').addEventListener('click', () => irParaMes(somarMes(estado.mes, 1)));
$('#mes').addEventListener('change', (e) => irParaMes(e.target.value));

// ---------- Casca de aplicativo (celular) ----------

const celular = matchMedia('(max-width: 760px)');

function abrirFolha() {
  document.body.classList.add('folha-aberta');
}
function fecharFolha() {
  document.body.classList.remove('folha-aberta');
}

$('#novo').addEventListener('click', () => {
  cancelarEdicao();
  abrirFolha();
});
$('#folha-fechar').addEventListener('click', cancelarEdicao);
$('#fundo-folha').addEventListener('click', cancelarEdicao);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('folha-aberta')) cancelarEdicao();
});

function irParaTela(tela) {
  document.body.dataset.tela = tela;
  for (const aba of document.querySelectorAll('.abas button')) {
    if (aba.dataset.ir === tela) aba.setAttribute('aria-current', 'page');
    else aba.removeAttribute('aria-current');
  }
  scrollTo(0, 0);
  try { sessionStorage.setItem('tela', tela); } catch { /* sem armazenamento: só não lembra a aba */ }
}
for (const aba of document.querySelectorAll('.abas button')) {
  aba.addEventListener('click', () => irParaTela(aba.dataset.ir));
}
try {
  const salva = sessionStorage.getItem('tela');
  if (['resumo', 'lancamentos', 'categorias'].includes(salva)) irParaTela(salva);
} catch { /* ignora */ }

// ---------- Backup: exportar e importar ----------

function avisoBackup(texto) {
  $('#backup-msg').textContent = texto;
  $('#backup-msg').hidden = false;
}

$('#exportar').addEventListener('click', async () => {
  try {
    const backup = await Dados.exportar();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = criar('a', { href: url, download: `gastos-${hojeIso()}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    avisoBackup(`Backup exportado com ${backup.transacoes.length} lançamento(s). Guarde o arquivo em um lugar seguro.`);
  } catch (erro) {
    avisoBackup(erro.message);
  }
});

$('#importar').addEventListener('click', () => $('#arquivo-importar').click());
$('#arquivo-importar').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = ''; // permite escolher o mesmo arquivo de novo
  if (!arquivo) return;
  try {
    let backup;
    try {
      backup = JSON.parse(await arquivo.text());
    } catch {
      throw new Error('Este arquivo não é um backup válido do Controle de gastos.');
    }
    const qtd = Array.isArray(backup?.transacoes) ? backup.transacoes.length : 0;
    const aviso = `Importar ${qtd} lançamento(s) de "${arquivo.name}"?\n\nIsso SUBSTITUI todos os dados deste aparelho e não pode ser desfeito.`;
    if (!confirm(aviso)) return;
    const r = await Dados.importar(backup);
    cancelarEdicao();
    await carregarCategorias();
    await carregarTudo();
    avisoBackup(`Importado: ${r.transacoes} lançamento(s) e ${r.categorias} categoria(s).`);
  } catch (erro) {
    avisoBackup(erro.message);
  }
});

// ---------- Instalação e funcionamento offline ----------

let promptInstalar = null;

function atualizarInstalacao() {
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  let texto;
  if (instalado) texto = 'Aplicativo instalado. Funciona sem internet.';
  else if (promptInstalar) texto = 'Instale para ter um ícone na tela inicial e usar sem internet.';
  else if (ios) texto = 'No iPhone: abra no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".';
  else texto = 'Para instalar, abra o menu do navegador e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".';
  $('#instalar-texto').textContent = texto;
  $('#instalar').hidden = instalado || !promptInstalar;
}

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalar = e;
  atualizarInstalacao();
});
addEventListener('appinstalled', () => {
  promptInstalar = null;
  atualizarInstalacao();
});
$('#instalar').addEventListener('click', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  atualizarInstalacao();
});
atualizarInstalacao();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker: funciona, mas só online */ });
}
// Pede ao navegador para não apagar os dados sozinho quando faltar espaço.
navigator.storage?.persist?.().catch(() => {});

// ---------- Início ----------

form.elements.data.value = hojeIso();
carregarCategorias()
  .then(carregarTudo)
  .catch((erro) => alert(erro.message));
