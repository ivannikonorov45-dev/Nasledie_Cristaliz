// GitHub Storage - глобальное хранение данных!
console.log('Используем GitHub Storage для глобального хранения');
const firebaseAvailable = false;
console.log('Firebase отключен - используем GitHub API');

// Проверяем что скрипт загружен
console.log('Скрипт script-responsive-2025.js загружен успешно!');

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
        this.useCloud = false;
        this.github = null;
        this.local = new LocalStorage();
        
        // Инициализируем GitHub Storage если доступен
        if (typeof GitHubStorage !== 'undefined') {
            this.github = new GitHubStorage();
            this.useCloud = true;
        }
    }
    
    _useGitHub() {
        // Используем GitHub для чтения данных всегда (даже без токена)
        // Токен нужен только для записи
        return this.useCloud && this.github;
    }
    
    _canWriteToGitHub() {
        // Проверяем, можем ли мы писать в GitHub (нужен токен)
        return this.useCloud && this.github && this.github.token;
    }
    
    async saveData(data) {
        if (this._canWriteToGitHub()) {
            return await this.github.saveData(data);
        }
        return await this.local.saveData(data);
    }
    
    async loadData() {
        if (this._useGitHub()) {
            return await this.github.loadData();
        }
        return await this.local.loadData();
    }
    
    async uploadFile(fileOrBlob, path) { 
        if (this._canWriteToGitHub()) {
            return await this.github.uploadFile(fileOrBlob, path);
        }
        return await this.local.uploadFile(path, fileOrBlob); 
    }
}

// Локальное хранилище
class LocalStorage {
    async saveData(data) {
        try {
            localStorage.setItem('pitomnik_data', JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Ошибка сохранения в localStorage:', error);
            return false;
        }
    }
    
    async loadData() {
        try {
            const data = localStorage.getItem('pitomnik_data');
            return data ? JSON.parse(data) : { users: {}, pets: [] };
        } catch (error) {
            console.error('Ошибка загрузки из localStorage:', error);
            return { users: {}, pets: [] };
        }
    }
    
    async uploadFile(path, fileOrBlob) {
        // Для локального хранилища возвращаем base64
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(fileOrBlob);
        });
    }
}

// Система синхронизации в реальном времени
class RealtimeSync {
    constructor() {
        this.interval = null;
        this.isRunning = false;
    }
    
    startSync() {
        if (this.isRunning) return;
        
        console.log('🔄 Запуск синхронизации в реальном времени...');
        this.isRunning = true;
        
        // Синхронизация каждые 30 секунд
        this.interval = setInterval(() => {
            this.syncData();
        }, 30000);
        
        // Первая синхронизация
        this.syncData();
    }
    
    stopSync() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log('🔄 Синхронизация остановлена');
    }
    
    async syncData() {
        if (syncInProgress) return;
        
        syncInProgress = true;
        console.log('🔄 Синхронизация данных...');
        
        try {
            const currentData = { users: db.users, pets: db.petsData };
            const currentHash = this.getDataHash(currentData);
            
            if (currentHash !== lastSyncTime) {
                await store.saveData(currentData);
                lastSyncTime = currentHash;
                this.updateSyncStatus('success', 'Данные синхронизированы');
            }
        } catch (error) {
            console.error('Ошибка синхронизации:', error);
            this.updateSyncStatus('error', 'Ошибка синхронизации');
        } finally {
            syncInProgress = false;
        }
    }
    
    getDataHash(data) {
        return btoa(encodeURIComponent(JSON.stringify(data))).slice(0, 16);
    }
    
    updateSyncStatus(type, message) {
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `sync-status ${type}`;
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    async forceSync() {
        console.log('🔄 Принудительная синхронизация...');
        const currentData = { users: db.users, pets: db.petsData };
        console.log('Текущие данные:', currentData);
        
        try {
            console.log('Сохраняем в GitHub...');
            const result = await store.saveData(currentData);
            console.log('Результат сохранения в GitHub:', result);
            
            if (result) {
                this.showNotification('Данные успешно синхронизированы!', 'success');
            } else {
                this.showNotification('Ошибка синхронизации данных', 'error');
            }
        } catch (error) {
            console.error('Ошибка принудительной синхронизации:', error);
            this.showNotification('Ошибка синхронизации: ' + error.message, 'error');
        }
    }
}

// База данных
class Database {
    constructor() {
        this.users = {};
        this.petsData = [];
    }
    
