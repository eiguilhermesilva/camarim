// drive-backup.js - Sistema de backup ULTRA SIMPLIFICADO para Google Drive
// Adaptado para Controle Financeiro GG

// PASSO 1: Configure seu Client ID do Google Cloud Console
var GOOGLE_CLIENT_ID = 'SEU_CLIENT_ID_AQUI'; // Substitua pelo seu Client ID

// Estado do sistema
var backupState = {
    token: null,
    signedIn: false,
    backups: []
};

// ============================================
// 1. AUTENTICAÇÃO SIMPLES COM POPUP
// ============================================

/**
 * Faz login no Google Drive
 */
function signInToDrive() {
    // Criar URL de autenticação
    var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        'client_id=' + encodeURIComponent(GOOGLE_CLIENT_ID) +
        '&redirect_uri=' + encodeURIComponent(window.location.origin + window.location.pathname) +
        '&response_type=token' +
        '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/drive.file') +
        '&include_granted_scopes=true' +
        '&state=pass_through_value' +
        '&prompt=consent';
    
    // Abrir popup para login
    var width = 500;
    var height = 600;
    var left = (window.screen.width - width) / 2;
    var top = (window.screen.height - height) / 2;
    
    var popup = window.open(
        authUrl,
        'Google Login',
        'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top
    );
    
    if (!popup) {
        alert('Por favor, permita popups para fazer login no Google Drive.');
        return;
    }
    
    // Verificar token periodicamente
    var checkPopup = setInterval(function() {
        try {
            if (popup.closed) {
                clearInterval(checkPopup);
                checkTokenFromURL();
            }
            
            // Tentar obter token do popup
            var popupUrl = popup.location.href;
            if (popupUrl.includes('access_token=')) {
                var token = extractTokenFromURL(popupUrl);
                if (token) {
                    backupState.token = token;
                    backupState.signedIn = true;
                    localStorage.setItem('drive_token', token);
                    popup.close();
                    clearInterval(checkPopup);
                    showBackupAlert('✅ Conectado ao Google Drive!', 'success');
                    updateBackupUI();
                    loadBackups();
                }
            }
        } catch (e) {
            // Ignorar erros de cross-origin
        }
    }, 500);
}

/**
 * Extrai token da URL
 */
function extractTokenFromURL(url) {
    var match = url.match(/access_token=([^&]+)/);
    return match ? match[1] : null;
}

/**
 * Verifica token na URL atual (para redirect)
 */
function checkTokenFromURL() {
    if (window.location.hash) {
        var token = extractTokenFromURL(window.location.hash);
        if (token) {
            backupState.token = token;
            backupState.signedIn = true;
            localStorage.setItem('drive_token', token);
            
            // Limpar URL
            history.replaceState(null, null, ' ');
            
            showBackupAlert('✅ Conectado ao Google Drive!', 'success');
            updateBackupUI();
            loadBackups();
        }
    }
}

/**
 * Faz logout
 */
function signOutFromDrive() {
    backupState.token = null;
    backupState.signedIn = false;
    localStorage.removeItem('drive_token');
    showBackupAlert('Desconectado do Google Drive', 'info');
    updateBackupUI();
}

/**
 * Tenta login automático com token salvo
 */
function tryAutoLogin() {
    var savedToken = localStorage.getItem('drive_token');
    if (savedToken) {
        // Verificar se o token ainda é válido
        fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + savedToken)
            .then(function(response) {
                if (response.ok) {
                    backupState.token = savedToken;
                    backupState.signedIn = true;
                    console.log('✅ Login automático realizado');
                    updateBackupUI();
                    loadBackups();
                } else {
                    localStorage.removeItem('drive_token');
                    updateBackupUI();
                }
            })
            .catch(function() {
                localStorage.removeItem('drive_token');
                updateBackupUI();
            });
    }
}

// ============================================
// 2. SISTEMA DE BACKUP DIRETO
// ============================================

