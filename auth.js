// Autenticação e papéis.
//
// Quem cria acesso é a Jornada, sempre. Não existe cadastro aberto nesta
// tela: o mentorado recebe e-mail e senha inicial e troca na primeira
// entrada.
//
// O vínculo pessoa ↔ empresa mora em /usuarios/{uid} e só a Jornada escreve
// lá. Se o próprio usuário pudesse editar, trocaria de empresa e leria o
// financeiro de outro mentorado — ver firestore.rules.

import { auth, db } from "./firebase-init.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { toast, ICONS, esc } from "./shared.js";

export const SENHA_INICIAL = "Jornada@2026";

export const SESSAO = {
  uid: null,
  email: null,
  nome: null,
  papel: null,        // dono | financeiro | leitura | jornada
  empresaId: null
};

export const podeEditar = () => ["dono", "financeiro"].includes(SESSAO.papel);
export const ehJornada  = () => SESSAO.papel === "jornada";

/* ============ ciclo de vida ============ */
export function iniciarAuth({ aoEntrar, aoSair }) {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      Object.keys(SESSAO).forEach(k => SESSAO[k] = null);
      mostrarLogin();
      aoSair && aoSair();
      return;
    }
    SESSAO.uid = user.uid;
    SESSAO.email = user.email;

    let vinculo = null;
    try {
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      if (snap.exists()) vinculo = snap.data();
    } catch (e) {
      console.error("Falha ao ler o vínculo do usuário.", e);
    }

    if (!vinculo) {
      // Conta existe no Auth mas ninguém criou o vínculo. Acontece se o
      // acesso foi criado no console do Firebase e o passo do sistema não.
      const aberto = await tentarBootstrap(user);
      if (!aberto) {
        mostrarLogin(`Esta conta ainda não está vinculada a nenhuma empresa. Fale com a Jornada.`);
        await signOut(auth);
        return;
      }
      vinculo = { papel: "jornada", empresaId: null, nome: user.email };
    }

    SESSAO.papel = vinculo.papel;
    SESSAO.empresaId = vinculo.empresaId || null;
    SESSAO.nome = vinculo.nome || user.email;

    // Senha inicial ainda não trocada: o sistema não abre antes disso.
    if (await senhaAindaInicial()) {
      mostrarTrocaSenha();
      return;
    }

    esconderLogin();
    aoEntrar && aoEntrar(SESSAO);
  });
}

/* A senha inicial é a mesma pra todo mundo e está escrita no README. Se ela
   continuar valendo, qualquer um que descubra o e-mail entra. Por isso a
   troca é obrigatória e checada tentando reautenticar com ela. */
async function senhaAindaInicial() {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, SENHA_INICIAL));
    return true;          // reautenticou: a senha ainda é a inicial
  } catch {
    return false;         // qualquer erro aqui significa que já trocaram
  }
}

async function tentarBootstrap(user) {
  // Janela de primeiro acesso da Jornada, fechada assim que é usada.
  try {
    const cfg = await getDoc(doc(db, "config", "bootstrap"));
    if (cfg.exists() && cfg.data().criado === true) return false;
    await setDoc(doc(db, "usuarios", user.uid), {
      empresaId: null, papel: "jornada", nome: user.email,
      email: user.email, criadoEm: serverTimestamp()
    });
    await setDoc(doc(db, "config", "bootstrap"), { criado: true, emailAdmin: user.email });
    toast("Primeiro acesso da Jornada criado.", "ok");
    return true;
  } catch (e) {
    console.warn("Bootstrap indisponível.", e);
    return false;
  }
}

export async function sair() {
  await signOut(auth);
}

/* ============ criar acesso de outra pessoa ============ */
// Roda na instância separada do Firebase (ver firebase-init.js): sem isso,
// quem está cadastrando é derrubado da própria sessão no meio do cadastro.
//
// Devolve o uid da conta criada. Quem grava o vínculo em /usuarios é o
// chamador, usando a sessão principal, porque é ela que a regra reconhece
// como equipe da Jornada.
export async function criarContaAuth(email, senha) {
  const { authCriador } = await import("./firebase-init.js");
  const { createUserWithEmailAndPassword, signOut: sairDe } =
    await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js");
  const aux = authCriador();
  try {
    const cred = await createUserWithEmailAndPassword(aux, email, senha);
    const uid = cred.user.uid;
    await sairDe(aux);          // não deixa sessão pendurada na instância auxiliar
    return uid;
  } catch (e) {
    try { await sairDe(aux); } catch {}
    const cod = e.code || "";
    if (cod.includes("email-already-in-use"))
      throw new Error("Já existe uma conta com esse e-mail.");
    if (cod.includes("invalid-email"))
      throw new Error("Esse e-mail não parece válido.");
    if (cod.includes("weak-password"))
      throw new Error("A senha precisa de pelo menos 6 caracteres.");
    if (cod.includes("operation-not-allowed"))
      throw new Error("O login por e-mail e senha não está ligado no Firebase. Veja o passo 3 do README.");
    throw new Error("Não consegui criar a conta agora.");
  }
}

