// GitHub Storage - глобальное хранение данных!
console.log('Используем GitHub Storage для глобального хранения');
const firebaseAvailable = false;
console.log('Firebase отключен - используем GitHub API');

// Проверяем что скрипт загружен
console.log('Скрипт script.js загружен успешно!');

// Облачная/локальная БД, мульти-медиа и авто-ресайз изображений
let currentUser = null;
let isAdmin = false;

// Система реального времени
let syncInterval = null;
let lastSyncTime = 0;
let isOnline = navigator.onLine;
let syncInProgress = false;

// Глобальные переменные для накопления файлов
let accumulatedPhotos = [];
let accumulatedVideos = [];

// Утилиты изображений: ресайз под карточки (макс ширина x высота)
async function resizeImage(file, maxW = 1200, maxH = 1200, mime = 'image/jpeg', quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = e => {
            img.onload = () => {
                let { width, height } = img;
                const ratio = Math.min(maxW / width, maxH / height, 1);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(width * ratio);
                canvas.height = Math.round(height * ratio);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => {
                    resolve(blob);
                }, mime, quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Унифицированный стор с GitHub Storage
class Store {
    constructor() {
        // GitHub Storage для глобального хранения!
        this.useCloud = true;
        this.local = new LocalStore();
        this.github = new GitHubStorage();
        this.cloud = null; // Не используем Firebase
    }
    _useGitHub() { return this.useCloud && this.github && typeof GitHubStorage !== 'undefined'; } // Используем GitHub только если настроен
    async getUsers() { 
        if (this._useGitHub()) {
            const data = await this.github.loadData();
            return data.users || {};
        }
        return await this.local.getUsers(); 
    }
    async saveUsers(users) { 
        if (this._useGitHub()) {
            const data = await this.github.loadData();
            data.users = users;
            await this.github.saveData(data);
            return;
        }
        return await this.local.saveUsers(users); 
    }
    async getPets() { 
        if (this._useGitHub()) {
            const data = await this.github.loadData();
            return data.pets || [];
        }
        return await this.local.getPets(); 
    }
    async savePets(pets) { 
        if (this._useGitHub()) {
            const data = await this.github.loadData();
            data.pets = pets;
            await this.github.saveData(data);
            return;
        }
        return await this.local.savePets(pets); 
    }
    async uploadFile(path, fileOrBlob) { 
        if (this._useGitHub()) {
            return await this.github.uploadFile(fileOrBlob, path);
        }
        return await this.local.uploadFile(path, fileOrBlob); 
    }
}

// Минимальная заглушка GitHub-хранилища: не используется без настроек
class GitHubStore {
    getConfig() {
        try { return JSON.parse(localStorage.getItem('gh_sync_cfg') || 'null'); } catch(e){ return null; }
    }
    async getUsers(){ const l = new LocalStore(); return await l.getUsers(); }
    async saveUsers(users){ const l = new LocalStore(); return await l.saveUsers(users); }
    async getPets(){ const l = new LocalStore(); return await l.getPets(); }
    async savePets(pets){ const l = new LocalStore(); return await l.savePets(pets); }
    async uploadFile(path, fileOrBlob){ const l = new LocalStore(); return await l.uploadFile(path, fileOrBlob); }
}

class LocalStore {
    async getUsers() {
        const saved = localStorage.getItem('pitomnik_users');
        if (saved) {
            const users = JSON.parse(saved);
            // Убеждаемся что админский аккаунт существует
            if (!users.Admin) {
                users.Admin = { password: 'TatyanaKiseleva1231', role: 'admin', email: 'admin@pitomnik.ru' };
                localStorage.setItem('pitomnik_users', JSON.stringify(users));
                this.createBackup('users', users);
            }
            return users;
        }
        const users = { 'Admin': { password: 'TatyanaKiseleva1231', role: 'admin', email: 'admin@pitomnik.ru' } };
        localStorage.setItem('pitomnik_users', JSON.stringify(users));
        // Создаем резервную копию
        this.createBackup('users', users);
        return users;
    }
    async saveUsers(users) { 
        localStorage.setItem('pitomnik_users', JSON.stringify(users));
        // Создаем резервную копию
        this.createBackup('users', users);
    }
    async getPets() {
        const saved = localStorage.getItem('pitomnik_pets');
        if (saved) return JSON.parse(saved);
        const initial = [];
        localStorage.setItem('pitomnik_pets', JSON.stringify(initial));
        // Создаем резервную копию
        this.createBackup('pets', initial);
        return initial;
    }
    async savePets(pets) { 
        localStorage.setItem('pitomnik_pets', JSON.stringify(pets));
        // Создаем резервную копию
        this.createBackup('pets', pets);
    }
    
    // Создание резервной копии в нескольких местах
    createBackup(type, data) {
        try {
            // 1. Сохраняем в sessionStorage как резерв
            sessionStorage.setItem(`backup_${type}`, JSON.stringify(data));
            
            // 2. Создаем файл для скачивания (автоматически)
            const timestamp = new Date().toISOString().split('T')[0];
            const backupData = {
                type: type,
                data: data,
                timestamp: new Date().toISOString(),
                version: '1.0'
            };
            
            // Сохраняем в localStorage с меткой времени
            localStorage.setItem(`backup_${type}_${timestamp}`, JSON.stringify(backupData));
            
            console.log(`Резервная копия ${type} создана:`, timestamp);
        } catch (error) {
            console.error('Ошибка создания резервной копии:', error);
        }
    }
    
    // Восстановление из резервной копии
    async restoreFromBackup(type) {
        try {
            // Сначала пробуем sessionStorage
            const sessionBackup = sessionStorage.getItem(`backup_${type}`);
            if (sessionBackup) {
                const data = JSON.parse(sessionBackup);
                if (type === 'users') {
                    localStorage.setItem('pitomnik_users', JSON.stringify(data));
                } else if (type === 'pets') {
                    localStorage.setItem('pitomnik_pets', JSON.stringify(data));
                }
                console.log(`Данные ${type} восстановлены из sessionStorage`);
                return data;
            }
            
            // Если нет в sessionStorage, ищем в localStorage
            const keys = Object.keys(localStorage).filter(key => key.startsWith(`backup_${type}_`));
            if (keys.length > 0) {
                // Берем самую свежую резервную копию
                const latestKey = keys.sort().pop();
                const backupData = JSON.parse(localStorage.getItem(latestKey));
                if (type === 'users') {
                    localStorage.setItem('pitomnik_users', JSON.stringify(backupData.data));
                } else if (type === 'pets') {
                    localStorage.setItem('pitomnik_pets', JSON.stringify(backupData.data));
                }
                console.log(`Данные ${type} восстановлены из резервной копии:`, latestKey);
                return backupData.data;
            }
            
            return null;
            } catch (error) {
            console.error('Ошибка восстановления из резервной копии:', error);
        return null;
        }
    }
    async uploadFile(path, fileOrBlob) {
        // Храним как dataURL (локально)
        return new Promise((resolve, reject) => {
            if (fileOrBlob instanceof Blob) {
                const fr = new FileReader();
                fr.onload = e => resolve(e.target.result);
                fr.onerror = reject;
                fr.readAsDataURL(fileOrBlob);
        } else {
                resolve(fileOrBlob);
            }
        });
    }
}

// Простой CloudStore - просто использует LocalStore
class CloudStore {
    constructor() {
        this.local = new LocalStore();
    }
    async getUsers() {
        return await this.local.getUsers();
    }
    async saveUsers(users) { 
        return await this.local.saveUsers(users);
    }
    async getPets() {
        return await this.local.getPets();
    }
    async savePets(pets) {
        return await this.local.savePets(pets);
    }
    async uploadFile(path, fileOrBlob) {
        return await this.local.uploadFile(path, fileOrBlob);
    }
}

class Database {
    constructor(store) { this.store = store; this.users = {}; this.petsData = []; }
    async load() {
        this.users = await this.store.getUsers();
        this.petsData = await this.store.getPets();
        if (!this.petsData.length) { this.petsData = []; await this.store.savePets(this.petsData); }
    }
    async saveUsers() { await this.store.saveUsers(this.users); }
    async savePets() { await this.store.savePets(this.petsData); }
    addUser(username, userData) { this.users[username] = userData; return this.saveUsers(); }
    getUser(username) { return this.users[username]; }
    addPet(petData) {
        const newId = (this.petsData.length ? Math.max(...this.petsData.map(p => p.id)) : 0) + 1;
        const icon = 'fas fa-dog';
        const newPet = { id: newId, ...petData, icon };
        this.petsData.push(newPet); return this.savePets().then(() => newPet);
    }
    updatePet(petId, petData) {
        const idx = this.petsData.findIndex(p => p.id == petId);
        if (idx === -1) return null;
        const merged = { ...this.petsData[idx], ...petData };
        this.petsData[idx] = merged; return this.savePets().then(() => merged);
    }
    deletePet(petId) { this.petsData = this.petsData.filter(p => p.id !== petId); return this.savePets(); }
    getAllPets() { return this.petsData; }
}

class SessionManager {
    constructor() { this.SESSION_KEY = 'pitomnik_session'; this.SESSION_DURATION = 7*24*60*60*1000; }
    saveSession(username, rememberMe=false){
        const data = { username, timestamp: Date.now(), rememberMe };
        (rememberMe ? localStorage : sessionStorage).setItem(this.SESSION_KEY, JSON.stringify(data));
    }
    loadSession(){
        let raw = localStorage.getItem(this.SESSION_KEY);
        if (raw) try { const s = JSON.parse(raw); if (Date.now()-s.timestamp < this.SESSION_DURATION) return s; localStorage.removeItem(this.SESSION_KEY);} catch(e){localStorage.removeItem(this.SESSION_KEY)}
        raw = sessionStorage.getItem(this.SESSION_KEY);
        if (raw) try { return JSON.parse(raw);} catch(e){sessionStorage.removeItem(this.SESSION_KEY)}
        return null;
    }
    clearSession(){ localStorage.removeItem(this.SESSION_KEY); sessionStorage.removeItem(this.SESSION_KEY); }
    isSessionActive(){ const s=this.loadSession(); return !!s && (Date.now()-s.timestamp < this.SESSION_DURATION); }
}

const store = new Store();
const db = new Database(store);
const sessionManager = new SessionManager();

// Система синхронизации в реальном времени
class RealtimeSync {
    constructor() {
        this.syncInterval = null;
        this.lastDataHash = null;
        this.isOnline = navigator.onLine;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Отслеживаем изменения в сети
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showNotification('🌐 Подключение восстановлено', 'success');
            this.startSync();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showNotification('📡 Нет подключения к интернету', 'warning');
            this.stopSync();
        });

        // Синхронизация при фокусе на окне
        window.addEventListener('focus', () => {
            if (this.isOnline) {
                this.syncData();
            }
        });

        // Синхронизация при видимости страницы
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.syncData();
            }
        });
    }

    startSync() {
        if (this.syncInterval) return;
        
        console.log('🔄 Запуск синхронизации в реальном времени...');
        this.syncInterval = setInterval(() => {
            if (this.isOnline && !syncInProgress) {
                this.syncData();
            }
        }, 30000); // Синхронизация каждые 30 секунд

        // Первая синхронизация сразу
        this.syncData();
    }

    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('⏹️ Синхронизация остановлена');
        }
    }

    async syncData() {
        if (syncInProgress || !this.isOnline) return;
        
        syncInProgress = true;
        console.log('🔄 Синхронизация данных...');
        
        try {
            // Загружаем данные с GitHub
            const cloudData = await store.github.loadData();
            const currentData = {
                users: db.users,
                pets: db.petsData
            };

            // Вычисляем хеш данных для сравнения
            const currentHash = this.getDataHash(currentData);
            const cloudHash = this.getDataHash(cloudData);

            // Если данные изменились
            if (currentHash !== cloudHash && cloudHash !== this.lastDataHash) {
                console.log('📥 Обнаружены новые данные, обновляем...');
                
                // Обновляем локальные данные
                if (cloudData.users) {
                    db.users = cloudData.users;
                }
                if (cloudData.pets) {
                    db.petsData = cloudData.pets;
                }

                // Обновляем интерфейс
                updateUserInterface();
                loadPets();
                
                this.lastDataHash = cloudHash;
                this.showNotification('🔄 Данные обновлены', 'info');
            }

            // Если у нас есть локальные изменения, отправляем их
            if (currentHash !== cloudHash && currentHash !== this.lastDataHash) {
                console.log('📤 Отправляем локальные изменения...');
                await store.github.saveData(currentData);
                this.lastDataHash = currentHash;
                this.showNotification('💾 Изменения сохранены', 'success');
            }

            lastSyncTime = Date.now();
            this.updateSyncStatus(true);

            } catch (error) {
            console.error('❌ Ошибка синхронизации:', error);
            this.updateSyncStatus(false);
            this.showNotification('❌ Ошибка синхронизации', 'error');
        } finally {
            syncInProgress = false;
        }
    }

    getDataHash(data) {
        try {
            // Используем encodeURIComponent для корректной обработки русских символов
            const jsonString = JSON.stringify(data);
            const encodedString = encodeURIComponent(jsonString);
            return btoa(encodedString).slice(0, 16);
            } catch (error) {
            console.warn('Ошибка создания хеша данных:', error);
            // Fallback: используем простой хеш на основе длины
            return JSON.stringify(data).length.toString().padStart(16, '0');
        }
    }

    updateSyncStatus(success) {
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) {
            statusEl.innerHTML = success ? 
                `🟢 Синхронизировано ${new Date().toLocaleTimeString()}` :
                `🔴 Ошибка синхронизации ${new Date().toLocaleTimeString()}`;
        }
    }

    showNotification(message, type = 'info') {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        // Удаляем через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Принудительная синхронизация
    async forceSync() {
        console.log('🔄 Принудительная синхронизация...');
        await this.syncData();
    }
}

