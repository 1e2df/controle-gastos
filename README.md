# Controle de gastos

Aplicativo de controle de gastos pessoais: cadastro de receitas e despesas, categorias e gráficos mensais. Instala pelo navegador e funciona sem internet.

**Abrir e instalar:** https://hendryck11st.github.io/controle-gastos/

## Como instalar

- **Android (Chrome):** abra o link, vá na aba Ajustes e toque em "Instalar aplicativo" (ou menu ⋮ → "Instalar aplicativo").
- **iPhone (Safari):** abra o link, toque em Compartilhar e depois em "Adicionar à Tela de Início".
- **Computador (Chrome ou Edge):** abra o link e clique no ícone de instalar na barra de endereço.

Depois da primeira abertura com internet, o app abre e funciona offline.

## Onde ficam os dados

Os lançamentos ficam guardados só no aparelho (IndexedDB do navegador). Nada é enviado para a internet e não há sincronização entre aparelhos.

- Para ter uma cópia ou levar os dados a outro aparelho: Ajustes → "Exportar arquivo" e, no outro, "Importar arquivo". Importar substitui todos os dados do aparelho.
- Limpar os dados do navegador ou desinstalar o app apaga os lançamentos. Exporte um backup de vez em quando.

## Estrutura

| Arquivo | O que faz |
|---|---|
| `docs/index.html`, `docs/style.css` | Página e estilos (tema claro e escuro, casca de aplicativo no celular) |
| `docs/dados.js` | Banco local em IndexedDB: validação, consultas, backup |
| `docs/app.js` | Formulários, lista, gráficos (Chart.js), instalação |
| `docs/sw.js` | Service worker: guarda os arquivos para abrir offline |
| `docs/manifest.webmanifest`, `docs/icone-*.png` | Nome e ícones do app instalado |
| `server.js` | Servidor local, só para desenvolvimento |

Os valores ficam guardados em centavos (inteiros), para as somas não sofrerem com arredondamento de ponto flutuante.

## Desenvolver

```bash
npm start
```

Abra http://localhost:3210. Não há dependências para instalar.

A pasta `docs/` é publicada pelo GitHub Pages a cada push na branch `main`. Ao publicar uma versão nova, aumente o número em `CACHE` no `docs/sw.js`.

## Ideias para evoluir

- Orçamento (limite) por categoria com alerta ao passar
- Lançamentos recorrentes (aluguel, salário)
- Exportar CSV para planilha
- Sincronização entre aparelhos