    async load() {
        try {
            console.log('🔄 Начинаем загрузку данных...');
            console.log('Store._useGitHub():', store._useGitHub());
            console.log('Store.github:', !!store.github);
            console.log('Store.github.token:', !!store.github?.token);
            
            const data = await store.loadData();
            console.log('📥 Данные получены от store.loadData():', data);
            
            this.users = data.users || {};
            this.petsData = data.pets || [];
            
            console.log('✅ Данные загружены. Пользователей:', Object.keys(this.users).length, 'Питомцев:', this.petsData.length);
            console.log('📊 Содержимое this.users:', this.users);
            console.log('📊 Содержимое this.petsData:', this.petsData);
            
            // Принудительно создаем/обновляем админский аккаунт
            console.log('=== ПРОВЕРКА АДМИНСКОГО АККАУНТА ===');
            console.log('db.users существует:', !!this.users);
            console.log('db.users.Admin существует:', !!this.users.Admin);
            console.log('Используем GitHub Storage:', store._useGitHub());
            
            if (!this.users.Admin) {
                console.log('Принудительно создаем/обновляем админский аккаунт...');
                this.users.Admin = {
                    password: 'TatyanaKiseleva1231',
                    role: 'admin',
                    email: 'tatyana02_76@mail.ru'
                };
                
                // Сохраняем обновленные данные
                await store.saveData({ users: this.users, pets: this.petsData });
                console.log('✅ Админский аккаунт успешно создан/обновлен');
            }
            
            return true;
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            return false;
        }
    }
    
    async saveUsers() {
        return await store.saveData({ users: this.users, pets: this.petsData });
    }
    
    async savePets() {
        return await store.saveData({ users: this.users, pets: this.petsData });
    }
    
    getUser(username) {
        return this.users[username];
    }
    
    addUser(username, userData) {
        this.users[username] = userData;
        return this.saveUsers();
    }
    
    getAllPets() {
        return this.petsData;
    }
    
    addPet(petData) {
        petData.id = petData.id || Date.now();
        this.petsData.push(petData);
        return this.savePets();
    }
    
    updatePet(petId, petData) {
        const index = this.petsData.findIndex(p => p.id === petId);
        if (index !== -1) {
            this.petsData[index] = { ...this.petsData[index], ...petData };
            return this.savePets();
        }
        return false;
    }
    
    deletePet(petId) {
        const index = this.petsData.findIndex(p => p.id === petId);
        if (index !== -1) {
            this.petsData.splice(index, 1);
            return this.savePets();
        }
        return false;
    }
}

// Менеджер сессий
class SessionManager {
    saveSession(username, remember = false) {
        const session = {
            username: username,
            timestamp: Date.now(),
            remember: remember
        };
        localStorage.setItem('pitomnik_session', JSON.stringify(session));
    }
    
    loadSession() {
        const session = localStorage.getItem('pitomnik_session');
        return session ? JSON.parse(session) : null;
    }
    
    isSessionActive() {
        const session = this.loadSession();
        if (!session) return false;
        
        const maxAge = session.remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 дней или 1 день
        return (Date.now() - session.timestamp) < maxAge;
    }
    
    clearSession() {
        localStorage.removeItem('pitomnik_session');
    }
}

// Инициализация
const store = new Store();
const db = new Database();
const sessionManager = new SessionManager();

// ПРОСТАЯ ПРОВЕРКА: Скрипт загружен
console.log('=== SCRIPT-RESPONSIVE-2025.JS ЗАГРУЖЕН ===');
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
        } else {
            console.log('GitHub Storage недоступен, используем локальное хранилище');
        }
        
        // Проверяем доступность GitHub Storage
        if (store.github) {
            console.log('GitHub Storage работает корректно');
        } else {
            console.log('GitHub Storage недоступен');
        }
        
        console.log('Загружаем данные...');
        await db.load();
        console.log('Данные загружены. Пользователей:', Object.keys(db.users).length, 'Питомцев:', db.petsData.length);
        
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