// Функция для принудительного сброса админского аккаунта
function resetAdminAccount() {
    console.log('🔄 Принудительный сброс админского аккаунта...');
    
    // Очищаем localStorage
    localStorage.removeItem('pitomnik_users');
    localStorage.removeItem('pitomnik_pets');
    
    // Очищаем sessionStorage
    sessionStorage.clear();
    
    // Перезагружаем страницу
    alert('Админский аккаунт сброшен. Страница будет перезагружена.');
    location.reload();
}

// Добавляем функцию в глобальную область видимости для отладки
window.resetAdminAccount = resetAdminAccount;

// Функция для проверки статуса GitHub Storage
function checkGitHubStatus() {
    console.log('=== ПРОВЕРКА GITHUB STORAGE ===');
    console.log('Токен установлен:', !!localStorage.getItem('github_token'));
    console.log('GitHub Storage доступен:', typeof GitHubStorage !== 'undefined');
    console.log('Используем GitHub:', store._useGitHub());
    console.log('Текущие данные:', { users: db.users, pets: db.petsData });
    
    // Проверяем GitHub API
    if (store.github && store.github.token) {
        fetch(`https://api.github.com/repos/ivannikonorov45-dev/Nasledie_Cristaliz/contents/data.json`, {
            headers: {
                'Authorization': `token ${store.github.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        })
        .then(response => {
            console.log('GitHub API ответ:', response.status, response.statusText);
            if (response.ok) {
                return response.json();
                } else {
                throw new Error(`GitHub API error: ${response.status}`);
            }
        })
        .then(data => {
            console.log('Файл data.json на GitHub:', data);
        })
        .catch(error => {
            console.error('Ошибка проверки GitHub:', error);
        });
    }
}

// Добавляем функцию в глобальную область видимости
window.checkGitHubStatus = checkGitHubStatus;

// Создаем экземпляр системы синхронизации
const realtimeSync = new RealtimeSync();

// ПРОСТАЯ ПРОВЕРКА: Скрипт загружен
console.log('=== SCRIPT.JS ЗАГРУЖЕН ===');
console.log('Время:', new Date().toISOString());

document.addEventListener('DOMContentLoaded', async function(){
    console.log('=== DOMContentLoaded СРАБОТАЛ ===');
    try {
        console.log('=== ИНИЦИАЛИЗАЦИЯ САЙТА ===');
        console.log('Скрипт загружен, версия:', new Date().toISOString());
        
    // GitHub Storage - глобальное хранение данных!
    console.log('Используем GitHub Storage - данные сохраняются глобально');
    store.useCloud = true; // Включаем GitHub Storage с исправленной кодировкой
    
    // Настраиваем GitHub Storage с fallback
    if (store.github && typeof GitHubStorage !== 'undefined') {
        console.log('GitHub Storage настроен');
        // Тестируем GitHub Storage
        try {
            await store.github.loadData();
            console.log('GitHub Storage работает корректно');
            } catch (error) {
            console.error('GitHub Storage не работает:', error);
            console.log('Переключаемся на локальное хранение');
            store.useCloud = false;
            // Принудительно отключаем GitHub Storage
            store._useGitHub = function() { return false; };
        }
    } else {
        console.log('GitHub Storage не найден, используем локальное хранение');
        store.useCloud = false;
        store._useGitHub = function() { return false; };
    }

    // Загружаем данные с восстановлением из резервных копий
    console.log('Загружаем данные...');
    await db.load();
    console.log('Данные загружены. Пользователей:', Object.keys(db.users || {}).length, 'Питомцев:', db.petsData.length);
    
    // Проверяем и восстанавливаем данные из резервных копий
    await restoreDataIfNeeded();
    
    // Принудительно создаем/обновляем админский аккаунт
    console.log('=== ПРОВЕРКА АДМИНСКОГО АККАУНТА ===');
    console.log('db.users существует:', !!db.users);
    console.log('db.users.Admin существует:', !!(db.users && db.users.Admin));
    console.log('Используем GitHub Storage:', store._useGitHub());
    
    // Принудительно создаем админский аккаунт
    console.log('Принудительно создаем/обновляем админский аккаунт...');
    db.users = db.users || {};
    db.users.Admin = { 
        password: 'TatyanaKiseleva1231', 
        role: 'admin', 
        email: 'admin@pitomnik.ru' 
    };
    
    try {
        await db.saveUsers();
        console.log('✅ Админский аккаунт успешно создан/обновлен');
    } catch (error) {
        console.error('❌ Ошибка сохранения админского аккаунта:', error);
        // Сохраняем локально в любом случае
        localStorage.setItem('pitomnik_users', JSON.stringify(db.users));
        console.log('✅ Админский аккаунт сохранен локально');
    }
    
    console.log('=== ФИНАЛЬНАЯ ПРОВЕРКА ===');
    console.log('Все пользователи:', db.users);
    console.log('Админский аккаунт:', db.users.Admin);
    console.log('Ключи пользователей:', Object.keys(db.users));
    
    console.log('Настраиваем интерфейс...');
    checkSavedSession();
    setupAuth();
    loadPets();
    setupFilters();
    setupMobileMenu();
    setupSmoothScrolling();
    setupForm();
    setupModals();
    setupAdminFunctions();
    if (window.emailjs && emailjs.init) { try { emailjs.init('public_demo_key'); } catch(e){} }
    
    // Запускаем синхронизацию в реальном времени
    console.log('Запускаем синхронизацию в реальном времени...');
    realtimeSync.startSync();
    
    console.log('=== ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА ===');
    } catch (error) {
        console.error('ОШИБКА ИНИЦИАЛИЗАЦИИ:', error);
        alert('Ошибка загрузки сайта: ' + error.message);
    }
});

// Функция восстановления данных из резервных копий
async function restoreDataIfNeeded() {
    try {
        // Проверяем, есть ли основные данные
        const hasUsers = localStorage.getItem('pitomnik_users');
        const hasPets = localStorage.getItem('pitomnik_pets');
        
        // Если данных нет, пытаемся восстановить из резервных копий
        if (!hasUsers || !hasPets) {
            console.log('Основные данные отсутствуют, пытаемся восстановить из резервных копий...');
            
            if (!hasUsers) {
                const restoredUsers = await store.local.restoreFromBackup('users');
                if (restoredUsers) {
                    db.users = restoredUsers;
                    console.log('Пользователи восстановлены из резервной копии');
                }
            }
            
            if (!hasPets) {
                const restoredPets = await store.local.restoreFromBackup('pets');
                if (restoredPets) {
                    db.petsData = restoredPets;
                    console.log('Питомцы восстановлены из резервной копии');
                }
            }
            
            // Сохраняем восстановленные данные
            if (db.users || db.petsData) {
                await db.saveUsers();
                await db.savePets();
                console.log('Восстановленные данные сохранены');
            }
        }
    } catch (error) {
        console.error('Ошибка при восстановлении данных:', error);
    }
}

function checkSavedSession(){
    const session = sessionManager.loadSession();
    if (session && sessionManager.isSessionActive()){
        const userKey = Object.keys(db.users||{}).find(u => u.toLowerCase() === session.username.toLowerCase());
        const user = userKey ? db.getUser(userKey) : null;
        if (user){ currentUser = userKey; isAdmin = user.role==='admin'; updateUserInterface(); }
    }
}

function setupAuth(){
    console.log('=== НАСТРОЙКА АВТОРИЗАЦИИ ===');
    
    // ПРОСТАЯ ПРОВЕРКА: Ищем кнопку
    const loginBtn = document.getElementById('loginBtn');
    console.log('Кнопка "Войти" найдена:', !!loginBtn);
    
    if (!loginBtn) {
        console.error('ОШИБКА: Кнопка "Войти" не найдена!');
        console.log('Все элементы с id loginBtn:', document.querySelectorAll('[id*="login"]'));
        return;
    }
    
    // ПРОСТОЕ ДОБАВЛЕНИЕ ОБРАБОТЧИКА
    loginBtn.onclick = function(){ 
        console.log('Кнопка "Войти" нажата!');
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.style.display='block';
            console.log('Модальное окно открыто');
        } else {
            console.error('Модальное окно не найдено!');
        }
    };
    
    console.log('Обработчик кнопки "Войти" добавлен');
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const authForms = document.querySelectorAll('.auth-form');
    tabButtons.forEach(btn=>btn.addEventListener('click',function(){
        const tab=this.getAttribute('data-tab');
        tabButtons.forEach(b=>b.classList.remove('active')); authForms.forEach(f=>f.classList.remove('active'));
        this.classList.add('active'); document.getElementById(tab+'Form').classList.add('active');
    }));

    loginForm.addEventListener('submit', function(e){
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        
        console.log('=== ПОПЫТКА ВХОДА ===');
        console.log('Введенный логин:', username);
        console.log('Введенный пароль:', password);
        console.log('Все пользователи в базе:', db.users);
        
        const userKey = Object.keys(db.users||{}).find(u => u.toLowerCase()===username.toLowerCase());
        const user = userKey ? db.getUser(userKey) : null;
        
        console.log('Найденный ключ пользователя:', userKey);
        console.log('Данные пользователя:', user);
        
        if (user && user.password===password){ 
            currentUser=userKey; 
            isAdmin = user.role==='admin'; 
            sessionManager.saveSession(userKey, rememberMe); 
            updateUserInterface(); 
            document.getElementById('loginModal').style.display='none'; 
            loginForm.reset();
            alert(`Добро пожаловать, ${userKey}! Роль: ${isAdmin?'Администратор':'Гость'}`); 
        } else {
            console.log('Ошибка входа:');
            console.log('- Пользователь найден:', !!user);
            console.log('- Пароль совпадает:', user ? user.password === password : false);
            console.log('- Ожидаемый пароль:', user ? user.password : 'не найден');
            alert('Неверный логин или пароль! Проверьте консоль для подробностей.'); 
        }
    });

    registerForm.addEventListener('submit', async function(e){
        e.preventDefault();
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        const email = document.getElementById('regEmail').value.trim();
        
        // Проверяем длину логина
        if (username.length<3) return alert('Логин должен быть не короче 3 символов');
        
        // Проверяем email
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i; 
        if(!emailRe.test(email)) return alert('Введите корректный Email');
        
        // Проверяем пароль
        const strongPass=/^(?=.*[A-Za-z])(?=.*\d).{6,}$/; 
        if(!strongPass.test(password)) return alert('Пароль должен быть не короче 6 символов и содержать буквы и цифры');
        
        // Проверяем совпадение паролей
        if (password!==confirmPassword) return alert('Пароли не совпадают!');
        
        // Проверяем существование пользователя
        const existsKey = Object.keys(db.users||{}).find(u => u.toLowerCase()===username.toLowerCase()); 
        if (existsKey) return alert('Пользователь с таким логином уже существует!');
        
        // Определяем роль пользователя
        let role = 'guest';
        if (username.toLowerCase() === 'admin') {
            role = 'admin';
        }
        
        // Добавляем пользователя
        await db.addUser(username, { password, role, email });
        alert(`Регистрация успешна! Роль: ${role === 'admin' ? 'Администратор' : 'Гость'}. Теперь вы можете войти в систему.`);
        document.querySelector('[data-tab="login"]').click();
        document.getElementById('loginUsername').value = username;
        registerForm.reset();
    });
    
    logoutBtn.addEventListener('click', function(){ sessionManager.clearSession(); currentUser=null; isAdmin=false; updateUserInterface(); loadPets(); alert('Вы вышли из системы'); });
}

function updateUserInterface(){
    const userInfo = document.getElementById('userInfo');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const addPetBtn = document.getElementById('addPetBtn');
    const addPuppyBtn = document.getElementById('addPuppyBtn');
    const addGraduateBtn = document.getElementById('addGraduateBtn');
    const addMemoryBtn = document.getElementById('addMemoryBtn');
    const addVideoBtn = document.getElementById('addVideoBtn');

    if (currentUser){
        userInfo.textContent = `Привет, ${currentUser}! (${isAdmin?'Админ':'Гость'})`;
        loginBtn.style.display='none'; logoutBtn.style.display='inline-block';
        if (isAdmin){
            addPetBtn.style.display='inline-block';
            if (addPuppyBtn) addPuppyBtn.style.display='inline-block';
            if (addGraduateBtn) addGraduateBtn.style.display='inline-block';
            if (addMemoryBtn) addMemoryBtn.style.display='inline-block';
            if (addVideoBtn) addVideoBtn.style.display='inline-block';
        } else {
            addPetBtn.style.display='none';
            if (addPuppyBtn) addPuppyBtn.style.display='none';
            if (addGraduateBtn) addGraduateBtn.style.display='none';
            if (addMemoryBtn) addMemoryBtn.style.display='none';
            if (addVideoBtn) addVideoBtn.style.display='none';
        }
    } else {
        userInfo.textContent=''; loginBtn.style.display='inline-block'; logoutBtn.style.display='none'; addPetBtn.style.display='none'; if (addPuppyBtn) addPuppyBtn.style.display='none'; if (addGraduateBtn) addGraduateBtn.style.display='none'; if (addMemoryBtn) addMemoryBtn.style.display='none'; if (addVideoBtn) addVideoBtn.style.display='none';
    }
    
    // Показываем статус данных
    showDataStatus();
    loadPets();
}

// Функция показа статуса данных
function showDataStatus() {
    const petsCount = db.getAllPets().length;
    const usersCount = Object.keys(db.users || {}).length;
    const isGitHub = store.useCloud && store.github;
    const syncStatus = isOnline ? '🟢 Онлайн' : '🔴 Офлайн';
    
    // Создаем или обновляем индикатор статуса
    let statusIndicator = document.getElementById('dataStatus');
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.id = 'dataStatus';
        statusIndicator.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 10px;
            font-size: 12px;
            color: #666;
            z-index: 1000;
            max-width: 220px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(statusIndicator);
    }
    
    statusIndicator.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">📊 Статус данных</div>
        <div>🐕 Питомцев: ${petsCount}</div>
        <div>👥 Пользователей: ${usersCount}</div>
        <div>${syncStatus}</div>
        <div id="syncStatus" style="margin-top: 5px; font-size: 10px; color: ${isGitHub ? '#28a745' : '#ffc107'};">
            ${isGitHub ? '🔄 GitHub Sync (все видят)' : '💾 Локально (только этот браузер)'}
        </div>
        <button onclick="realtimeSync.forceSync()" style="margin-top: 5px; padding: 2px 6px; font-size: 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">
            🔄 Синхронизировать
        </button>
    `;
    
    // Скрываем через 10 секунд
    setTimeout(() => {
        if (statusIndicator) {
            statusIndicator.style.opacity = '0.7';
        }
    }, 10000);
}

function setupModals(){
    const loginModal = document.getElementById('loginModal');
    const petModal = document.getElementById('petModal');
    const viewModal = document.getElementById('viewModal');
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(b=>b.addEventListener('click', function(){ loginModal.style.display='none'; petModal.style.display='none'; if(viewModal) viewModal.style.display='none'; }));
    window.addEventListener('click', function(e){ if(e.target===loginModal) loginModal.style.display='none'; if(e.target===petModal) petModal.style.display='none'; if(viewModal && e.target===viewModal) viewModal.style.display='none'; });
    document.getElementById('addPetBtn').addEventListener('click', function(){ if(!isAdmin) return alert('Нет прав'); openPetModal(); });
    const addPuppyBtn=document.getElementById('addPuppyBtn'); const addGraduateBtn=document.getElementById('addGraduateBtn'); const addMemoryBtn=document.getElementById('addMemoryBtn'); const addVideoBtn=document.getElementById('addVideoBtn');
    if (addPuppyBtn) addPuppyBtn.addEventListener('click', function(){ if(!isAdmin) return alert('Нет прав'); openPetModal(); document.getElementById('petStatus').value='puppy'; });
    if (addGraduateBtn) addGraduateBtn.addEventListener('click', function(){ if(!isAdmin) return alert('Нет прав'); openPetModal(); document.getElementById('petStatus').value='graduate'; });
    if (addMemoryBtn) addMemoryBtn.addEventListener('click', function(){ if(!isAdmin) return alert('Нет прав'); openPetModal(); document.getElementById('petStatus').value='memory'; });
    if (addVideoBtn) addVideoBtn.addEventListener('click', function(){ if(!isAdmin) return alert('Нет прав'); openPetModal(); document.getElementById('petStatus').value='memory'; });
    document.getElementById('petForm').addEventListener('submit', function(e){ e.preventDefault(); savePet(); });

    // Предпросмотр множественных фотографий с накоплением
    const photosInput = document.getElementById('petPhotos');
    const videosInput = document.getElementById('petVideos');
    if (photosInput) photosInput.addEventListener('change', function(e){
        const newFiles = Array.from(e.target.files || []);
        accumulatedPhotos = [...accumulatedPhotos, ...newFiles];
        updatePhotoPreview();
        console.log('Накоплено фото:', accumulatedPhotos.length);
    });
    if (videosInput) videosInput.addEventListener('change', function(e){
        const newFiles = Array.from(e.target.files || []);
        accumulatedVideos = [...accumulatedVideos, ...newFiles];
        updateVideoPreview();
        console.log('Накоплено видео:', accumulatedVideos.length);
    });
}

function setupAdminFunctions(){ if (isAdmin) addAdminButtons(); }
function addAdminButtons(){
    const petsHeader = document.querySelector('.pets-header');
    if (petsHeader && !document.getElementById('adminControls')){
        const adminControls = document.createElement('div');
        adminControls.id='adminControls';
        adminControls.innerHTML = `
            <div style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;">
                <button class="btn btn-secondary" onclick="dbExport()"><i class="fas fa-download"></i> Экспорт данных</button>
                <button class="btn btn-secondary" onclick="importData()"><i class="fas fa-upload"></i> Импорт данных</button>
                <button class="btn btn-secondary" onclick="restoreFromBackup()"><i class="fas fa-undo"></i> Восстановить данные</button>
                <button class="btn btn-secondary" onclick="createBackupNow()"><i class="fas fa-save"></i> Создать резервную копию</button>
            </div>
            <input type="file" id="importFile" accept=".json" style="display: none;" onchange="handleImport(this.files[0])">
        `;
        petsHeader.appendChild(adminControls);
    }
}

// Удаляем дублированную функцию setupModals - она уже определена выше

function updatePhotoPreview() {
    const preview = document.getElementById('photoPreview');
    if (preview) {
        preview.innerHTML = '';
        accumulatedPhotos.forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.style.cssText = 'max-width: 120px; max-height: 120px; margin: 5px; border-radius: 8px; border: 2px solid #e74c3c;';
                    img.title = `Фото ${index + 1}: ${file.name}`;
                    preview.appendChild(img);
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

function updateVideoPreview() {
    const preview = document.getElementById('videoPreview');
    if (preview) {
        preview.innerHTML = '';
        accumulatedVideos.forEach((file, index) => {
            if (file.type.startsWith('video/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                    const video = document.createElement('video');
                    video.src = e.target.result;
                    video.style.cssText = 'max-width: 120px; max-height: 80px; margin: 5px; border-radius: 8px; border: 2px solid #e74c3c;';
                    video.title = `Видео ${index + 1}: ${file.name}`;
                    video.controls = true;
                    preview.appendChild(video);
            };
            reader.readAsDataURL(file);
        }
    });
    }
}

function dbExport(){
    const data = { users: db.users, pets: db.getAllPets(), exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`pitomnik_backup_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function importData(){ document.getElementById('importFile').click(); }
function handleImport(file){ if (!file) return; const reader=new FileReader(); reader.onload=async e=>{ try{ const data=JSON.parse(e.target.result); if(data.users && data.pets){ db.users=data.users; db.petsData=data.pets; await db.saveUsers(); await db.savePets(); alert('Данные успешно импортированы!'); location.reload(); } else alert('Неверный формат файла!'); } catch(err){ alert('Ошибка при импорте данных: '+err.message); } }; reader.readAsText(file); }

// Функция ручного восстановления данных
async function restoreFromBackup() {
    if (!confirm('Восстановить данные из резервной копии? Это заменит текущие данные.')) return;
    
    try {
        let restored = false;
        
        // Восстанавливаем пользователей
        const restoredUsers = await store.local.restoreFromBackup('users');
        if (restoredUsers) {
            db.users = restoredUsers;
            await db.saveUsers();
            restored = true;
            console.log('Пользователи восстановлены');
        }
        
        // Восстанавливаем питомцев
        const restoredPets = await store.local.restoreFromBackup('pets');
        if (restoredPets) {
            db.petsData = restoredPets;
            await db.savePets();
            restored = true;
            console.log('Питомцы восстановлены');
        }
        
        if (restored) {
            alert('Данные успешно восстановлены из резервной копии!');
            loadPets();
        } else {
            alert('Резервные копии не найдены.');
        }
    } catch (error) {
        console.error('Ошибка восстановления:', error);
        alert('Ошибка при восстановлении данных: ' + error.message);
    }
}

// Функция создания резервной копии вручную
async function createBackupNow() {
    try {
        // Создаем резервные копии
        store.local.createBackup('users', db.users);
        store.local.createBackup('pets', db.petsData);
        
        // Также создаем файл для скачивания
        const data = { 
            users: db.users, 
            pets: db.getAllPets(), 
            exportDate: new Date().toISOString(),
            type: 'manual_backup'
        };
        const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pitomnik_manual_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('Резервная копия создана и скачана!');
    } catch (error) {
        console.error('Ошибка создания резервной копии:', error);
        alert('Ошибка при создании резервной копии: ' + error.message);
    }
}

function openPetModal(pet=null){
    console.log('=== ОТКРЫТИЕ МОДАЛЬНОГО ОКНА ===');
    console.log('isAdmin:', isAdmin);
    console.log('pet:', pet);
    
    // Очищаем накопленные файлы при открытии модального окна
    accumulatedPhotos = [];
    accumulatedVideos = [];
    console.log('Накопленные файлы очищены');
    
    const modal=document.getElementById('petModal'); 
    const title=document.getElementById('modalTitle'); 
    const form=document.getElementById('petForm');
    
    console.log('Элементы модального окна:', {
        modal: !!modal,
        title: !!title,
        form: !!form
    });
    
    if (pet){
        title.textContent='Редактировать собаку';
        document.getElementById('petId').value=pet.id;
        document.getElementById('petName').value=pet.name;
        document.getElementById('petBreed').value=pet.breed;
        document.getElementById('petAge').value=pet.age;
        document.getElementById('petType').value=pet.type;
        document.getElementById('petGender').value=pet.gender||'male';
        document.getElementById('petStatus').value=pet.status||'breeding';
        document.getElementById('petDescription').value=pet.description;
        
        // Показываем существующие фото
        const photoPreview=document.getElementById('photoPreview'); 
        photoPreview.innerHTML='';
        const images = Array.isArray(pet.photos)?pet.photos: (pet.photo?[pet.photo]:[]);
        images.forEach(src=>{ 
            const img=document.createElement('img'); 
            img.src=src; 
            img.style.cssText='max-width:120px;max-height:120px;margin:5px;border-radius:8px;display:inline-block;vertical-align:top;border:2px solid #e74c3c;';
            photoPreview.appendChild(img); 
        });
        
        // Показываем существующие видео
        const videoPreview=document.getElementById('videoPreview'); 
        videoPreview.innerHTML='';
        const vids = Array.isArray(pet.videos)?pet.videos:(pet.video?[pet.video]:[]);
        vids.forEach(src=>{ 
            const v=document.createElement('video'); 
            v.src=src; 
            v.controls=true; 
            v.style.cssText='max-width:150px;max-height:100px;margin:5px;border-radius:8px;display:inline-block;vertical-align:top;border:2px solid #e74c3c;';
            videoPreview.appendChild(v); 
        });
        } else {
        title.textContent='Добавить собаку'; 
        form.reset();
        document.getElementById('petId').value=''; 
        document.getElementById('photoPreview').innerHTML=''; 
        document.getElementById('videoPreview').innerHTML='';
    }
    modal.style.display='block'; 
    modal.scrollTop=0;
}
function closePetModal(){ 
    console.log('Закрываем модальное окно...');
    const modal = document.getElementById('petModal');
    if (modal) {
        modal.style.display='none';
        console.log('Модальное окно закрыто');
    } else {
        console.error('Модальное окно не найдено!');
    }
}

async function savePet(){
    console.log('=== НАЧАЛО СОХРАНЕНИЯ ПИТОМЦА ===');
    console.log('isAdmin:', isAdmin);
    console.log('currentUser:', currentUser);
    
    if (!isAdmin) {
        console.log('ОШИБКА: Нет прав администратора');
        return alert('У вас нет прав для редактирования питомцев!');
    }
    
    try {
        console.log('Получаем форму...');
    const form = document.getElementById('petForm');
        if (!form) {
            console.error('ОШИБКА: Форма не найдена!');
            return alert('Ошибка: форма не найдена!');
        }
    
        console.log('Создаем FormData...');
        const formData=new FormData(form);
        const petData={ 
        name: formData.get('name'),
        breed: formData.get('breed'),
        age: formData.get('age'),
        type: formData.get('type'),
            gender: formData.get('gender'), 
            status: formData.get('status'), 
        description: formData.get('description')
    };
        console.log('Данные питомца:', petData);
    
    const petId = document.getElementById('petId').value;
        console.log('ID питомца:', petId);

        // Инициализируем массивы фото и видео
        petData.photos = [];
        petData.videos = [];

        // Если редактируем существующего питомца - загружаем старые фото/видео
    if (petId) {
            const existingPet = db.getAllPets().find(p => p.id == petId);
            if (existingPet) {
                petData.photos = [...(existingPet.photos || [])];
                petData.videos = [...(existingPet.videos || [])];
                console.log('Редактирование: загружены существующие фото:', petData.photos.length, 'видео:', petData.videos.length);
            }
        }

        // Добавляем новые фото из накопленных файлов (упрощенная версия)
        if (accumulatedPhotos.length > 0) {
            console.log('Обрабатываем фото:', accumulatedPhotos.length, 'файлов');
            for (let i = 0; i < accumulatedPhotos.length; i++) {
                const file = accumulatedPhotos[i];
                console.log(`Обрабатываем фото ${i+1}/${accumulatedPhotos.length}:`, file.name);
                try {
                    const resized = await resizeImage(file, 1200, 1200, file.type.includes('png')?'image/png':'image/jpeg', 0.85);
                    const extension = (file.type.split('/')[1] || 'jpg').replace(/\s+/g, ''); // Убираем пробелы
                    const path = `pets/images/${Date.now()}_${Math.random().toString(36).slice(2)}_${i}.${extension}`;
                    const url = await store.uploadFile(resized, path);
                    petData.photos.push(url);
                    console.log(`Фото ${i+1} сохранено:`, url);
                } catch (error) {
                    console.warn(`Ошибка загрузки фото ${i+1}:`, error.message);
                    // Пропускаем проблемное фото
                }
            }
        }

        // Добавляем новые видео из накопленных файлов (упрощенная версия)
        if (accumulatedVideos.length > 0) {
            console.log('Обрабатываем видео:', accumulatedVideos.length, 'файлов');
            for (let i = 0; i < accumulatedVideos.length; i++) {
                const file = accumulatedVideos[i];
                console.log(`Обрабатываем видео ${i+1}/${accumulatedVideos.length}:`, file.name);
                try {
                    const extension = file.name.split('.').pop().replace(/\s+/g, ''); // Убираем пробелы
                    const path = `pets/videos/${Date.now()}_${Math.random().toString(36).slice(2)}_${i}.${extension}`;
                    const url = await store.uploadFile(file, path);
                    petData.videos.push(url);
                    console.log(`Видео ${i+1} сохранено:`, url);
                } catch (error) {
                    console.warn(`Ошибка загрузки видео ${i+1}:`, error.message);
                    // Пропускаем проблемное видео
                }
            }
        }

        console.log('Итого фото:', petData.photos.length, 'видео:', petData.videos.length);

        // Сохраняем питомца
        console.log('Сохраняем питомца...');
    if (petId) {
            console.log('Обновляем существующего питомца с ID:', petId);
            const result = await db.updatePet(petId, petData);
            console.log('Результат обновления:', result);
    } else {
            console.log('Добавляем нового питомца');
            const result = await db.addPet(petData);
            console.log('Результат добавления:', result);
        }
        
        console.log('Питомец сохранен в базе данных');
        
        // Очищаем поля файлов после сохранения
        console.log('Очищаем поля формы...');
        document.getElementById('petPhotos').value = '';
        document.getElementById('petVideos').value = '';
        document.getElementById('photoPreview').innerHTML = '';
        document.getElementById('videoPreview').innerHTML = '';
        
        // Очищаем накопленные файлы
        accumulatedPhotos = [];
        accumulatedVideos = [];
        console.log('Поля очищены');
    
        console.log('Обновляем отображение питомцев...');
        loadPets();
        console.log('Закрываем модальное окно...');
        closePetModal();
        console.log('=== СОХРАНЕНИЕ ЗАВЕРШЕНО УСПЕШНО ===');
        
        // Автоматическая синхронизация после сохранения
        console.log('Запускаем синхронизацию после сохранения...');
        setTimeout(async () => {
            try {
                console.log('=== ПРИНУДИТЕЛЬНОЕ СОХРАНЕНИЕ ===');
                console.log('Текущие данные:', { users: db.users, pets: db.petsData });
                
                // Принудительно сохраняем данные
                if (store._useGitHub()) {
                    console.log('Сохраняем в GitHub...');
                    const success = await store.github.saveData({ users: db.users, pets: db.petsData });
                    console.log('Результат сохранения в GitHub:', success);
                } else {
                    console.log('Сохраняем локально...');
                    await db.saveUsers();
                    await db.savePets();
                    console.log('Данные сохранены локально');
                }
                
                // Запускаем синхронизацию
                await realtimeSync.forceSync();
            } catch (error) {
                console.error('Ошибка принудительного сохранения:', error);
            }
        }, 1000);
        
        // Показываем уведомление об успехе
        setTimeout(() => {
            alert('Питомец сохранен и синхронизирован!');
        }, 100);
        
    } catch (error) {
        console.error('=== ОШИБКА ПРИ СОХРАНЕНИИ ПИТОМЦА ===');
        console.error('Тип ошибки:', error.name);
        console.error('Сообщение:', error.message);
        console.error('Стек ошибки:', error.stack);
        alert('Ошибка при сохранении: ' + error.message);
    }
}

async function deletePet(petId){ if(!isAdmin) return alert('Нет прав'); if(!confirm('Удалить питомца?')) return; await db.deletePet(petId); loadPets(); alert('Питомец удален!'); }

function loadPets(){
    console.log('=== ЗАГРУЗКА ПИТОМЦЕВ ===');
    const petsGrid=document.getElementById('petsGrid'); 
    const puppiesGrid=document.getElementById('puppiesGrid'); 
    const graduatesGrid=document.getElementById('graduatesGrid'); 
    const memoryGrid=document.getElementById('memoryGrid'); 
    const videosGrid=document.getElementById('videosGrid');
    
    console.log('Сетки найдены:', {
        petsGrid: !!petsGrid,
        puppiesGrid: !!puppiesGrid,
        graduatesGrid: !!graduatesGrid,
        memoryGrid: !!memoryGrid,
        videosGrid: !!videosGrid
    });
    
    if (petsGrid) petsGrid.innerHTML=''; 
    if (puppiesGrid) puppiesGrid.innerHTML=''; 
    if (graduatesGrid) graduatesGrid.innerHTML=''; 
    if (memoryGrid) memoryGrid.innerHTML=''; 
    if (videosGrid) videosGrid.innerHTML='';
    
    const pets = db.getAllPets();
    console.log('Всего питомцев в базе:', pets.length);
    console.log('Питомцы:', pets);
    
    pets.forEach((pet, index) => {
        console.log(`Обрабатываем питомца ${index + 1}:`, pet);
        const card = createPetCard(pet);
        console.log('Создана карточка для:', pet.name, 'статус:', pet.status);
        
        if (pet.status==='breeding' && petsGrid) {
            petsGrid.appendChild(card.cloneNode(true));
            console.log('Добавлен в petsGrid');
        }
        else if (pet.status==='puppy' && puppiesGrid) {
            puppiesGrid.appendChild(card.cloneNode(true));
            console.log('Добавлен в puppiesGrid');
        }
        else if (pet.status==='graduate' && graduatesGrid) {
            graduatesGrid.appendChild(card.cloneNode(true));
            console.log('Добавлен в graduatesGrid');
        }
        else if (pet.status==='memory' && memoryGrid) {
            memoryGrid.appendChild(card.cloneNode(true));
            console.log('Добавлен в memoryGrid');
        }
    });
    
    // Отдельная загрузка для видео секции - только карточки с видео
    if (videosGrid) {
        pets.forEach(pet => {
            const hasVideo = Array.isArray(pet.videos) ? pet.videos.length > 0 : !!pet.video;
            if (hasVideo) {
                const card = createPetCard(pet);
                videosGrid.appendChild(card);
                console.log('Добавлен в videosGrid:', pet.name);
            }
        });
    }
    
    console.log('=== ЗАГРУЗКА ПИТОМЦЕВ ЗАВЕРШЕНА ===');
}

function createPetCard(pet){
    const card=document.createElement('div'); card.className='pet-card'; card.setAttribute('data-type', pet.type);
    const adminControls = isAdmin ? `
        <div class="admin-controls">
            <button class="admin-btn edit-btn" onclick='openPetModal(${JSON.stringify(pet).replace(/"/g,"&quot;")})' title="Редактировать"><i class="fas fa-edit"></i></button>
            <button class="admin-btn delete-btn" onclick="deletePet(${pet.id})" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>` : '';

    let mediaContent='';
    const firstPhoto = Array.isArray(pet.photos) && pet.photos[0] ? pet.photos[0] : (pet.photo || null);
    const hasVideo = Array.isArray(pet.videos) ? pet.videos.length>0 : !!pet.video;
    if (hasVideo){ const v = Array.isArray(pet.videos)?pet.videos[0]:pet.video; mediaContent = `<video src="${v}" controls></video>`; }
    else if (firstPhoto){ mediaContent = `<img src="${firstPhoto}" alt="${pet.name}">`; }
    else { mediaContent = `<i class="${pet.icon}"></i>`; }

    const genderIcon = pet.gender==='male'?'♂':'♀';
    const statusText = pet.status==='breeding'?'Племенной': pet.status==='puppy'?'Щенок': pet.status==='graduate'?'Выпускник':'Память';
    card.innerHTML = `
        ${adminControls}
        <div class="pet-image">${mediaContent}</div>
        <div class="pet-info">
            <h3 class="pet-name">${pet.name} ${genderIcon}</h3>
            <p class="pet-breed">${pet.breed}</p>
            <p class="pet-status">${statusText}</p>
            <p class="pet-description">${pet.description}</p>
            <div class="pet-contact">
                <span class="pet-age">${pet.age}</span>
                <div>
                    <button class="contact-btn" style="margin-right:8px" onclick="openViewModal(${pet.id})">Подробнее</button>
                    <button class="contact-btn" onclick="contactAboutPet('${pet.name}')">Связаться</button>
            </div>
        </div>
        </div>`;
    return card;
}

function setupFilters(){ const filterButtons=document.querySelectorAll('.filter-btn'); filterButtons.forEach(btn=>btn.addEventListener('click',function(){ filterButtons.forEach(b=>b.classList.remove('active')); this.classList.add('active'); filterPets(this.getAttribute('data-filter')); })); }
function filterPets(filter){ document.querySelectorAll('.pet-card').forEach(card=>{ const t=card.getAttribute('data-type'); card.style.display=(filter==='all'||t===filter)?'block':'none'; }); }
function setupMobileMenu(){ const hamburger=document.querySelector('.hamburger'); const navMenu=document.querySelector('.nav-menu'); if(hamburger&&navMenu){ hamburger.addEventListener('click', function(){ navMenu.classList.toggle('active'); hamburger.classList.toggle('active'); }); } }
function setupSmoothScrolling(){ document.querySelectorAll('.nav-link').forEach(link=>link.addEventListener('click', function(e){ e.preventDefault(); const target=document.querySelector(this.getAttribute('href')); if(target) target.scrollIntoView({behavior:'smooth', block:'start'}); })); }
function setupForm(){ const form=document.querySelector('.contact-form form'); if(form){ form.addEventListener('submit', function(e){ e.preventDefault(); const nameInput=this.querySelector('input[type="text"]'); const emailInput=this.querySelector('input[type="email"]'); const phoneInput=this.querySelector('input[type="tel"]'); const messageInput=this.querySelector('textarea'); const name=nameInput.value.trim(); const email=emailInput.value.trim(); const phone=phoneInput.value.trim(); const message=messageInput.value.trim(); [nameInput,emailInput,phoneInput,messageInput].forEach(inp=>{ const g=inp.closest('.form-group'); if(g){ g.classList.remove('invalid'); const err=g.querySelector('.error-text'); if(err) err.remove(); }}); let hasError=false; if(name.length<2){ showError(nameInput,'Введите имя (минимум 2 символа)'); hasError=true;} const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i; if(!emailRe.test(email)){ showError(emailInput,'Введите корректный email'); hasError=true;} const phoneRe=/(\+7|8)?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/; if(phone && !phoneRe.test(phone)){ showError(phoneInput,'Введите телефон в формате +7XXXXXXXXXX или 8XXXXXXXXXX'); hasError=true;} if(message.length<5){ showError(messageInput,'Сообщение слишком короткое'); hasError=true;} if(hasError) return; const templateParams={ to_email:'tatyana02_76@mail.ru', from_name:name, from_email:email, phone, message }; const onSuccess=()=>{ alert('Спасибо! Сообщение отправлено.'); form.reset(); }; const onFail=()=>{ const subject=encodeURIComponent('Сообщение с сайта питомника'); const body=encodeURIComponent(`Имя: ${name}\nEmail: ${email}\nТелефон: ${phone}\n\nСообщение:\n${message}`); window.location.href=`mailto:tatyana02_76@mail.ru?subject=${subject}&body=${body}`; alert('Открыт почтовый клиент для отправки письма.'); form.reset(); }; if(window.emailjs && emailjs.send){ emailjs.send('service_default','template_default',templateParams).then(onSuccess).catch(onFail); } else onFail(); }); } }
function showError(inputEl,text){ const group=inputEl.closest('.form-group'); if(!group) return; group.classList.add('invalid'); const span=document.createElement('div'); span.className='error-text'; span.textContent=text; group.appendChild(span); }
function contactAboutPet(petName){ alert(`Спасибо за интерес к ${petName}! Связь: 8 905 899-37-67 — Татьяна, email: tatyana02_76@mail.ru. Россия, Оренбургская обл., г. Орск.`); }
window.addEventListener('scroll', function(){ const navbar=document.querySelector('.navbar'); if(window.scrollY>100){ navbar.style.background='rgba(255, 255, 255, 0.95)'; navbar.style.backdropFilter='blur(10px)'; } else { navbar.style.background='#fff'; navbar.style.backdropFilter='none'; } });

function openViewModal(petId){ 
    const pet = db.getAllPets().find(p=>p.id===petId); 
    if(!pet) return; 
    const viewModal=document.getElementById('viewModal'); 
    const viewContent=document.getElementById('viewContent'); 
    const genderIcon = pet.gender==='male'?'♂':'♀'; 
    const statusText = pet.status==='breeding'?'Племенной': pet.status==='puppy'?'Щенок': pet.status==='graduate'?'Выпускник':'Память'; 
    const firstPhoto = Array.isArray(pet.photos)&&pet.photos[0]?pet.photos[0]:(pet.photo||null); 
    const hasVideo = Array.isArray(pet.videos)?pet.videos.length>0:!!pet.video; 
    const primaryMedia = hasVideo ? (Array.isArray(pet.videos)?pet.videos[0]:pet.video) : firstPhoto; 
    const mediaHtml = hasVideo ? `<video src="${primaryMedia}" controls></video>` : (primaryMedia?`<img src="${primaryMedia}" alt="${pet.name}">`:`<i class="${pet.icon}"></i>`);
    
    // Галерея миниатюр с горизонтальным скроллом
    let thumbs = '';
    const allImages = Array.isArray(pet.photos)?pet.photos:[];
    const allVideos = Array.isArray(pet.videos)?pet.videos:[];
    const thumbItems = [ ...allImages.map(src=>({type:'img',src})), ...allVideos.map(src=>({type:'video',src})) ];
    
    // Показываем галерею если есть больше одного медиа
    if (thumbItems.length > 1){
        thumbs = `
            <div style="margin-top:15px;">
                <h4 style="margin-bottom:10px; color:#666;">Галерея (${thumbItems.length} файлов):</h4>
                <div style="display:flex;gap:8px;overflow-x:auto;padding:10px;background:#f9f9f9;border-radius:8px;border:1px solid #e0e0e0;">
                    ${thumbItems.map((it, index)=> 
                        it.type==='img' ? 
                            `<img src="${it.src}" style="width:80px;height:80px;object-fit:cover;cursor:pointer;border-radius:8px;flex-shrink:0;border:2px solid transparent;" onclick="swapPrimaryMedia('${pet.id}','${it.src}','img')" title="Фото ${index+1}" onmouseover="this.style.border='2px solid #e74c3c'" onmouseout="this.style.border='2px solid transparent'">` : 
                            `<video src="${it.src}" style="width:100px;height:70px;object-fit:cover;cursor:pointer;border-radius:8px;flex-shrink:0;border:2px solid transparent;" onclick="swapPrimaryMedia('${pet.id}','${it.src}','video')" title="Видео ${index+1}" onmouseover="this.style.border='2px solid #e74c3c'" onmouseout="this.style.border='2px solid transparent'"></video>`
                    ).join('')}
                </div>
            </div>`;
    }
    
    viewContent.innerHTML = `
        <div class="view-grid">
            <div class="view-image" id="viewPrimaryMedia">${mediaHtml}</div>
            <div class="view-info">
                <h3>${pet.name} ${genderIcon}</h3>
                <div class="view-row"><strong>Порода:</strong> ${pet.breed}</div>
                <div class="view-row"><strong>Статус:</strong> ${statusText}</div>
                <div class="view-row"><strong>Возраст:</strong> ${pet.age}</div>
                <div class="view-row"><strong>Описание:</strong> ${pet.description}</div>
                <div class="view-row"><strong>Контакты:</strong> 8 905 899-37-67 — Татьяна, tatyana02_76@mail.ru</div>
                <button class="contact-btn" onclick="contactAboutPet('${pet.name}')">Связаться</button>
                ${thumbs}
            </div>
        </div>`;
    viewModal.style.display='block';
}
function swapPrimaryMedia(petId, src, type){ const el=document.getElementById('viewPrimaryMedia'); if(!el) return; el.innerHTML = type==='video' ? `<video src="${src}" controls></video>` : `<img src="${src}" alt="">`; }