/**
 * Cria um backup simples
 */
async function createSimpleBackup(description) {
    if (!backupState.signedIn) {
        showBackupAlert('Faça login primeiro', 'warning');
        return false;
    }
    
    try {
        showBackupAlert('Criando backup...', 'info');
        
        // 1. Obter dados do sistema financeiro
        var systemData = await getFinancialData();
        
        // 2. Adicionar informações do backup
        systemData.backupInfo = {
            date: new Date().toISOString(),
            description: description || 'Backup automático',
            version: '1.0',
            app: 'GG Controle Financeiro'
        };
        
        // 3. Criar nome do arquivo
        var dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        var timeStr = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-').split(' ')[0];
        var fileName = 'Financeiro_GG_Backup_' + dateStr + '_' + timeStr + '.json';
        if (description) {
            fileName = 'Financeiro_GG_' + description.replace(/[^a-z0-9]/gi, '_') + '_' + dateStr + '.json';
        }
        
        // 4. Criar arquivo no Google Drive
        var success = await createFileInDrive(fileName, JSON.stringify(systemData, null, 2));
        
        if (success) {
            showBackupAlert('✅ Backup criado com sucesso!', 'success');
            loadBackups();
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Erro ao criar backup:', error);
        showBackupAlert('Erro: ' + error.message, 'error');
        return false;
    }
}

/**
 * Obtém dados do sistema financeiro
 */
async function getFinancialData() {
    // Coletar todos os dados do sistema
    var data = {
        // Transações regulares
        transactions: transactions || [],
        
        // Transações recorrentes
        recurringTransactions: recurringTransactions || [],
        
        // Metas financeiras
        financialGoals: financialGoals || [],
        
        // Configurações
        notificationSettings: JSON.parse(localStorage.getItem('notificationSettings')) || {},
        
        // Informações gerais
        summary: {
            totalTransactions: transactions ? transactions.length : 0,
            totalRecurring: recurringTransactions ? recurringTransactions.length : 0,
            totalGoals: financialGoals ? financialGoals.length : 0,
            lastUpdate: new Date().toISOString()
        }
    };
    
    return data;
}

/**
 * Cria arquivo no Google Drive
 */
async function createFileInDrive(fileName, content) {
    var token = backupState.token;
    if (!token) throw new Error('Não autenticado');
    
    // 1. Procurar pasta "Financeiro GG Backups" ou criar
    var folderId = await findOrCreateFolder('Financeiro GG Backups');
    
    // 2. Criar arquivo
    var fileMetadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: [folderId]
    };
    
    var formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    formData.append('file', new Blob([content], { type: 'application/json' }));
    
    var response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        body: formData
    });
    
    if (!response.ok) {
        var error = await response.json();
        throw new Error(error.error?.message || 'Erro ao criar arquivo');
    }
    
    return true;
}

/**
 * Encontra ou cria pasta no Google Drive
 */
async function findOrCreateFolder(folderName) {
    var token = backupState.token;
    
    // Procurar pasta existente
    var searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
        'q=' + encodeURIComponent("name='" + folderName + "' and mimeType='application/vnd.google-apps.folder' and trashed=false") +
        '&fields=files(id,name)' +
        '&access_token=' + token;
    
    var response = await fetch(searchUrl);
    var data = await response.json();
    
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    
    // Criar nova pasta
    var createUrl = 'https://www.googleapis.com/drive/v3/files?access_token=' + token;
    var folderData = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
    };
    
    var createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderData)
    });
    
    var newFolder = await createResponse.json();
    return newFolder.id;
}

// ============================================
// 3. LISTAR E RESTAURAR BACKUPS
// ============================================

/**
 * Lista backups disponíveis
 */
