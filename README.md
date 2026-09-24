# Sistema Financeiro dos Mentorados — Jornada do M1lhão

Cada mentorado entra com login próprio e enxerga o financeiro da empresa
dele. Nenhum mentorado vê o dado de outro.

Sistema separado do financeiro interno da Jornada, em repositório e projeto
Firebase próprios. O porquê está no `PLANO.md`, na pasta
`JornadaMilhao/Sistema Financeiro`.

---

## Como testar agora, sem configurar nada

O sistema abre em **modo de demonstração** enquanto a config do Firebase
ainda for a de exemplo. Ele vem com dados fictícios para você navegar por todas as telas.

Dê dois cliques em **`TESTAR - index.html.bat`**. Ele sobe um servidor local
e abre o navegador.

> Abrir o `index.html` direto, com dois cliques, **não funciona**. O sistema
> usa módulos JavaScript, e o navegador só carrega módulo por `http://`,
> nunca por `file://`. É por isso que existe o `.bat`.

Nada é salvo no modo de demonstração. Assim que a config real for colada, ele
some sozinho, e o arquivo `modo-demonstracao.js` pode ser apagado.

---

## Passo a passo: criar o projeto no Firebase

Faça na ordem. Cada passo leva menos de dois minutos.

### 1. Criar o projeto

1. Abra **https://console.firebase.google.com** e entre com sua conta Google.
2. Clique em **Criar um projeto**.
3. Nome do projeto: `financeiro-mentorados`. Clique em **Continuar**.
4. Na tela do Google Analytics, **desligue** a chave (não precisamos disso) e
   clique em **Criar projeto**.
5. Espere terminar e clique em **Continuar**.

### 2. Criar o app da web e pegar a config

1. Na tela inicial do projeto, clique no ícone **`</>`** (Web), no meio da
   tela, onde diz "Comece adicionando o Firebase ao seu app".
2. Apelido do app: `financeiro`. **Não** marque "Firebase Hosting".
3. Clique em **Registrar app**.
4. A tela seguinte mostra um bloco de código com `const firebaseConfig = {`.
   **Copie tudo que está entre as chaves `{` e `}`.**
5. Abra o arquivo **`firebase-init.js`** deste projeto num editor de texto.
6. Substitua o bloco que está lá (o que tem `COLE_AQUI`) pelo que você
   copiou. Salve.
7. De volta ao navegador, clique em **Continuar no console**.

### 3. Ligar o login por e-mail e senha

1. No menu da esquerda, clique em **Criar** e depois em **Authentication**.
2. Clique em **Vamos começar**.
3. Na lista de provedores, clique em **E-mail/senha**.
4. Ligue a **primeira** chave (E-mail/senha). Deixe a segunda desligada.
5. Clique em **Salvar**.

### 4. Criar o banco de dados

1. No menu da esquerda, clique em **Criar** e depois em **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha a região **`southamerica-east1`** (São Paulo). Clique em **Avançar**.
4. Escolha **Iniciar no modo de produção**. Clique em **Criar**.
5. Espere o banco aparecer.

### 5. Publicar as regras de segurança

Este passo é o que impede um mentorado de ler o dado de outro. **Não pule.**

1. Ainda no Firestore Database, clique na aba **Regras**, no topo.
2. Apague tudo que estiver na caixa de texto.
3. Abra o arquivo **`firestore.rules`** deste projeto, copie o conteúdo
   inteiro e cole na caixa.
4. Na linha que tem `request.auth.token.email == 'felipecastiged@gmail.com'`,
   confira se é o seu e-mail. Se não for, troque.
5. Clique em **Publicar**.

### 6. Abrir a janela do primeiro acesso

1. Ainda no Firestore, volte para a aba **Dados**.
2. Clique em **Iniciar coleta**.
3. ID da coleção: `config`. Clique em **Avançar**.
4. ID do documento: `bootstrap` (escreva à mão, não use o botão "automático").
5. Campo: `criado`, tipo **boolean**, valor **false**.
6. Clique em **Salvar**.

### 7. Criar a sua conta e entrar

1. No menu da esquerda, **Authentication** → aba **Users** → **Adicionar
   usuário**.
2. E-mail: o seu. Senha: `Jornada@2026`.
3. Clique em **Adicionar usuário**.
4. Abra o sistema pelo `TESTAR - index.html.bat` e entre com esse e-mail e
   essa senha.
5. O sistema pede uma senha nova. Escolha a sua.
6. Pronto: você entra como **Jornada** e vê o painel de mentorados, ainda
   vazio.

A janela do passo 6 se fecha sozinha nesse momento. Ninguém mais consegue
virar administrador por ali.

---

## Passo a passo: cadastrar um mentorado

Por enquanto isso é feito pelo console do Firebase. Quando houver mais de
dois ou três mentorados, vale fazer uma tela para isso.

### 1. Criar a empresa

1. Firestore → **Dados** → **Iniciar coleta** (ou o `+` ao lado de `empresas`,
   se já existir).
