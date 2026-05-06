const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=================================================');
console.log('🚀 MONITOR DO SISTEMA BBR26 - VPS OPTIMIZED');
console.log('=================================================');

/**
 * Prepara o ambiente para rodar na VPS Ubuntu
 */
function prepareEnvironment() {
    const isLinux = process.platform === 'linux';
    
    // 1. Tenta corrigir permissões de execução que travam o npm
    if (isLinux) {
        try {
            console.log('[MONITOR] Aplicando permissões de execução (chmod +x)...');
            execSync('chmod -R +x node_modules/.bin 2>/dev/null || true');
        } catch (e) {}
    }

    // 2. Testa o novo driver Better-SQLite3
    try {
        console.log('[MONITOR] Verificando dependências...');
        require('better-sqlite3');
        console.log('[MONITOR] ✅ Better-SQLite3 pronto para uso!');
    } catch (e) {
        console.log(`[MONITOR] ⚠️ Falha ao carregar o driver: ${e.message}`);
        console.log('[MONITOR] Iniciando reinstalação forçada compatível com Ubuntu...');

        try {
            // Remove arquivos de trava
            if (fs.existsSync(path.join(__dirname, 'package-lock.json'))) {
                fs.unlinkSync(path.join(__dirname, 'package-lock.json'));
            }

            // Remove a pasta do módulo problemática
            const bsqPath = path.join(__dirname, 'node_modules', 'better-sqlite3');
            if (fs.existsSync(bsqPath)) {
                fs.rmSync(bsqPath, { recursive: true, force: true });
            }

            // Instalação com flag de permissão insegura (necessária em muitas VPS)
            console.log('[MONITOR] Executando: npm install --unsafe-perm');
            execSync('npm install --unsafe-perm', { stdio: 'inherit', cwd: __dirname });

            console.log('[MONITOR] Testando carregamento...');
            require('better-sqlite3');
            console.log('[MONITOR] ✅ Sistema recuperado e pronto!');
        } catch (err) {
            console.error('[MONITOR] ❌ Não foi possível instalar automaticamente.');
            console.log('\n--- COMANDOS DE REPARAÇÃO PARA VPS UBUNTU ---');
            console.log('Se o erro persistir, rode estes 3 comandos no terminal da sua VPS:');
            console.log('1. sudo apt-get update && sudo apt-get install -y build-essential python3');
            console.log('2. rm -rf node_modules package-lock.json');
            console.log('3. npm install --unsafe-perm');
            console.log('--------------------------------------------\n');
        }
    }
}

/**
 * Inicia o servidor e garante o uptime
 */
function startServer() {
    console.log('[MONITOR] Iniciando servidor principal...');

    const serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    serverProcess.on('close', (code) => {
        if (code === null) return;
        console.log(`[MONITOR] Servidor encerrou com código ${code}`);
        
        if (code !== 0) {
            console.log('[MONITOR] Tentando reiniciar o site em 5 segundos...');
            setTimeout(startServer, 5000);
        }
    });

    serverProcess.on('error', (err) => {
        console.error('[MONITOR] Erro ao lançar processo:', err.message);
        setTimeout(startServer, 10000);
    });
}

// Início
prepareEnvironment();
startServer();

process.on('uncaughtException', (err) => console.error('[MONITOR-FATAL]', err));
process.on('unhandledRejection', (reason) => console.error('[MONITOR-REJECTION]', reason));
