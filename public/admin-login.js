const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");

async function verificarSessao() {
  try {
    const resposta = await fetch("/api/admin-status");
    const dados = await resposta.json();

    if (dados.autenticado) {
      window.location.href = "/admin";
    }
  } catch (erro) {
    console.error("Erro ao verificar sessão:", erro);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  loginStatus.textContent = "Entrando...";
  loginStatus.style.color = "#c7e0ff";

  try {
    const resposta = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const dados = await resposta.json();

    if (!resposta.ok || !dados.sucesso) {
      throw new Error(dados.erro || "Não foi possível fazer login.");
    }

    loginStatus.textContent = "Login realizado com sucesso. Redirecionando...";
    loginStatus.style.color = "#7ee787";

    setTimeout(() => {
      window.location.href = "/admin";
    }, 700);
  } catch (erro) {
    loginStatus.textContent = erro.message;
    loginStatus.style.color = "#ff8b8b";
  }
});

verificarSessao();
