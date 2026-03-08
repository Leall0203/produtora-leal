const tableBody = document.getElementById("leadsTableBody");
const totalLeads = document.getElementById("totalLeads");
const serviceSummary = document.getElementById("serviceSummary");
const logoutButton = document.getElementById("logoutButton");
const adminUserBadge = document.getElementById("adminUserBadge");
const adminsList = document.getElementById("adminsList");
const createAdminForm = document.getElementById("createAdminForm");
const createAdminStatus = document.getElementById("createAdminStatus");
const changePasswordForm = document.getElementById("changePasswordForm");
const changePasswordStatus = document.getElementById("changePasswordStatus");
const searchLeadInput = document.getElementById("searchLeadInput");
const serviceFilter = document.getElementById("serviceFilter");
const exportCsvButton = document.getElementById("exportCsvButton");

let allLeads = [];

function setStatus(element, message, ok = false) {
  element.textContent = message;
  element.style.color = ok ? "#7ee787" : "#ff8b8b";
}

function escapeHtml(value) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function preencherFiltroServicos(leads) {
  const current = serviceFilter.value;
  const servicos = [...new Set(leads.map((lead) => lead.servico).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  serviceFilter.innerHTML = '<option value="">Todos os serviços</option>' + servicos.map((servico) => `<option value="${escapeHtml(servico)}">${escapeHtml(servico)}</option>`).join("");
  serviceFilter.value = servicos.includes(current) ? current : "";
}

function obterLeadsFiltrados() {
  const termo = (searchLeadInput.value || "").trim().toLowerCase();
  const servico = serviceFilter.value;

  return allLeads.filter((lead) => {
    const correspondeServico = !servico || lead.servico === servico;
    const alvo = [lead.nome, lead.empresa, lead.telefone, lead.email, lead.cidade, lead.servico, lead.mensagem]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const correspondeTermo = !termo || alvo.includes(termo);
    return correspondeServico && correspondeTermo;
  });
}

function renderizarLeads(leads) {
  tableBody.innerHTML = "";

  if (!Array.isArray(leads) || leads.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="12">Nenhum lead encontrado.</td></tr>';
    return;
  }

  leads.forEach((lead) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(lead.id)}</td>
      <td>${escapeHtml(lead.nome)}</td>
      <td>${escapeHtml(lead.empresa)}</td>
      <td>${escapeHtml(lead.telefone)}</td>
      <td>${escapeHtml(lead.email)}</td>
      <td>${escapeHtml(lead.cidade)}</td>
      <td>${escapeHtml(lead.servico)}</td>
      <td>${escapeHtml(lead.orcamento)}</td>
      <td>${escapeHtml(lead.prioridade)}</td>
      <td>${escapeHtml(lead.mensagem)}</td>
      <td>${escapeHtml(lead.criado_em)}</td>
      <td><button class="btn btn-danger btn-small" data-lead-id="${escapeHtml(lead.id)}">Excluir</button></td>
    `;
    tableBody.appendChild(row);
  });

  tableBody.querySelectorAll("[data-lead-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-lead-id");
      const ok = window.confirm("Deseja excluir este lead? Esta ação não pode ser desfeita.");
      if (!ok) return;

      try {
        const response = await fetch(`/api/leads/${id}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao excluir lead.");
        await carregarLeads();
        await carregarResumo();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function aplicarFiltros() {
  renderizarLeads(obterLeadsFiltrados());
}

async function verificarAutenticacao() {
  try {
    const response = await fetch("/api/admin-status");
    const data = await response.json();

    if (!data.autenticado) {
      window.location.href = "/admin-login.html";
      return false;
    }

    adminUserBadge.textContent = `Administrador: ${data.usuario || "admin"}`;
    return true;
  } catch (error) {
    console.error(error);
    window.location.href = "/admin-login.html";
    return false;
  }
}

async function carregarResumo() {
  try {
    const response = await fetch("/api/leads/resumo");
    if (response.status === 401) {
      window.location.href = "/admin-login.html";
      return;
    }

    const data = await response.json();
    totalLeads.textContent = data.total || 0;

    if (!data.servicos || data.servicos.length === 0) {
      serviceSummary.textContent = "Nenhum lead cadastrado ainda.";
      return;
    }

    serviceSummary.innerHTML = data.servicos.map((item) => `<span>${escapeHtml(item.servico)}: ${escapeHtml(item.quantidade)}</span>`).join("<br>");
  } catch (error) {
    console.error(error);
    serviceSummary.textContent = "Erro ao carregar resumo.";
  }
}

async function carregarLeads() {
  try {
    const response = await fetch("/api/leads");
    if (response.status === 401) {
      window.location.href = "/admin-login.html";
      return;
    }

    const leads = await response.json();
    allLeads = Array.isArray(leads) ? leads : [];
    preencherFiltroServicos(allLeads);
    aplicarFiltros();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = '<tr><td colspan="12">Erro ao carregar leads.</td></tr>';
  }
}

async function carregarAdmins() {
  try {
    const response = await fetch("/api/admins");
    if (response.status === 401) {
      window.location.href = "/admin-login.html";
      return;
    }

    const admins = await response.json();
    if (!Array.isArray(admins) || admins.length === 0) {
      adminsList.innerHTML = "Nenhum administrador cadastrado.";
      return;
    }

    adminsList.innerHTML = admins.map((admin) => `
      <div class="admin-user-row">
        <div>
          <strong>${escapeHtml(admin.usuario)}</strong>
          <small>Criado em: ${escapeHtml(admin.criado_em || "-")}</small>
        </div>
        <button class="btn btn-danger btn-small" data-admin-id="${escapeHtml(admin.id)}">Excluir</button>
      </div>
    `).join("");

    adminsList.querySelectorAll("[data-admin-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-admin-id");
        const ok = window.confirm("Tem certeza que deseja excluir este administrador?");
        if (!ok) return;

        try {
          const response = await fetch(`/api/admins/${id}`, { method: "DELETE" });
          const data = await response.json();
          if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao excluir administrador.");
          await carregarAdmins();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  } catch (error) {
    console.error(error);
    adminsList.innerHTML = "Erro ao carregar administradores.";
  }
}

createAdminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(createAdminForm).entries());
  setStatus(createAdminStatus, "Criando administrador...");

  try {
    const response = await fetch("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao criar administrador.");
    setStatus(createAdminStatus, data.mensagem, true);
    createAdminForm.reset();
    carregarAdmins();
  } catch (error) {
    setStatus(createAdminStatus, error.message);
  }
});

changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(changePasswordForm).entries());
  setStatus(changePasswordStatus, "Atualizando senha...");

  try {
    const response = await fetch("/api/admins/senha", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.sucesso) throw new Error(data.erro || "Erro ao atualizar senha.");
    setStatus(changePasswordStatus, data.mensagem, true);
    changePasswordForm.reset();
  } catch (error) {
    setStatus(changePasswordStatus, error.message);
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/admin-login.html";
  } catch (error) {
    console.error(error);
  }
});

searchLeadInput.addEventListener("input", aplicarFiltros);
serviceFilter.addEventListener("change", aplicarFiltros);

exportCsvButton.addEventListener("click", () => {
  const leads = obterLeadsFiltrados();
  if (!leads.length) {
    alert("Não há leads para exportar.");
    return;
  }

  const headers = ["ID", "Nome", "Empresa", "Telefone", "Email", "Cidade", "Serviço", "Orçamento", "Prioridade", "Mensagem", "Data"];
  const rows = leads.map((lead) => [lead.id, lead.nome, lead.empresa, lead.telefone, lead.email, lead.cidade, lead.servico, lead.orcamento, lead.prioridade, lead.mensagem, lead.criado_em]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "leads-produtora-leal.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

(async function init() {
  const autenticado = await verificarAutenticacao();
  if (!autenticado) return;

  carregarResumo();
  carregarLeads();
  carregarAdmins();
})();