async function loadBackups() {
    if (!backupState.signedIn) return;
    
    try {
        var token = backupState.token;
        
        // 1. Encontrar pasta "Financeiro GG Backups"
        var folderId = await findFolderId('Financeiro GG Backups');
        if (!folderId) {
            backupState.backups = [];
            updateBackupListUI();
            return;
        }
        
        // 2. Buscar arquivos na pasta
        var searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
            'q=' + encodeURIComponent("'" + folderId + "' in parents and mimeType='application/json' and trashed=false") +
            '&fields=files(id,name,createdTime,size)' +
            '&orderBy=createdTime desc' +
            '&access_token=' + token;
        
        var response = await fetch(searchUrl);
        var data = await response.json();
        
        if (data.files) {
            backupState.backups = data.files.map(function(file) {
                return {
                    id: file.id,
                    name: file.name,
                    date: new Date(file.createdTime),
                    size: file.size || 0,
                    formattedDate: new Date(file.createdTime).toLocaleString('pt-BR')
                };
            });
        } else {
            backupState.backups = [];
        }
        
        updateBackupListUI();
        
    } catch (error) {
        console.error('❌ Erro ao carregar backups:', error);
        backupState.backups = [];
        updateBackupListUI();
    }
}

/**
 * Encontra ID da pasta
 */
async function findFolderId(folderName) {
    var token = backupState.token;
    
    var searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
        'q=' + encodeURIComponent("name='" + folderName + "' and mimeType='application/vnd.google-apps.folder' and trashed=false") +
        '&fields=files(id)' +
        '&access_token=' + token;
    
    var response = await fetch(searchUrl);
    var data = await response.json();
    
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    
    return null;
}

/**
 * Restaura um backup
 */
async function restoreBackup(fileId) {
    if (!confirm('⚠️ ATENÇÃO!\n\nIsso substituirá TODOS os dados financeiros atuais pelo backup.\n\nRecomenda-se exportar um backup atual antes de restaurar.\n\nDeseja continuar?')) {
        return false;
    }
    
    try {
        showBackupAlert('Restaurando backup...', 'info');
        
        var token = backupState.token;
        
        // 1. Baixar arquivo
        var downloadUrl = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media';
        var response = await fetch(downloadUrl, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) throw new Error('Erro ao baixar arquivo');
        
        var backupData = await response.json();
        
        // 2. Validar dados
        if (!backupData.transactions || !Array.isArray(backupData.transactions)) {
            throw new Error('Arquivo de backup inválido');
        }
        
        // 3. Criar backup atual antes de restaurar
        await createSimpleBackup('antes_da_restauracao');
        
        // 4. Restaurar dados
        await applyBackupData(backupData);
        
        showBackupAlert('✅ Backup restaurado com sucesso!', 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao restaurar:', error);
        showBackupAlert('Erro: ' + error.message, 'error');
        return false;
    }
}

/**
 * Aplica dados do backup
 */
async function applyBackupData(backupData) {
    // 1. Atualizar transações
    if (backupData.transactions && Array.isArray(backupData.transactions)) {
        transactions = backupData.transactions;
        localStorage.setItem('financialTransactions', JSON.stringify(transactions));
    }
    
    // 2. Atualizar transações recorrentes
    if (backupData.recurringTransactions && Array.isArray(backupData.recurringTransactions)) {
        recurringTransactions = backupData.recurringTransactions;
        localStorage.setItem('recurringTransactions', JSON.stringify(recurringTransactions));
    }
    
    // 3. Atualizar metas financeiras
    if (backupData.financialGoals && Array.isArray(backupData.financialGoals)) {
        financialGoals = backupData.financialGoals;
        localStorage.setItem('financialGoals', JSON.stringify(financialGoals));
    }
    
    // 4. Atualizar configurações de notificação
    if (backupData.notificationSettings) {
        localStorage.setItem('notificationSettings', JSON.stringify(backupData.notificationSettings));
    }
    
    // 5. Recarregar interface
    setTimeout(function() {
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderRecurringTransactions === 'function') renderRecurringTransactions();
        if (typeof renderFinancialGoals === 'function') renderFinancialGoals();
        if (typeof loadNotificationSettings === 'function') loadNotificationSettings();
        
        showBackupAlert('Dados restaurados com sucesso! Recarregando...', 'success');
        
        // Recarregar após 2 segundos
        setTimeout(function() {
            location.reload();
        }, 2000);
    }, 500);
}

