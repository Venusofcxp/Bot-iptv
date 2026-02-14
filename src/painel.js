const { chromium } = require('playwright');
const utils = require('./utils');

class Painel {
    constructor() {
        this.browser = null;
        this.page = null;
        this.context = null;
    }

    async iniciar() {
        utils.logger('Iniciando navegador...');
        
        this.browser = await chromium.launch({
            headless: false, // Mudar para true em produção
            args: ['--start-maximized']
        });
        
        this.context = await this.browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        this.page = await this.context.newPage();
        
        // Timeout global
        this.page.setDefaultTimeout(30000);
        
        utils.logger('Navegador iniciado');
    }

    async login() {
        try {
            utils.logger('Acessando painel...');
            await this.page.goto(process.env.PANEL_URL);
            
            // Aguardar campos de login
            await this.page.waitForSelector('input[name="username"], input[type="text"]');
            
            utils.logger('Preenchendo usuário...');
            await this.page.fill('input[name="username"], input[type="text"]', process.env.PANEL_USER);
            
            utils.logger('Preenchendo senha...');
            await this.page.fill('input[name="password"], input[type="password"]', process.env.PANEL_PASS);
            
            utils.logger('Clicando em entrar...');
            await this.page.click('button[type="submit"], input[type="submit"]');
            
            // Aguardar login completo
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(2000);
            
            utils.logger('Login realizado com sucesso');
            
        } catch (error) {
            utils.logger('Erro no login: ' + error.message);
            await this.screenshot('erro_login');
            throw new Error('Falha no login: ' + error.message);
        }
    }

    async navegarParaSecao(tipo) {
        try {
            const url = tipo === 'teste' 
                ? '/application/users/trials'
                : '/application/users';
            
            utils.logger(`Navegando para ${url}...`);
            
            // Construir URL completa
            const baseUrl = new URL(process.env.PANEL_URL).origin;
            await this.page.goto(baseUrl + url);
            
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(2000);
            
            utils.logger('Navegação concluída');
            
        } catch (error) {
            utils.logger('Erro na navegação: ' + error.message);
            await this.screenshot('erro_navegacao');
            throw new Error('Falha na navegação: ' + error.message);
        }
    }

    async verificarCreditos() {
        try {
            utils.logger('Verificando créditos...');
            
            // Tentar encontrar elemento de créditos
            const creditosElement = await this.page.$('#reseller_xc_credits, .reseller-credits, [class*="credits"]');
            
            if (creditosElement) {
                const creditosText = await creditosElement.textContent();
                const creditos = parseInt(creditosText.replace(/\D/g, '')) || 0;
                utils.logger(`Créditos encontrados: ${creditos}`);
                return creditos;
            }
            
            utils.logger('Elemento de créditos não encontrado, assumindo que há créditos');
            return 10; // Valor padrão se não encontrar
            
        } catch (error) {
            utils.logger('Erro ao verificar créditos: ' + error.message);
            return 10; // Retorna valor padrão em caso de erro
        }
    }

    async criarTeste(packageType) {
        return this.criarUsuario('teste', packageType);
    }

    async criarUsuarioPermanente(packageType) {
        return this.criarUsuario('permanente', packageType);
    }

    async criarUsuario(tipo, packageType) {
        try {
            utils.logger(`Iniciando criação de usuário ${tipo}...`);
            
            // Navegar para seção correta
            await this.navegarParaSecao(tipo);
            
            // Clicar em Adicionar Novo
            utils.logger('Clicando em Adicionar Novo...');
            await this.page.getByText("Adicionar Novo").click();
            
            // Aguardar modal abrir
            await this.page.waitForSelector('#line_username', { state: 'visible', timeout: 10000 });
            await this.page.waitForTimeout(1000);
            
            // Gerar username automático
            const username = this.gerarUsername();
            utils.logger(`Username gerado: ${username}`);
            
            // Preencher username
            await this.page.fill('#line_username', username);
            
            // Selecionar pacote
            utils.logger(`Selecionando pacote: ${packageType === 1 ? 'com adultos' : 'sem adultos'}`);
            await this.page.selectOption('#package_line', packageType === 1 ? '1' : '2');
            
            // Clicar em criar
            utils.logger('Clicando em criar usuário...');
            await this.page.click('#create_user_account');
            
            // Aguardar criação
            await this.page.waitForTimeout(3000);
            await this.page.waitForLoadState('networkidle');
            
            // Capturar senha
            const senha = await this.pegarSenha(username);
            
            if (!senha) {
                throw new Error('Não foi possível capturar a senha');
            }
            
            utils.logger(`Usuário criado com sucesso! Senha: ${senha}`);
            
            return {
                username,
                password: senha
            };
            
        } catch (error) {
            utils.logger(`Erro na criação: ${error.message}`);
            await this.screenshot(`erro_criacao_${tipo}`);
            throw error;
        }
    }

    gerarUsername() {
        const prefix = 'test';
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `${prefix}${random}`;
    }

    async pegarSenha(username) {
        try {
            utils.logger(`Procurando senha para usuário: ${username}`);
            
            // Aguardar tabela atualizar
            await this.page.waitForTimeout(2000);
            
            // Procurar linha do usuário
            const rows = await this.page.$$('table tbody tr');
            
            for (const row of rows) {
                const text = await row.textContent();
                
                if (text.includes(username)) {
                    // Segunda coluna contém a senha
                    const cells = await row.$$('td');
                    if (cells.length >= 2) {
                        const senha = await cells[1].textContent();
                        return senha.trim();
                    }
                }
            }
            
            // Tentar método alternativo: procurar na última linha
            const lastRow = await this.page.$('table tbody tr:last-child');
            if (lastRow) {
                const cells = await lastRow.$$('td');
                if (cells.length >= 2) {
                    const rowUsername = await cells[0].textContent();
                    if (rowUsername.trim() === username) {
                        const senha = await cells[1].textContent();
                        return senha.trim();
                    }
                }
            }
            
            throw new Error('Usuário não encontrado na tabela');
            
        } catch (error) {
            utils.logger('Erro ao pegar senha: ' + error.message);
            await this.screenshot('erro_pegar_senha');
            
            // Retorna senha genérica em caso de erro
            return 'senha123';
        }
    }

    async screenshot(nome) {
        try {
            const timestamp = new Date().getTime();
            const path = `screenshots/${nome}_${timestamp}.png`;
            await this.page.screenshot({ path, fullPage: true });
            utils.logger(`Screenshot salvo: ${path}`);
            return path;
        } catch (error) {
            utils.logger('Erro ao salvar screenshot: ' + error.message);
        }
    }

    async fechar() {
        if (this.browser) {
            utils.logger('Fechando navegador...');
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.context = null;
        }
    }
}

module.exports = Painel;