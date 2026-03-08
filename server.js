const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const session = require("express-session");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "produtora-leal-chave-secreta";

const DEFAULT_ADMIN_USER = process.env.ADMIN_USER || "admin";
const DEFAULT_ADMIN_PASS = process.env.ADMIN_PASS || "leal123";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  return res.status(401).json({
    sucesso: false,
    erro: "Não autorizado. Faça login para acessar esta área."
  });
}

app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database(path.join(__dirname, "clientes.db"));

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDatabase() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      empresa TEXT,
      telefone TEXT NOT NULL,
      email TEXT,
      cidade TEXT,
      servico TEXT NOT NULL,
      orcamento TEXT,
      mensagem TEXT,
      origem TEXT DEFAULT 'site',
      prioridade TEXT DEFAULT '',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = await allAsync(`PRAGMA table_info(leads)`);
  const hasPrioridade = columns.some((column) => column.name === 'prioridade');
  if (!hasPrioridade) {
    await runAsync(`ALTER TABLE leads ADD COLUMN prioridade TEXT DEFAULT ''`);
  }

  await runAsync(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const existingAdmin = await getAsync(`SELECT id FROM admins WHERE usuario = ?`, [DEFAULT_ADMIN_USER]);
  if (!existingAdmin) {
    await runAsync(`INSERT INTO admins (usuario, senha_hash) VALUES (?, ?)`, [
      DEFAULT_ADMIN_USER,
      hashPassword(DEFAULT_ADMIN_PASS)
    ]);
  }
}

app.post("/api/login", async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ sucesso: false, erro: "Informe usuário e senha." });
    }

    const admin = await getAsync(`SELECT * FROM admins WHERE usuario = ?`, [usuario]);

    if (!admin || admin.senha_hash !== hashPassword(senha)) {
      return res.status(401).json({
        sucesso: false,
        erro: "Usuário ou senha inválidos."
      });
    }

    req.session.admin = true;
    req.session.adminId = admin.id;
    req.session.usuario = admin.usuario;

    return res.json({
      sucesso: true,
      mensagem: "Login realizado com sucesso."
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ sucesso: false, erro: "Erro interno ao fazer login." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    return res.json({ sucesso: true });
  });
});

app.get("/api/admin-status", (req, res) => {
  return res.json({
    autenticado: Boolean(req.session && req.session.admin),
    usuario: req.session?.usuario || null
  });
});

app.get("/api/admins", requireAdmin, async (req, res) => {
  try {
    const admins = await allAsync(
      `SELECT id, usuario, criado_em FROM admins ORDER BY id ASC`
    );
    res.json(admins);
  } catch (error) {
    console.error("Erro ao listar admins:", error);
    res.status(500).json({ sucesso: false, erro: "Erro ao listar usuários administrativos." });
  }
});

app.post("/api/admins", requireAdmin, async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ sucesso: false, erro: "Informe usuário e senha." });
    }

    const cleanUser = String(usuario).trim().toLowerCase();
    if (cleanUser.length < 3) {
      return res.status(400).json({ sucesso: false, erro: "O usuário deve ter pelo menos 3 caracteres." });
    }

    if (String(senha).length < 4) {
      return res.status(400).json({ sucesso: false, erro: "A senha deve ter pelo menos 4 caracteres." });
    }

    const exists = await getAsync(`SELECT id FROM admins WHERE usuario = ?`, [cleanUser]);
    if (exists) {
      return res.status(400).json({ sucesso: false, erro: "Esse usuário já existe." });
    }

    await runAsync(`INSERT INTO admins (usuario, senha_hash) VALUES (?, ?)`, [
      cleanUser,
      hashPassword(senha)
    ]);

    res.json({ sucesso: true, mensagem: "Usuário administrativo criado com sucesso." });
  } catch (error) {
    console.error("Erro ao criar admin:", error);
    res.status(500).json({ sucesso: false, erro: "Erro ao criar usuário administrativo." });
  }
});

app.put("/api/admins/senha", requireAdmin, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ sucesso: false, erro: "Informe a senha atual e a nova senha." });
    }

    const admin = await getAsync(`SELECT * FROM admins WHERE id = ?`, [req.session.adminId]);
    if (!admin) {
      return res.status(404).json({ sucesso: false, erro: "Administrador não encontrado." });
    }

    if (admin.senha_hash !== hashPassword(senhaAtual)) {
      return res.status(400).json({ sucesso: false, erro: "Senha atual incorreta." });
    }

    if (String(novaSenha).length < 4) {
      return res.status(400).json({ sucesso: false, erro: "A nova senha deve ter pelo menos 4 caracteres." });
    }

    await runAsync(`UPDATE admins SET senha_hash = ? WHERE id = ?`, [
      hashPassword(novaSenha),
      req.session.adminId
    ]);

    res.json({ sucesso: true, mensagem: "Senha alterada com sucesso." });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    res.status(500).json({ sucesso: false, erro: "Erro ao alterar senha." });
  }
});