function checkSavedSession(){
    const session = sessionManager.loadSession();
    if (session && sessionManager.isSessionActive()){
        const userKey = Object.keys(db.users||{}).find(u => u.toLowerCase() === session.username.toLowerCase());
        const user = userKey ? db.getUser(userKey) : null;
        if (user){ currentUser = userKey; isAdmin = user.role==='admin'; updateUserInterface(); }
    } else {
        // Для всех пользователей (включая гостей) показываем карточки
        currentUser = null;
        isAdmin = false;
        updateUserInterface();
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

    const loginForm = document.getElementById('loginFormElement');
    const registerForm = document.getElementById('registerFormElement');
    const logoutBtn = document.getElementById('logoutBtn');

    loginForm.addEventListener('submit', function(e){
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const githubToken = document.getElementById('githubToken').value.trim();
        const rememberMe = document.getElementById('rememberMe').checked;
        
        console.log('=== ПОПЫТКА ВХОДА ===');
        console.log('Введенный логин:', username);
        console.log('Введенный пароль:', password);
        console.log('Введенный токен:', githubToken ? '***' : 'не введен');
        console.log('Все пользователи в базе:', db.users);
        
        const userKey = Object.keys(db.users||{}).find(u => u.toLowerCase()===username.toLowerCase());
        const user = userKey ? db.getUser(userKey) : null;
        
        console.log('Найденный ключ пользователя:', userKey);
        console.log('Данные пользователя:', user);
        
        if (user && user.password===password){ 
            // Проверяем токен для администратора
            if (user.role === 'admin') {
                if (!githubToken) {
                    alert('Для входа в качестве администратора необходимо ввести GitHub токен!');
                    return;
                }
                // Сохраняем токен для администратора
                localStorage.setItem('github_token', githubToken);
                if (store.github) {
                    store.github.setToken(githubToken);
                }
                console.log('✅ GitHub токен сохранен для администратора');
            } else {
                // Для обычных пользователей удаляем токен
                localStorage.removeItem('github_token');
                if (store.github) {
                    store.github.setToken(null);
                }
                console.log('✅ Токен удален для обычного пользователя');
            }
            
            currentUser=userKey; 
            isAdmin = user.role==='admin'; 
            sessionManager.saveSession(userKey, rememberMe); 
            updateUserInterface(); 
            // Принудительно перезагружаем карточки после входа
            setTimeout(() => {
                loadPets();
                console.log('Карточки перезагружены после входа пользователя');
            }, 100);
            document.getElementById('loginModal').style.display='none'; 
            loginForm.reset();
            alert(`Добро пожаловать, ${userKey}! Роль: ${isAdmin?'Администратор':'Гость'}`); 
        } else {
            alert('Неправильный логин или пароль!');
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
    
    logoutBtn.addEventListener('click', function(){ 
        sessionManager.clearSession(); 
        currentUser=null; 
        isAdmin=false; 
        // Удаляем токен при выходе
        localStorage.removeItem('github_token');
        if (store.github) {
            store.github.setToken(null);
        }
        console.log('✅ Токен удален при выходе из системы');
        updateUserInterface(); 
        loadPets(); 
        alert('Вы вышли из системы'); 
    });
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
        // Для гостей показываем кнопку входа, но скрываем админские функции
        userInfo.textContent='Гость'; 
        loginBtn.style.display='inline-block'; 
        logoutBtn.style.display='none'; 
        addPetBtn.style.display='none'; 
        if (addPuppyBtn) addPuppyBtn.style.display='none'; 
        if (addGraduateBtn) addGraduateBtn.style.display='none'; 
        if (addMemoryBtn) addMemoryBtn.style.display='none'; 
        if (addVideoBtn) addVideoBtn.style.display='none';
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
                    img.style.cssText = 'max-width: 120px; max-height: 80px; margin: 5px; border-radius: 8px; border: 2px solid #e74c3c;';
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
        document.getElementById('photoPreview').innerHTML='';
        document.getElementById('videoPreview').innerHTML='';
        if (pet.photos && pet.photos.length > 0) {
            pet.photos.forEach((photo, index) => {
                const img = document.createElement('img');
                img.src = photo;
                img.style.cssText = 'max-width: 120px; max-height: 80px; margin: 5px; border-radius: 8px; border: 2px solid #e74c3c;';
                img.title = `Фото ${index + 1}`;
                document.getElementById('photoPreview').appendChild(img);
            });
        }
        if (pet.videos && pet.videos.length > 0) {
            pet.videos.forEach((video, index) => {
                const v = document.createElement('video');
                v.src = video;
                v.style.cssText = 'max-width: 120px; max-height: 80px; margin: 5px; border-radius: 8px; border: 2px solid #e74c3c;';
                v.title = `Видео ${index + 1}`;
                v.controls = true;
                document.getElementById('videoPreview').appendChild(v);
            });
        }
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
        alert('Только администратор может добавлять питомцев!');
        return;
    }
    
    try {
        const form = document.getElementById('petForm');
        const formData = new FormData(form);
        
        console.log('Получаем форму...');
        console.log('Форма найдена:', !!form);
        
        // Создаем FormData для отправки
        console.log('Создаем FormData...');
        
        const petData = {
            name: formData.get('name') || document.getElementById('petName').value,
            breed: formData.get('breed') || document.getElementById('petBreed').value,
            age: formData.get('age') || document.getElementById('petAge').value,
            type: formData.get('type') || document.getElementById('petType').value,
            gender: formData.get('gender') || document.getElementById('petGender').value,
            status: formData.get('status') || document.getElementById('petStatus').value,
            description: formData.get('description') || document.getElementById('petDescription').value,
            photos: [],
            videos: []
        };
        
        console.log('Данные питомца:', petData);
        
        const petId = document.getElementById('petId').value;
        console.log('ID питомца:', petId);
        
        // Обрабатываем накопленные фотографии
        if (accumulatedPhotos.length > 0) {
            console.log('Обрабатываем фото:', accumulatedPhotos.length, 'файлов');
            for (let i = 0; i < accumulatedPhotos.length; i++) {
                const file = accumulatedPhotos[i];
                console.log(`Обрабатываем фото ${i+1}/${accumulatedPhotos.length}:`, file.name);
                try {
                    const resized = await resizeImage(file);
                    console.log(`Обрабатываем файл ${i+1}:`, file.name, 'тип:', file.type, 'размер:', file.size);
                    console.log(`Файл ${i+1} обработан, результат:`, resized, 'тип результата:', typeof resized, 'конструктор:', resized.constructor.name);
                    
                    const extension = file.name.split('.').pop().replace(/\s+/g, ''); // Убираем пробелы
                    const path = `pets/images/${Date.now()}_${Math.random().toString(36).slice(2)}_${i}.${extension}`;
                    console.log(`Загружаем файл ${i+1} по пути:`, path);
                    const url = await store.uploadFile(resized, path);
                    petData.photos.push(url);
                    console.log(`Фото ${i+1} сохранено:`, url);
                } catch (error) {
                    console.warn(`Ошибка загрузки фото ${i+1}:`, error.message);
                    // Пропускаем проблемное фото
                }
            }
        }
        
        // Обрабатываем накопленные видео
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
        
        // Запускаем синхронизацию после сохранения
        console.log('Запускаем синхронизацию после сохранения...');
        realtimeSync.forceSync();
        
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
    console.log('🔍 Проверяем состояние db:', {
        users: db.users,
        petsData: db.petsData,
        usersCount: Object.keys(db.users || {}).length,
        petsCount: (db.petsData || []).length
    });
    
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
    console.log('📊 Всего питомцев в базе:', pets.length);
    console.log('📊 Питомцы:', pets);
    
    if (pets.length === 0) {
        console.warn('⚠️ НЕТ ПИТОМЦЕВ В БАЗЕ ДАННЫХ!');
        console.log('🔍 Проверяем db.petsData:', db.petsData);
        console.log('🔍 Проверяем db.users:', db.users);
    }
    
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
    
    // Применяем фильтры после загрузки
    setTimeout(() => {
        applyFilters();
    }, 100);
}

function createPetCard(pet){
    const card=document.createElement('div'); 
    card.className='pet-card'; 
    card.setAttribute('data-type', pet.type);
    card.setAttribute('data-gender', pet.gender || 'male');
    const adminControls = isAdmin ? `
        <div class="admin-controls">
            <button class="admin-btn edit-btn" onclick='openPetModal(${JSON.stringify(pet).replace(/"/g,"&quot;")})' title="Редактировать"><i class="fas fa-edit"></i></button>
            <button class="admin-btn delete-btn" onclick="deletePet(${pet.id})" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>` : '';

    let mediaContent='';
    const firstPhoto = Array.isArray(pet.photos) && pet.photos[0] ? pet.photos[0] : (pet.photo || null);
    const hasVideo = Array.isArray(pet.videos) ? pet.videos.length>0 : !!pet.video;
    
    // Отладочная информация
    console.log(`Карточка ${pet.name}:`, {
        photos: pet.photos,
        firstPhoto: firstPhoto,
        hasVideo: hasVideo,
        videos: pet.videos
    });
    
    if (hasVideo){ const v = Array.isArray(pet.videos)?pet.videos[0]:pet.video; mediaContent = `<video src="${v}" controls></video>`; }
    else if (firstPhoto && firstPhoto !== null && firstPhoto !== 'null'){ 
        console.log(`Используем фото для ${pet.name}:`, firstPhoto);
        mediaContent = `<img src="${firstPhoto}" alt="${pet.name}" onerror="console.error('Ошибка загрузки изображения:', this.src); this.style.display='none'; this.nextElementSibling.style.display='block';"><i class="${pet.icon}" style="display:none;"></i>`; 
    }
    else { 
        console.log(`Нет фото для ${pet.name}, используем иконку`);
        mediaContent = `<i class="${pet.icon}"></i>`; 
    }
    
    const genderIcon = pet.gender==='male'?'♂':'♀';
    const statusText = pet.status==='breeding'?'Племенной': pet.status==='puppy'?'Щенок': pet.status==='graduate'?'Выпускник':'Память';
    
    card.innerHTML=`
        <div class="pet-image">
            ${mediaContent}
            ${adminControls}
        </div>
        <div class="pet-info">
            <h3>${pet.name} ${genderIcon}</h3>
            <p class="pet-breed">${pet.breed}</p>
            <p class="pet-status">${statusText}</p>
            <p class="pet-description">${pet.description}</p>
            <div class="pet-details">
                <span class="pet-age">${pet.age}</span>
                <div>
                    <button class="contact-btn" style="margin-right:8px" onclick="openViewModal(${pet.id})">Подробнее</button>
                    <button class="contact-btn" onclick="contactAboutPet('${pet.name}')">Связаться</button>
            </div>
        </div>
        </div>`;
    return card;
}

function setupFilters(){ 
    const filterButtons=document.querySelectorAll('.filter-btn'); 
    filterButtons.forEach(btn=>btn.addEventListener('click',function(){ 
        // Убираем активный класс со всех кнопок в той же группе
        const group = this.closest('.filter-group');
        if (group) {
            group.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
        }
        this.classList.add('active'); 
        
        // Применяем фильтры
        applyFilters();
    })); 
}

function applyFilters() {
    const breedFilter = document.querySelector('.filter-group:first-child .filter-btn.active');
    const genderFilter = document.querySelector('.filter-group:last-child .filter-btn.active');
    
    const breedValue = breedFilter ? breedFilter.getAttribute('data-filter') : 'all';
    const genderValue = genderFilter ? genderFilter.getAttribute('data-gender') : 'all';
    
    console.log('Применяем фильтры:', { breed: breedValue, gender: genderValue });
    
    document.querySelectorAll('.pet-card').forEach(card=>{ 
        const breed = card.getAttribute('data-type');
        const gender = card.getAttribute('data-gender');
        
        const breedMatch = breedValue === 'all' || breed === breedValue;
        const genderMatch = genderValue === 'all' || gender === genderValue;
        
        card.style.display = (breedMatch && genderMatch) ? 'block' : 'none';
    }); 
}

function filterPets(filter){ 
    // Оставляем для совместимости, но используем новую функцию
    applyFilters();
}

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

function setupAdminFunctions(){
    // Функции для админа
    window.dbExport = function(){
        const data = { users: db.users, pets: db.getAllPets(), exportDate: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
        const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`pitomnik_backup_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    
    window.importData = function(){ document.getElementById('importFile').click(); };
    
    // Обработчик импорта файлов
    const importFile = document.getElementById('importFile');
    if (importFile) {
        importFile.addEventListener('change', async function(e){
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (data.users && data.pets) {
                    db.users = data.users;
                    db.petsData = data.pets;
                    await db.saveUsers();
                    await db.savePets();
                    loadPets();
                    alert('Данные успешно импортированы!');
                } else {
                    alert('Неверный формат файла!');
                }
            } catch (error) {
                console.error('Ошибка импорта:', error);
                alert('Ошибка при импорте данных: ' + error.message);
            }
        });
    }
}

// Создаем экземпляр системы синхронизации
const realtimeSync = new RealtimeSync();

// Добавляем функции в глобальную область видимости
window.realtimeSync = realtimeSync;
window.db = db;
window.store = store;
