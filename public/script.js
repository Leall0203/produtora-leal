const leadForm = document.getElementById("leadForm");
const formStatus = document.getElementById("formStatus");

if (leadForm) {
  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(leadForm);
    const payload = Object.fromEntries(formData.entries());

    formStatus.textContent = "Enviando solicitação...";
    formStatus.style.color = "#9fb0c5";

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.sucesso) {
        formStatus.textContent = data.mensagem;
        formStatus.style.color = "#7ce3ad";
        leadForm.reset();
      } else {
        formStatus.textContent = data.erro || "Não foi possível enviar sua solicitação.";
        formStatus.style.color = "#ff8f8f";
      }
    } catch (error) {
      console.error(error);
      formStatus.textContent = "Erro ao enviar os dados. Tente novamente.";
      formStatus.style.color = "#ff8f8f";
    }
  });
}