app.delete("/api/admins/:id", requireAdmin, async (req, res) => {
  try {
    const adminId = Number(req.params.id);
    if (!Number.isInteger(adminId)) {
      return res.status(400).json({ sucesso: false, erro: "ID inválido." });
    }

    if (adminId === req.session.adminId) {
      return res.status(400).json({ sucesso: false, erro: "Você não pode excluir o usuário que está logado." });
    }

    const total = await getAsync(`SELECT COUNT(*) AS total FROM admins`);
    if ((total?.total || 0) <= 1) {
      return res.status(400).json({ sucesso: false, erro: "É necessário manter pelo menos um administrador." });
    }

    await runAsync(`DELETE FROM admins WHERE id = ?`, [adminId]);
    res.json({ sucesso: true, mensagem: "Administrador removido com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir admin:", error);
    res.status(500).json({ sucesso: false, erro: "Erro ao excluir administrador." });
  }
});

app.post("/api/leads", (req, res) => {
  const {
    nome,
    empresa,
    telefone,
    email,
    cidade,
    servico,
    orcamento,
    mensagem,
    origem,
    prioridade
  } = req.body;

  if (!nome || !telefone || !servico) {
    return res.status(400).json({
      sucesso: false,
      erro: "Preencha nome, telefone e serviço desejado."
    });
  }

  const sql = `
    INSERT INTO leads (
      nome, empresa, telefone, email, cidade, servico, orcamento, mensagem, origem, prioridade
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      nome,
      empresa || "",
      telefone,
      email || "",
      cidade || "",
      servico,
      orcamento || "",
      mensagem || "",
      origem || "site",
      prioridade || ""
    ],
    function (err) {
      if (err) {
        console.error("Erro ao salvar lead:", err);
        return res.status(500).json({
          sucesso: false,
          erro: "Erro ao salvar os dados no banco."
        });
      }

      return res.json({
        sucesso: true,
        id: this.lastID,
        mensagem: "Solicitação enviada com sucesso. Em breve entraremos em contato."
      });
    }
  );
});

app.get("/api/leads", requireAdmin, (req, res) => {
  db.all(`SELECT * FROM leads ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      console.error("Erro ao listar leads:", err);
      return res.status(500).json({
        sucesso: false,
        erro: "Erro ao buscar os leads."
      });
    }

    res.json(rows);
  });
});

app.delete("/api/leads/:id", requireAdmin, async (req, res) => {
  try {
    const leadId = Number(req.params.id);
    if (!Number.isInteger(leadId)) {
      return res.status(400).json({ sucesso: false, erro: "ID inválido." });
    }

    const existing = await getAsync(`SELECT id FROM leads WHERE id = ?`, [leadId]);
    if (!existing) {
      return res.status(404).json({ sucesso: false, erro: "Lead não encontrado." });
    }

    await runAsync(`DELETE FROM leads WHERE id = ?`, [leadId]);
    return res.json({ sucesso: true, mensagem: "Lead removido com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir lead:", error);
    return res.status(500).json({ sucesso: false, erro: "Erro ao excluir lead." });
  }
});

app.get("/api/leads/resumo", requireAdmin, (req, res) => {
  db.get(
    `SELECT COUNT(*) AS total FROM leads`,
    [],
    (err, totalRow) => {
      if (err) {
        return res.status(500).json({ sucesso: false, erro: "Erro ao gerar resumo." });
      }

      db.all(
        `SELECT servico, COUNT(*) AS quantidade
         FROM leads
         GROUP BY servico
         ORDER BY quantidade DESC`,
        [],
        (groupErr, servicos) => {
          if (groupErr) {
            return res.status(500).json({ sucesso: false, erro: "Erro ao gerar resumo." });
          }

          res.json({
            total: totalRow?.total || 0,
            servicos
          });
        }
      );
    }
  );
});

app.get("/admin", (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.redirect("/admin-login.html");
  }

  return res.sendFile(path.join(__dirname, "public", "admin.html"));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
      console.log(`Admin padrão criado no banco: ${DEFAULT_ADMIN_USER}`);
    });
  })
  .catch((error) => {
    console.error("Erro ao iniciar banco de dados:", error);
    process.exit(1);
  });