/* Envia o link de definição de senha, para quem prefere não combinar a senha
   inicial por fora. */
export async function enviarLinkDeSenha(email) {
  await sendPasswordResetEmail(auth, email);
}

/* ============ tela de entrada ============ */
function telaLogin(aviso) {
  return `<div class="login">
    <div class="caixa">
      <img class="bussola" src="img/bussola.png" alt="">
      <img class="wm" src="img/wordmark.png" alt="Jornada do M1lhão">
      <p class="tagline">Financeiro</p>
      ${aviso ? `<div class="aviso-login">${esc(aviso)}</div>` : ""}
      <form id="form-login" class="frm" autocomplete="on">
        <label class="campo"><span>E-mail</span>
          <input type="email" id="login-email" required autocomplete="username" placeholder="seu@email.com"></label>
        <label class="campo"><span>Senha</span>
          <input type="password" id="login-senha" required autocomplete="current-password" placeholder="••••••••"></label>
        <button class="btn pri" type="submit" id="btn-entrar">Entrar</button>
        <button class="btn plano" type="button" id="btn-esqueci">Esqueci minha senha</button>
      </form>
      <p class="rodape-login">O acesso é criado pela Jornada.<br>Na primeira entrada o sistema pede a troca da senha.</p>
    </div>
  </div>`;
}

export function mostrarLogin(aviso) {
  const el = document.getElementById("entrada");
  el.innerHTML = telaLogin(aviso);
  el.classList.remove("oculto");
  document.getElementById("app").classList.add("oculto");

  document.getElementById("form-login").addEventListener("submit", async ev => {
    ev.preventDefault();
    const btn = document.getElementById("btn-entrar");
    const email = document.getElementById("login-email").value.trim();
    const senha = document.getElementById("login-senha").value;
    btn.disabled = true; btn.textContent = "Entrando…";
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (e) {
      btn.disabled = false; btn.textContent = "Entrar";
      const cod = e.code || "";
      toast(
        cod.includes("invalid-credential") || cod.includes("wrong-password") || cod.includes("user-not-found")
          ? "E-mail ou senha não conferem."
          : cod.includes("too-many-requests")
            ? "Muitas tentativas seguidas. Espere alguns minutos."
            : "Não consegui entrar agora. Tente de novo.",
        "erro");
    }
  });

  document.getElementById("btn-esqueci").addEventListener("click", async () => {
    const email = document.getElementById("login-email").value.trim();
    if (!email) return toast("Escreva seu e-mail primeiro.", "erro");
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Se este e-mail tiver acesso, o link de troca chegou na caixa dele.", "ok", 7000);
    } catch {
      toast("Não consegui enviar o link agora.", "erro");
    }
  });
}

export function esconderLogin() {
  document.getElementById("entrada").classList.add("oculto");
  document.getElementById("app").classList.remove("oculto");
}

/* ============ troca obrigatória de senha ============ */
function mostrarTrocaSenha() {
  const el = document.getElementById("entrada");
  el.innerHTML = `<div class="login">
    <div class="caixa">
      <img class="bussola" src="img/bussola.png" alt="">
      <h2>Crie sua senha</h2>
      <p class="tagline">Você entrou com a senha inicial. Escolha uma senha sua para continuar.</p>
      <form id="form-senha" class="frm">
        <label class="campo"><span>Nova senha</span>
          <input type="password" id="s1" required minlength="8" autocomplete="new-password" placeholder="pelo menos 8 caracteres"></label>
        <label class="campo"><span>Repita a nova senha</span>
          <input type="password" id="s2" required minlength="8" autocomplete="new-password"></label>
        <button class="btn pri" type="submit" id="btn-salvar-senha">Salvar e entrar</button>
        <button class="btn plano" type="button" id="btn-sair-senha">Sair</button>
      </form>
    </div>
  </div>`;
  el.classList.remove("oculto");
  document.getElementById("app").classList.add("oculto");

  document.getElementById("btn-sair-senha").addEventListener("click", sair);
  document.getElementById("form-senha").addEventListener("submit", async ev => {
    ev.preventDefault();
    const a = document.getElementById("s1").value, b = document.getElementById("s2").value;
    if (a !== b) return toast("As duas senhas não são iguais.", "erro");
    if (a === SENHA_INICIAL) return toast("Escolha uma senha diferente da inicial.", "erro");
    if (a.length < 8) return toast("Use pelo menos 8 caracteres.", "erro");
    const btn = document.getElementById("btn-salvar-senha");
    btn.disabled = true; btn.textContent = "Salvando…";
    try {
      await updatePassword(auth.currentUser, a);
      toast("Senha trocada.", "ok");
      location.reload();
    } catch (e) {
      btn.disabled = false; btn.textContent = "Salvar e entrar";
      console.error(e);
      toast("Não consegui trocar a senha agora. Saia e entre de novo.", "erro");
    }
  });
}