/**
 * Baixa backup localmente
 */
async function downloadBackupLocally(fileId, fileName) {
    try {
        var token = backupState.token;
        
        var downloadUrl = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media';
        var response = await fetch(downloadUrl, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) throw new Error('Erro ao baixar');
        
        var backupData = await response.json();
        var dataStr = JSON.stringify(backupData, null, 2);
        var blob = new Blob([dataStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        
        var link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'backup_financeiro_gg.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        showBackupAlert('✅ Backup baixado!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao baixar:', error);
        showBackupAlert('Erro ao baixar: ' + error.message, 'error');
    }
}

// ============================================
// 4. INTERFACE DO BACKUP
// ============================================

/**
 * Inicializa a interface do backup
 */
function initBackupUI() {
    // Adicionar estilos CSS
    addBackupStyles();
    
    // Configurar eventos
    setupBackupEvents();
    
    // Atualizar UI inicial
    updateBackupUI();
}

/**
 * Adiciona estilos CSS para o backup
 */
function addBackupStyles() {
    var style = document.createElement('style');
    style.id = 'backup-styles';
    style.textContent = `
        /* Toggle do backup */
        .backup-toggle {
            position: relative;
            margin-right: 15px;
            cursor: pointer;
        }
        
        .backup-icon {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #4285F4, #34A853);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        }
        
        .backup-icon:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }
        
        /* Container do backup */
        .backup-container {
            display: none;
            position: absolute;
            top: 50px;
            right: 0;
            width: 350px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            z-index: 1000;
            padding: 20px;
        }
        
        .backup-container.show {
            display: block;
        }
        
        .backup-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }
        
        .backup-header h3 {
            margin: 0;
            font-size: 16px;
            color: #2c3e50;
        }
        
        .backup-status {
            display: flex;
            align-items: center;
            font-size: 12px;
            color: #7f8c8d;
        }
        
        .backup-status i {
            margin-right: 5px;
        }
        
        /* Botões */
        .btn-backup-login, .btn-backup-create, .btn-backup-logout {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 10px;
        }
        
        .btn-backup-login {
            background: linear-gradient(135deg, #4285F4, #34A853);
            color: white;
        }
        
        .btn-backup-create {
            background: #3498db;
            color: white;
        }
        
        .btn-backup-logout {
            background: #e74c3c;
            color: white;
        }
        
        .btn-backup-login:hover, .btn-backup-create:hover, .btn-backup-logout:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }
        
        .backup-input-group {
            display: flex;
            gap: 10px;
            margin: 15px 0;
        }
        
        .backup-input-group input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }
        
        /* Lista de backups */
        .backup-list-container {
            margin: 20px 0;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .backup-list-container h4 {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: #2c3e50;
        }
        
        .backup-empty {
            text-align: center;
            padding: 30px;
            color: #95a5a6;
        }
        
        .backup-empty i {
            font-size: 40px;
            margin-bottom: 10px;
        }
        
        .backup-item {
            background: #f8f9fa;
            border-radius: 5px;
            padding: 12px;
            margin-bottom: 8px;
            border: 1px solid #e9ecef;
        }
        
        .backup-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
        }
        
        .backup-item-name {
            font-weight: 600;
            color: #2c3e50;
            font-size: 14px;
        }
        
        .backup-item-date {
            font-size: 11px;
            color: #7f8c8d;
        }
        
        .backup-item-actions {
            display: flex;
            gap: 5px;
            margin-top: 8px;
        }
        
        .btn-backup-restore, .btn-backup-download {
            flex: 1;
            padding: 6px 10px;
            border: none;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
        }
        
        .btn-backup-restore {
            background: #27ae60;
            color: white;
        }
        
        .btn-backup-download {
            background: #3498db;
            color: white;
        }
        
        /* Alertas */
        .backup-alert {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            max-width: 350px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        
        .backup-alert.success {
            background: #27ae60;
        }
        
        .backup-alert.error {
            background: #e74c3c;
        }
        
        .backup-alert.info {
            background: #3498db;
        }
        
        .backup-alert.warning {
            background: #f39c12;
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * Configura eventos do backup
 */
function setupBackupEvents() {
    const backupToggle = document.getElementById('backup-toggle');
    const backupContainer = document.getElementById('backup-container');
    const backupLoginBtn = document.getElementById('backup-login-btn');
    const backupCreateBtn = document.getElementById('backup-create-btn');
    const backupLogoutBtn = document.getElementById('backup-logout-btn');
    
    if (!backupToggle || !backupContainer) return;
    
    // Toggle do container
    backupToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        backupContainer.classList.toggle('show');
    });
    
    // Fechar ao clicar fora
    document.addEventListener('click', function(e) {
        if (!backupContainer.contains(e.target) && 
            e.target !== backupToggle && 
            !backupToggle.contains(e.target)) {
            backupContainer.classList.remove('show');
        }
    });
    
    // Login
    if (backupLoginBtn) {
        backupLoginBtn.addEventListener('click', async function() {
            await signInToDrive();
        });
    }
    
    // Criar backup
    if (backupCreateBtn) {
        backupCreateBtn.addEventListener('click', async function() {
            const description = document.getElementById('backup-description')?.value || '';
            await createSimpleBackup(description);
            if (document.getElementById('backup-description')) {
                document.getElementById('backup-description').value = '';
            }
        });
    }
    
    // Logout
    if (backupLogoutBtn) {
        backupLogoutBtn.addEventListener('click', function() {
            signOutFromDrive();
        });
    }
}

/**
 * Atualiza a UI do backup
 */
function updateBackupUI() {
    const backupStatus = document.getElementById('backup-status');
    const backupLoginActions = document.getElementById('backup-logged-actions');
    const backupLoginBtn = document.getElementById('backup-login-btn');
    
    if (backupStatus) {
        if (backupState.signedIn) {
            backupStatus.innerHTML = '<i class="fas fa-circle" style="color: #27ae60;"></i><span>Conectado</span>';
        } else {
            backupStatus.innerHTML = '<i class="fas fa-circle" style="color: #e74c3c;"></i><span>Desconectado</span>';
        }
    }
    
    if (backupLoginActions) {
        backupLoginActions.style.display = backupState.signedIn ? 'block' : 'none';
    }
    
    if (backupLoginBtn) {
        backupLoginBtn.style.display = backupState.signedIn ? 'none' : 'block';
    }
}

/**
 * Atualiza lista de backups na UI
 */
function updateBackupListUI() {
    const backupList = document.getElementById('backup-list');
    if (!backupList) return;
    
    if (!backupState.signedIn || backupState.backups.length === 0) {
        backupList.innerHTML = `
            <div class="backup-empty">
                <i class="fas fa-inbox"></i>
                <p>${backupState.signedIn ? 'Nenhum backup encontrado' : 'Conecte-se para ver backups'}</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    backupState.backups.forEach(function(backup) {
        const name = backup.name.replace('.json', '').replace(/Financeiro_GG_/g, '').replace(/_/g, ' ');
        const sizeKB = backup.size ? Math.round(backup.size / 1024) : 0;
        
        html += `
            <div class="backup-item">
                <div class="backup-item-header">
                    <div class="backup-item-name">${name}</div>
                    <div class="backup-item-date">${backup.formattedDate}</div>
                </div>
                <div>${sizeKB} KB</div>
                <div class="backup-item-actions">
                    <button class="btn-backup-restore" data-id="${backup.id}">
                        <i class="fas fa-download"></i> Restaurar
                    </button>
                    <button class="btn-backup-download" data-id="${backup.id}" data-name="${backup.name}">
                        <i class="fas fa-file-download"></i> Baixar
                    </button>
                </div>
            </div>
        `;
    });
    
    backupList.innerHTML = html;
    
    // Event listeners para os botões
    setTimeout(function() {
        // Restaurar backup
        backupList.querySelectorAll('.btn-backup-restore').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                const fileId = this.getAttribute('data-id');
                await restoreBackup(fileId);
            });
        });
        
        // Baixar backup
        backupList.querySelectorAll('.btn-backup-download').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                const fileId = this.getAttribute('data-id');
                const fileName = this.getAttribute('data-name');
                await downloadBackupLocally(fileId, fileName);
            });
        });
    }, 100);
}