2. ID da coleção: `empresas`.
3. ID do documento: deixe o **automático**, e **copie o ID que ele gerar**.
   Você vai precisar dele no passo 3.
4. Campos:

   | Campo | Tipo | Valor |
   |---|---|---|
   | `nome` | string | Nome da empresa |
   | `cnpj` | string | (pode deixar vazio) |
   | `mesAbertura` | string | 2026-02 |
   | `unidades` | array | Matriz, Marambaia, Mauriti |
   | `autorizaJornada` | boolean | false |
   | `logoBase64` | string | (vazio) |

5. Salvar.

### 2. Criar o acesso da pessoa

1. **Authentication** → **Users** → **Adicionar usuário**.
2. E-mail do mentorado. Senha: `Jornada@2026`.
3. **Copie o User UID** que aparece na lista.

### 3. Ligar a pessoa à empresa

1. Firestore → **Dados** → coleção `usuarios` → **Adicionar documento**.
2. **ID do documento: cole o User UID do passo anterior.** Tem que ser
   exatamente ele.
3. Campos:

   | Campo | Tipo | Valor |
   |---|---|---|
   | `empresaId` | string | o ID da empresa (passo 1) |
   | `papel` | string | `dono` |
   | `nome` | string | nome da pessoa |
   | `email` | string | e-mail dela |

4. Salvar.

Pronto. A pessoa entra com o e-mail dela e `Jornada@2026`, troca a senha na
primeira entrada, e enxerga só a empresa dela.

**Papéis possíveis:** `dono` e `financeiro` leem e escrevem; `leitura` só lê;
`jornada` é a equipe da Jornada e não tem `empresaId`.

---

## Como o sistema funciona

### A cadeia que tudo segue

```
  Faturamento
− Custos vinculados às vendas
− Comissões
────────────────────────────
= LUCRO BRUTO
− Custos não previstos
− Custos fixos e folha
− Impostos
────────────────────────────
= LUCRO LÍQUIDO
```

Um campo decide os dois lados: o **vínculo com a venda**. Custo com venda
vinculada entra antes do lucro bruto; sem vínculo, entra depois.

### Regime

Receita entra no mês da venda. Custo entra no mês em que foi pago. Mês
fechado não é reaberto: custo atrasado bate no mês do pagamento.

Por isso existe a tela de **Pendências**: enquanto um custo esperado estiver
em branco, a margem daquela venda é provisória, e o sistema diz isso.

### Números calculados

Nenhum resultado é digitado. Custo total, lucro bruto, margem, ticket médio e
totais são sempre soma do que foi lançado. Desconto e comissão aceitam
percentual **ou** valor: você digita um, o sistema mostra o outro.

### Custos fixos e folha

A tela de **Fixos e Folha** é só a **base**: o que se repete todo mês. Ela
gera a ocorrência do mês na tela de **Custos**, e é lá que o valor pode ser
ajustado, adiado ou marcado sem mexer na base.

No começo de cada mês, a tela de Custos oferece o botão **Gerar lançamentos
do mês**.

### Acesso da Jornada

A chave fica em **Configurações**, e é do mentorado. Ligada, a Jornada
enxerga os números daquela empresa. Desligada, não enxerga — e isso vale na
regra do banco, não só na tela.

---

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.html` | O esqueleto da página e o fundo animado |
| `style.css` | Toda a aparência, na paleta da Jornada |
| `app.js` | As telas, os modais e as interações |
| `dados.js` | Leitura, escrita e os cálculos derivados |
| `auth.js` | Login, papéis e a troca obrigatória de senha |
| `shared.js` | Utilitários: formatação, ícones, toast, modal |
| `firebase-init.js` | A config do Firebase (é aqui que você cola a sua) |
| `firestore.rules` | As regras de segurança, publicadas no console |
| `modo-demonstracao.js` | Dados de exemplo; apagável depois de configurar |
| `importar-planilha.mjs` | Importa o histórico de uma planilha, roda uma vez |

Depois de qualquer mudança em `app.js` ou `style.css`, suba o número do `?v=`
no `index.html`. Sem isso o navegador serve a versão antiga sem avisar.

---

## Publicar no ar

1. Crie um repositório **privado** no GitHub.
2. Suba todos os arquivos **na raiz** do repositório, não dentro de pasta.
3. No repositório: **Settings** → **Pages** → em "Source", escolha a branch
   `main` e a pasta `/ (root)`. Salve.
4. Espere alguns minutos e abra o endereço que aparecer.
5. No Firebase: **Authentication** → **Settings** → **Domínios autorizados** →
   **Adicionar domínio**, e cole o domínio do GitHub Pages. Sem isso o login
   não funciona no ar.

**Sobre o repositório ser público.** O código pode ser público sem risco: a
`apiKey` do Firebase é pública por design, e quem protege o dado são as
`firestore.rules`. O que nunca entra aqui é dado real de cliente. Os nomes e
valores do modo de demonstração são fictícios de propósito, e a planilha a
importar fica fora do repositório.
