const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.post('/submit', (req, res) => {
    console.log('Recebido:', req.body);
    res.status(200).json({ success: true, message: 'Teste bem-sucedido!' });
});

app.listen(PORT, () => {
    console.log(`Servidor de TESTE rodando em http://localhost:${PORT}`);
});