// ============================================
// 5. UTILITÁRIOS
// ============================================

/**
 * Mostra alerta
 */
function showBackupAlert(message, type) {
    // Remover alertas antigos
    document.querySelectorAll('.backup-alert').forEach(function(el) {
        el.remove();
    });
    
    // Criar alerta
    const alertDiv = document.createElement('div');
    alertDiv.className = `backup-alert ${type}`;
    alertDiv.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 
                          type === 'error' ? 'exclamation-triangle' : 
                          type === 'warning' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;
    
    document.body.appendChild(alertDiv);
    
    // Remover após 4 segundos
    setTimeout(function() {
        if (alertDiv.parentNode) {
            alertDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(function() {
                if (alertDiv.parentNode) {
                    alertDiv.parentNode.removeChild(alertDiv);
                }
            }, 300);
        }
    }, 4000);
}

// ============================================
// 6. INICIALIZAÇÃO E INTEGRAÇÃO
// ============================================

/**
 * Inicializa o sistema de backup
 */
function initSimpleBackup() {
    console.log('🚀 Iniciando sistema de backup para Controle Financeiro GG...');
    
    // Verificar token na URL (para redirect)
    checkTokenFromURL();
    
    // Tentar login automático
    tryAutoLogin();
    
    // Inicializar UI
    setTimeout(initBackupUI, 1000);
    
    // Configurar backup automático após salvar transações
    setupAutoBackup();
    
    console.log('✅ Sistema de backup pronto');
}

