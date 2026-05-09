require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 80;

// Configurar o CORS e JSON
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Criar pasta de uploads se não existir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Configurar Multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Configurar SQLite com Better-SQLite3
const dbPath = path.join(__dirname, 'bbr_database.sqlite');
const db = new Database(dbPath);
console.log('Conectado ao banco de dados SQLite (Better-SQLite3).');

// Criar tabela inicial
db.prepare(`CREATE TABLE IF NOT EXISTS inscricoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscricao_id TEXT UNIQUE,
    regiao TEXT,
    nome TEXT,
    sexo TEXT,
    nascimento TEXT,
    idade INTEGER,
    email TEXT,
    cidade TEXT,
    estado TEXT,
    nick_roblox TEXT,
    nick_discord TEXT,
    como_chamar TEXT,
    orientacao TEXT,
    jogos_fav TEXT,
    ja_participou_reality TEXT, quais_realities TEXT,
    exposicao_roblox TEXT, exposicao_detalhes TEXT,
    influente_comunidade TEXT, influente_detalhes TEXT,
    envolveu_polemica TEXT, polemica_detalhes TEXT,
    lida_exposicao_criticas TEXT,
    tira_do_serio TEXT,
    mania_esquisitice TEXT,
    reage_pressao TEXT,
    explosivo_controlado TEXT,
    irrita_convivencia TEXT,
    pessoa_competitiva TEXT, ponto_ganhar TEXT,
    resumo_historia TEXT,
    motivo_participar TEXT,
    por_que_assistir TEXT,
    o_que_faria_premio TEXT,
    jogar_sozinho_grupo TEXT,
    instagram TEXT,
    twitter TEXT,
    tiktok TEXT,
    foto_avatar_path TEXT,
    video_bbr_path TEXT,
    data_envio DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Atualizações do Schema para garantir que novas colunas existam
try { db.exec("ALTER TABLE inscricoes ADD COLUMN voicechat TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE inscricoes ADD COLUMN status_produtor TEXT DEFAULT 'Não analisado';"); } catch(e) {}
try { db.exec("ALTER TABLE inscricoes ADD COLUMN nota_produtor INTEGER;"); } catch(e) {}
try { db.exec("ALTER TABLE inscricoes ADD COLUMN obs_produtor TEXT;"); } catch(e) {}

// Criar tabela de configuração de regiões
db.prepare(`CREATE TABLE IF NOT EXISTS config_regioes (
    regiao TEXT PRIMARY KEY,
    status TEXT
)`).run();

// Popula as regiões por padrão como ABERTO se não existirem
const regioes_default = ['SUDESTE', 'SUL', 'CENTRO-OESTE', 'NORDESTE', 'NORTE'];
const stmtConfig = db.prepare('INSERT OR IGNORE INTO config_regioes (regiao, status) VALUES (?, ?)');
regioes_default.forEach(r => stmtConfig.run(r, 'ABERTO'));


// === MIDDLEWARE DE AUTENTICAÇÃO (ADMIN) ===
const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Acesso Negado. Insira as credenciais de administrador.');
    }
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'adminbbr26';

    if (user === adminUser && pass === adminPass) {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Acesso Negado. Credenciais inválidas.');
    }
};

// === ROTAS FRONTEND ===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/castitreach', basicAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// === ROTAS DO FORMULÁRIO PÚBLICO ===
const cpUpload = upload.fields([{ name: 'foto_avatar', maxCount: 1 }, { name: 'video_bbr', maxCount: 1 }]);
app.post('/submit', cpUpload, async (req, res) => {
    try {
        const data = req.body;

        // Validar Cloudflare Turnstile
        const secretKey = process.env.TURNSTILE_SECRET_KEY;
        const token = data['cf-turnstile-response'];

        if (!token) {
            return res.status(403).json({ error: 'Token do captcha ausente.' });
        }

        const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${secretKey}&response=${token}`
        });

        const verifyData = await verifyResponse.json();

        if (!verifyData.success) {
            console.error("Erro no Turnstile:", verifyData);
            return res.status(403).json({ 
                error: 'Falha na verificação do captcha.', 
                details: verifyData['error-codes'] 
            });
        }

        const foto_avatar_path = req.files && req.files['foto_avatar'] ? req.files['foto_avatar'][0].path.replace(/\\/g, '/') : null;
        const video_bbr_path = req.files && req.files['video_bbr'] ? req.files['video_bbr'][0].path.replace(/\\/g, '/') : null;

        // Gerar data de envio no horário de Brasília (UTC-3)
        const now = new Date();
        const brasiliaTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        const data_envio = brasiliaTime.toISOString().replace('T', ' ').substring(0, 19);

        const stmt = db.prepare(`INSERT INTO inscricoes (
            inscricao_id, regiao, nome, sexo, nascimento, idade, email, cidade, estado,
            nick_roblox, nick_discord, como_chamar, orientacao, jogos_fav, voicechat,
            ja_participou_reality, quais_realities, exposicao_roblox, exposicao_detalhes, influente_comunidade, influente_detalhes, envolveu_polemica, polemica_detalhes, lida_exposicao_criticas,
            tira_do_serio, mania_esquisitice, reage_pressao, explosivo_controlado, irrita_convivencia, pessoa_competitiva, ponto_ganhar, resumo_historia, motivo_participar, por_que_assistir, o_que_faria_premio, jogar_sozinho_grupo,
            instagram, twitter, tiktok, foto_avatar_path, video_bbr_path, data_envio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        const info = stmt.run(
            data.inscricao_id, data.regiao, data.nome, data.sexo, data.nascimento, data.idade, data.email, data.cidade, data.estado,
            data.nick_roblox, data.nick_discord, data.como_chamar, data.orientacao, data.jogos_fav, data.voicechat,
            data.ja_participou_reality, data.quais_realities, data.exposicao_roblox, data.exposicao_detalhes, data.influente_comunidade, data.influente_detalhes, data.envolveu_polemica, data.polemica_detalhes, data.lida_exposicao_criticas,
            data.tira_do_serio, data.mania_esquisitice, data.reage_pressao, data.explosivo_controlado, data.irrita_convivencia, data.pessoa_competitiva, data.ponto_ganhar, data.resumo_historia, data.motivo_participar, data.por_que_assistir, data.o_que_faria_premio, data.jogar_sozinho_grupo,
            data.instagram, data.twitter, data.tiktok, foto_avatar_path, video_bbr_path, data_envio
        );

        res.status(200).json({ success: true, message: 'Inscrição salva com sucesso!', id: info.lastInsertRowid });

    } catch (error) {
        console.error("Erro interno no servidor:", error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// === ROTAS DA API DE ADMIN (PROTEGIDAS) ===

// 1. Listar todas as tabelas
app.get('/api/admin/tables', basicAuth, (req, res) => {
    try {
        const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        res.json({ tables: rows.map(r => r.name) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Obter esquema de uma tabela
app.get('/api/admin/tables/:table/schema', basicAuth, (req, res) => {
    const table = req.params.table;
    try {
        const schema = db.prepare(`PRAGMA table_info("${table}")`).all();
        res.json({ schema });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Obter registros de uma tabela
app.get('/api/admin/tables/:table/rows', basicAuth, (req, res) => {
    const table = req.params.table;
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    try {
        const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
        let whereClause = '';
        let params = [];

        if (search) {
            const searchConditions = cols.map(c => `"${c.name}" LIKE ?`);
            whereClause = `WHERE ${searchConditions.join(' OR ')}`;
            for (let i = 0; i < cols.length; i++) {
                params.push(`%${search}%`);
            }
        }

        const countRow = db.prepare(`SELECT COUNT(*) as total FROM "${table}" ${whereClause}`).get(params);
        const total = countRow.total;

        const rows = db.prepare(`SELECT * FROM "${table}" ${whereClause} ORDER BY rowid DESC LIMIT ? OFFSET ?`).all([...params, limit, offset]);

        res.json({
            total: total,
            page: page,
            limit: limit,
            rows: rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Obter contagem por região
app.get('/api/admin/regions', basicAuth, (req, res) => {
    try {
        const rows = db.prepare("SELECT regiao, COUNT(*) as count FROM inscricoes GROUP BY regiao").all();
        res.json({ regions: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Obter inscrições por região
app.get('/api/admin/inscriptions/:region', basicAuth, (req, res) => {
    const region = req.params.region;
    try {
        let rows;
        if (region === 'Todas' || region === 'all') {
            rows = db.prepare("SELECT * FROM inscricoes ORDER BY data_envio DESC").all();
        } else {
            rows = db.prepare("SELECT * FROM inscricoes WHERE regiao = ? ORDER BY data_envio DESC").all(region);
        }
        res.json({ inscriptions: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Atualizar avaliação do produtor
app.put('/api/admin/inscriptions/:id/evaluate', basicAuth, (req, res) => {
    const id = req.params.id;
    const { status_produtor, nota_produtor, obs_produtor } = req.body;
    try {
        const stmt = db.prepare("UPDATE inscricoes SET status_produtor = ?, nota_produtor = ?, obs_produtor = ? WHERE id = ?");
        stmt.run(status_produtor, nota_produtor, obs_produtor, id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6.5. Excluir formulário do candidato
app.delete('/api/admin/inscriptions/:id', basicAuth, (req, res) => {
    const id = req.params.id;
    try {
        db.prepare("DELETE FROM inscricoes WHERE id = ?").run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Obter configurações das regiões (público)
app.get('/api/config/regions', (req, res) => {
    try {
        const rows = db.prepare("SELECT regiao, status FROM config_regioes").all();
        res.json({ config: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Atualizar status da região (admin)
app.post('/api/admin/config/regions', basicAuth, (req, res) => {
    const { regiao, status } = req.body;
    try {
        db.prepare("UPDATE config_regioes SET status = ? WHERE regiao = ?").run(status, regiao);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`✅ Servidor BBR Rodando na porta ${PORT}`);
    console.log(`🔒 Painel Admin disponível na rota /castitreach`);
    console.log(`=================================================`);
});
