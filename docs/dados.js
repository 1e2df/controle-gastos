// Banco de dados local: IndexedDB, que fica guardado no próprio aparelho e funciona sem internet.
// Valores monetários são guardados em CENTAVOS (inteiro) para evitar erros de ponto flutuante.
const Dados = (() => {
  const TIPOS = ['receita', 'despesa'];
  const CATEGORIAS_PADRAO = {
    despesa: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Outros'],
    receita: ['Salário', 'Freelance', 'Outros'],
  };

  // ---------- Conexão ----------

  let conexao;
  function abrir() {
    conexao ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('controle-gastos', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const cats = db.createObjectStore('categorias', { keyPath: 'id', autoIncrement: true });
        const trans = db.createObjectStore('transacoes', { keyPath: 'id', autoIncrement: true });
        trans.createIndex('data', 'data'); // AAAA-MM-DD: permite buscar por mês ou ano
        trans.createIndex('categoria_id', 'categoria_id');
        for (const [tipo, nomes] of Object.entries(CATEGORIAS_PADRAO)) {
          for (const nome of nomes) cats.add({ nome, tipo });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Não foi possível abrir o banco de dados deste aparelho.'));
    });
    return conexao;
  }

  const pedido = (req) =>
    new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  async function loja(nome, modo = 'readonly') {
    return (await abrir()).transaction(nome, modo).objectStore(nome);
  }

  // Todos os lançamentos cuja data começa com o prefixo ('2026-11' = mês, '2026' = ano).
  async function doPeriodo(prefixo) {
    const indice = (await loja('transacoes')).index('data');
    return pedido(indice.getAll(IDBKeyRange.bound(prefixo, prefixo + '￿')));
  }

  // ---------- Validação ----------

  function dataValida(data) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return false;
    const d = new Date(data + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data; // recusa 2026-02-31
  }

  function validarCampos(t) {
    if (!TIPOS.includes(t.tipo)) throw new Error('Tipo deve ser "receita" ou "despesa".');
    const descricao = String(t.descricao ?? '').trim();
    if (!descricao || descricao.length > 120) throw new Error('Descrição obrigatória (até 120 caracteres).');
    if (!Number.isInteger(t.valor_centavos) || t.valor_centavos <= 0 || t.valor_centavos > 1e11) {
      throw new Error('Valor deve ser maior que zero.');
    }
    if (!dataValida(t.data)) throw new Error('Data inválida.');
    return { tipo: t.tipo, descricao, valor_centavos: t.valor_centavos, data: t.data, categoria_id: Number(t.categoria_id) };
  }

  function validarNomeCategoria(c) {
    const nome = String(c.nome ?? '').trim();
    if (!nome || nome.length > 40) throw new Error('Nome obrigatório (até 40 caracteres).');
    if (!TIPOS.includes(c.tipo)) throw new Error('Tipo deve ser "receita" ou "despesa".');
    return { nome, tipo: c.tipo };
  }

  // ---------- Categorias ----------

  async function categorias() {
    const todas = await pedido((await loja('categorias')).getAll());
    return todas.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async function criarCategoria(corpo) {
    const nova = validarNomeCategoria(corpo);
    const igual = (c) => c.tipo === nova.tipo && c.nome.toLowerCase() === nova.nome.toLowerCase();
    if ((await categorias()).some(igual)) throw new Error('Já existe uma categoria com esse nome.');
    const id = await pedido((await loja('categorias', 'readwrite')).add(nova));
    return { id, ...nova };
  }

  async function excluirCategoria(id) {
    const emUso = await pedido((await loja('transacoes')).index('categoria_id').count(id));
    if (emUso > 0) throw new Error(`Categoria em uso por ${emUso} lançamento(s). Remova ou altere-os antes.`);
    await pedido((await loja('categorias', 'readwrite')).delete(id));
  }

  // ---------- Lançamentos ----------

  async function transacoes(mes) {
    const [lista, cats] = await Promise.all([doPeriodo(mes), categorias()]);
    const nomes = new Map(cats.map((c) => [c.id, c.nome]));
    return lista
      .map((t) => ({ ...t, categoria: nomes.get(t.categoria_id) ?? '(sem categoria)' }))
      .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
  }

  // Cria (sem id) ou altera (com id) um lançamento.
  async function salvarTransacao(corpo, id) {
    const t = validarCampos(corpo);
    const categoria = await pedido((await loja('categorias')).get(t.categoria_id));
    if (!categoria) throw new Error('Categoria não encontrada.');
    if (categoria.tipo !== t.tipo) throw new Error('A categoria não é do mesmo tipo do lançamento.');
    const store = await loja('transacoes', 'readwrite');
    return pedido(id ? store.put({ ...t, id }) : store.add(t));
  }

  async function excluirTransacao(id) {
    await pedido((await loja('transacoes', 'readwrite')).delete(id));
  }

  // ---------- Relatórios ----------

  // Totais do mês + soma por categoria (alimenta os cartões e o gráfico de categorias).
  async function resumo(mes) {
    const somas = new Map();
    for (const t of await transacoes(mes)) {
      const item = somas.get(t.categoria_id) ?? { categoria: t.categoria, tipo: t.tipo, total: 0 };
      item.total += t.valor_centavos;
      somas.set(t.categoria_id, item);
    }
    const porCategoria = [...somas.values()].sort((a, b) => b.total - a.total);
    const soma = (tipo) => porCategoria.filter((c) => c.tipo === tipo).reduce((s, c) => s + c.total, 0);
    const receitas = soma('receita');
    const despesas = soma('despesa');
    return { mes, receitas, despesas, saldo: receitas - despesas, porCategoria };
  }

  // Receitas e despesas de cada mês do ano (alimenta o gráfico anual).
  async function anual(ano) {
    const meses = Array.from({ length: 12 }, (_, i) => ({ mes: String(i + 1).padStart(2, '0'), receitas: 0, despesas: 0 }));
    for (const t of await doPeriodo(ano)) {
      meses[Number(t.data.slice(5, 7)) - 1][t.tipo === 'receita' ? 'receitas' : 'despesas'] += t.valor_centavos;
    }
    return meses;
  }

  // ---------- Backup ----------

  async function exportar() {
    return {
      app: 'controle-gastos',
      versao: 1,
      exportado_em: new Date().toISOString(),
      categorias: await pedido((await loja('categorias')).getAll()),
      transacoes: await pedido((await loja('transacoes')).getAll()),
    };
  }

  // Substitui TODOS os dados do aparelho pelo conteúdo do backup. Valida tudo antes de apagar qualquer coisa.
  async function importar(backup) {
    const invalido = new Error('Este arquivo não é um backup válido do Controle de gastos.');
    if (backup?.app !== 'controle-gastos' || !Array.isArray(backup.categorias) || !Array.isArray(backup.transacoes)) {
      throw invalido;
    }
    const idOk = (id) => Number.isInteger(id) && id > 0;
    const cats = new Map();
    for (const c of backup.categorias) {
      if (!idOk(c?.id) || cats.has(c.id)) throw invalido;
      cats.set(c.id, { id: c.id, ...validarNomeCategoria(c) });
    }
    const ids = new Set();
    const trans = backup.transacoes.map((t) => {
      if (!idOk(t?.id) || ids.has(t.id)) throw invalido;
      ids.add(t.id);
      const limpo = validarCampos(t);
      if (cats.get(limpo.categoria_id)?.tipo !== limpo.tipo) throw invalido;
      return { id: t.id, ...limpo };
    });

    // Uma única transação: ou entra tudo, ou nada muda.
    const tx = (await abrir()).transaction(['categorias', 'transacoes'], 'readwrite');
    const fim = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(new Error('Não foi possível importar. Seus dados não foram alterados.'));
    });
    tx.objectStore('categorias').clear();
    tx.objectStore('transacoes').clear();
    for (const c of cats.values()) tx.objectStore('categorias').put(c);
    for (const t of trans) tx.objectStore('transacoes').put(t);
    await fim;
    return { categorias: cats.size, transacoes: trans.length };
  }

  return {
    categorias, criarCategoria, excluirCategoria,
    transacoes, salvarTransacao, excluirTransacao,
    resumo, anual, exportar, importar,
  };
})();