/**
 * Configura backup automático
 */
function setupAutoBackup() {
    // Backup automático após salvar transações
    if (typeof saveTransactions === 'function') {
        const originalSaveTransactions = saveTransactions;
        
        saveTransactions = function() {
            const result = originalSaveTransactions.apply(this, arguments);
            
            // Backup automático (apenas se estiver logado e não houver backup recente)
            if (backupState.signedIn) {
                const lastBackup = localStorage.getItem('last_auto_backup_financeiro');
                const now = Date.now();
                
                // Fazer backup automático apenas uma vez por hora
                if (!lastBackup || (now - parseInt(lastBackup)) > 3600000) {
                    setTimeout(function() {
                        createSimpleBackup('auto_backup');
                        localStorage.setItem('last_auto_backup_financeiro', now.toString());
                    }, 2000);
                }
            }
            
            return result;
        };
    }
}

// ============================================
// 7. INICIALIZAÇÃO AUTOMÁTICA
// ============================================

// Inicializar quando a página carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initSimpleBackup();
    });
} else {
    initSimpleBackup();
}

// ============================================
// 8. API PÚBLICA
// ============================================

window.FinanceBackup = {
    login: signInToDrive,
    logout: signOutFromDrive,
    createBackup: createSimpleBackup,
    restoreBackup: restoreBackup,
    isConnected: function() { return backupState.signedIn; },
    setClientId: function(clientId) { GOOGLE_CLIENT_ID = clientId; }
};

console.log('✅ Sistema de backup para Controle Financeiro GG carregado');
