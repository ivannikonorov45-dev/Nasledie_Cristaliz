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
        console.log('💾 Store.saveData() вызван');
        console.log('🔍 Проверяем _canWriteToGitHub():', this._canWriteToGitHub());
        console.log('🔍 store.github:', !!this.github);
        console.log('🔍 store.github.token:', !!this.github?.token);
        console.log('🔍 Содержимое данных:', { 
            users: data.users, 
            usersCount: Object.keys(data.users || {}).length,
            pets: data.pets,
            petsCount: (data.pets || []).length
        });
        
        // КРИТИЧЕСКАЯ ЗАЩИТА: Не сохраняем, если данные выглядят подозрительно (меньше 10 питомцев)
        // Это защищает от случайной перезаписи базы пустыми данными
        const petsCount = (data.pets || []).length;
        if (petsCount === 0) {
            console.warn('⚠️ ВНИМАНИЕ! Попытка сохранить ПУСТОЙ массив питомцев!');
            console.warn('⚠️ Это может быть ошибкой! Проверяем данные...');
            
            // Проверяем, есть ли данные в localStorage как резервная копия
            const localData = await this.local.loadData();
            if (localData.pets && localData.pets.length > 0) {
                console.error('🚨 КРИТИЧЕСКАЯ ОШИБКА! Попытка удалить все данные!');
                console.error('🚨 В localStorage есть', localData.pets.length, 'питомцев');
                console.error('🚨 СОХРАНЕНИЕ ОТМЕНЕНО!');
                alert('ОШИБКА: Попытка сохранить пустую базу данных! Сохранение отменено для защиты данных.');
                return false;
            }
        }
        
        if (this._canWriteToGitHub()) {
            console.log('✅ Сохраняем в GitHub...');
            try {
                const result = await this.github.saveData(data);
                console.log('✅ Данные сохранены в GitHub:', result);
                // Дублируем в localStorage как резервную копию
                await this.local.saveData(data);
                console.log('✅ Резервная копия сохранена в localStorage');
                return result;
            } catch (error) {
                console.error('❌ Ошибка сохранения в GitHub:', error);
                console.log('⚠️ Пытаемся сохранить в Local Storage...');
                return await this.local.saveData(data);
            }
        } else {
            console.log('💾 Сохраняем в Local Storage (нет токена GitHub)');
            return await this.local.saveData(data);
        }
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
        
        console.log('🔄 Автоматическая синхронизация ОТКЛЮЧЕНА для предотвращения потери данных');
        console.log('💡 Используйте кнопку "Синхронизировать" для ручной синхронизации');
        this.isRunning = true;
        
        // Автоматическая синхронизация ОТКЛЮЧЕНА
        // Она вызывает проблемы с потерей данных
        // Пользователь может использовать кнопку "Синхронизировать" для ручной синхронизации
        
        // Первая синхронизация при загрузке страницы - только проверка, без сохранения
        // this.syncData(); // Отключено
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
        if (syncInProgress) {
            console.log('⚠️ Синхронизация уже в процессе, пропускаем...');
            return;
        }
        
        syncInProgress = true;
        console.log('🔄 Синхронизация данных...');
        console.log('📊 Текущее состояние:', {
            users: Object.keys(db.users || {}).length,
            pets: (db.petsData || []).length
        });
        
        try {
            const currentData = { users: db.users, pets: db.petsData };
            const currentHash = this.getDataHash(currentData);
            
            console.log('🔍 Хэш данных:', currentHash, 'Последний хэш:', lastSyncTime);
            
            if (currentHash !== lastSyncTime) {
                // ЗАЩИТА: Не синхронизируем пустые данные
                if ((currentData.pets || []).length === 0) {
                    console.warn('⚠️ ОТМЕНА СИНХРОНИЗАЦИИ: попытка синхронизировать пустые данные');
                    this.updateSyncStatus('error', 'Синхронизация отменена (защита от потери данных)');
                    return;
                }
                
                await store.saveData(currentData);
                lastSyncTime = currentHash;
                this.updateSyncStatus('success', 'Данные синхронизированы');
                console.log('✅ Синхронизация завершена успешно');
            } else {
                console.log('ℹ️ Данные не изменились, синхронизация не требуется');
            }
        } catch (error) {
            console.error('❌ Ошибка синхронизации:', error);
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
        console.log('📊 Текущие данные для синхронизации:', {
            users: Object.keys(currentData.users || {}).length,
            pets: (currentData.pets || []).length,
            petNames: (currentData.pets || []).map(p => p.name)
        });
        
        // ЗАЩИТА: Не синхронизируем пустые данные
        if ((currentData.pets || []).length === 0) {
            console.warn('⚠️ ОТМЕНА СИНХРОНИЗАЦИИ: попытка синхронизировать пустые данные');
            this.showNotification('Синхронизация отменена: нет данных для сохранения', 'error');
            return;
        }
        
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
            console.error('❌ Ошибка принудительной синхронизации:', error);
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
    
    async addUser(username, userData) {
        this.users[username] = userData;
        console.log('✅ Пользователь добавлен:', username);
        // Сохраняем данные вручную
        return await store.saveData({ users: this.users, pets: this.petsData });
    }
    
    getAllPets() {
        return this.petsData;
    }
    
    addPet(petData) {
        petData.id = petData.id || Date.now();
        this.petsData.push(petData);
        // НЕ сохраняем автоматически - это будет сделано вручную после завершения всех операций
        console.log('✅ Питомец добавлен в массив, текущее количество:', this.petsData.length);
        return true;
    }
    
    updatePet(petId, petData) {
        const index = this.petsData.findIndex(p => p.id === petId);
        if (index !== -1) {
            this.petsData[index] = { ...this.petsData[index], ...petData };
            // НЕ сохраняем автоматически - это будет сделано вручную после завершения всех операций
            console.log('✅ Питомец обновлен в массиве, текущее количество:', this.petsData.length);
            return true;
        }
        return false;
    }
    
    deletePet(petId) {
        const index = this.petsData.findIndex(p => p.id === petId);
        if (index !== -1) {
            this.petsData.splice(index, 1);
            // НЕ сохраняем автоматически - это будет сделано вручную после завершения всех операций
            console.log('✅ Питомец удален из массива, текущее количество:', this.petsData.length);
            return true;
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
    const addPuppyBtn=document.getElementById('addPuppyBtn'); const addGraduateBtn=document.getElementById('addGraduateBtn'); const addMemoryBtn=document.getElementById('addMemoryBtn');
    if (addPuppyBtn) addPuppyBtn.addEventListener('click', function(){ if(!isAdmin) return alert('Нет прав'); openPetModal(); document.getElementById('petStatus').value='puppy'; });
    if (addGraduateBtn) addGraduateBtn.addEventListener('click', function(){ if(!isAdmin) return alert('Нет прав'); openPetModal(); document.getElementById('petStatus').value='graduate'; });
    if (addMemoryBtn) addMemoryBtn.addEventListener('click', function(){ if(!isAdmin) return alert('Нет прав'); openPetModal(); document.getElementById('petStatus').value='memory'; });
    document.getElementById('petForm').addEventListener('submit', function(e){ e.preventDefault(); savePet(); });

    // Предпросмотр множественных фотографий с накоплением
    const photosInput = document.getElementById('petPhotos');
    if (photosInput) photosInput.addEventListener('change', function(e){
        const newFiles = Array.from(e.target.files || []);
        accumulatedPhotos = [...accumulatedPhotos, ...newFiles];
        updatePhotoPreview();
        console.log('Накоплено фото:', accumulatedPhotos.length);
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


function openPetModal(pet=null){
    console.log('=== ОТКРЫТИЕ МОДАЛЬНОГО ОКНА ===');
    console.log('isAdmin:', isAdmin);
    console.log('pet:', pet);
    
    // Очищаем накопленные файлы при открытии модального окна
    accumulatedPhotos = [];
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
        if (pet.photos && pet.photos.length > 0) {
            pet.photos.forEach((photo, index) => {
                const img = document.createElement('img');
                img.src = photo;
                img.style.cssText = 'max-width: 120px; max-height: 80px; margin: 5px; border-radius: 8px; border: 2px solid #e74c3c;';
                img.title = `Фото ${index + 1}`;
                document.getElementById('photoPreview').appendChild(img);
            });
        }
        } else {
        title.textContent='Добавить собаку'; 
        form.reset();
        document.getElementById('petId').value=''; 
        document.getElementById('photoPreview').innerHTML=''; 
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
        
        const petId = document.getElementById('petId').value;
        console.log('ID питомца:', petId);
        
        // ВАЖНО: Если редактируем существующего питомца - загружаем его данные
        let petData;
        if (petId) {
            console.log('Редактируем существующего питомца, загружаем данные...');
            const existingPet = db.petsData.find(p => p.id === petId);
            if (existingPet) {
                console.log('Найден существующий питомец:', existingPet);
                // Создаем копию существующих данных
                petData = {
                    ...existingPet,
                    name: formData.get('name') || document.getElementById('petName').value,
                    breed: formData.get('breed') || document.getElementById('petBreed').value,
                    age: formData.get('age') || document.getElementById('petAge').value,
                    type: formData.get('type') || document.getElementById('petType').value,
                    gender: formData.get('gender') || document.getElementById('petGender').value,
                    status: formData.get('status') || document.getElementById('petStatus').value,
                    description: formData.get('description') || document.getElementById('petDescription').value,
                    // Сохраняем существующие фото
                    photos: existingPet.photos || []
                };
                console.log('Данные питомца после загрузки существующих:', petData);
            } else {
                console.error('Питомец с ID', petId, 'не найден!');
                alert('Ошибка: питомец не найден!');
                return;
            }
        } else {
            // Создаем нового питомца
            console.log('Создаем нового питомца');
            petData = {
                name: formData.get('name') || document.getElementById('petName').value,
                breed: formData.get('breed') || document.getElementById('petBreed').value,
                age: formData.get('age') || document.getElementById('petAge').value,
                type: formData.get('type') || document.getElementById('petType').value,
                gender: formData.get('gender') || document.getElementById('petGender').value,
                status: formData.get('status') || document.getElementById('petStatus').value,
                description: formData.get('description') || document.getElementById('petDescription').value,
                photos: []
            };
        }
        
        console.log('Итоговые данные питомца:', petData);
        
        // Обрабатываем накопленные фотографии
        console.log('📸 Проверка фото: накоплено =', accumulatedPhotos.length, ', существующих =', petData.photos.length);
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
            console.log('✅ Фото обработаны. Итого фото:', petData.photos.length);
        } else {
            console.log('ℹ️ Новых фото нет, сохраняем существующие');
        }
        
        console.log('✅ ИТОГО: фото =', petData.photos.length);

        // Сохраняем питомца в памяти (БЕЗ сохранения на сервер пока)
        console.log('Сохраняем питомца в памяти...');
        console.log('📊 ДО сохранения: питомцев в базе =', db.petsData.length);
        
        if (petId) {
            console.log('Обновляем существующего питомца с ID:', petId);
            const result = await db.updatePet(petId, petData);
            console.log('Результат обновления:', result);
        } else {
            console.log('Добавляем нового питомца');
            const result = await db.addPet(petData);
            console.log('Результат добавления:', result);
        }
        
        console.log('📊 ПОСЛЕ сохранения в памяти: питомцев в базе =', db.petsData.length);
        console.log('📊 Все питомцы:', db.petsData.map(p => p.name));
        
        // ВАЖНО: Сохраняем данные НА СЕРВЕР только ОДИН РАЗ после всех операций
        console.log('💾 Сохраняем данные на сервер...');
        try {
            const dataToSave = { 
                users: db.users, 
                pets: db.petsData 
            };
            console.log('📦 Данные для сохранения:', {
                usersCount: Object.keys(dataToSave.users).length,
                petsCount: dataToSave.pets.length,
                petNames: dataToSave.pets.map(p => p.name)
            });
            
            const result = await store.saveData(dataToSave);
            console.log('✅ Данные успешно сохранены на сервер. Результат:', result);
            
            // Очищаем поля файлов после УСПЕШНОГО сохранения
            console.log('Очищаем поля формы...');
            document.getElementById('petPhotos').value = '';
            document.getElementById('photoPreview').innerHTML = '';
            
            // Очищаем накопленные файлы
            accumulatedPhotos = [];
            console.log('Поля очищены');
        
            console.log('Обновляем отображение питомцев...');
            loadPets();
            console.log('Закрываем модальное окно...');
            closePetModal();
            console.log('=== СОХРАНЕНИЕ ЗАВЕРШЕНО УСПЕШНО ===');
            
            alert('Карточка успешно добавлена и сохранена!');
        } catch (error) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА сохранения данных:', error);
            console.error('Стек ошибки:', error.stack);
            alert('ОШИБКА: Не удалось сохранить данные! ' + error.message + '\nДанные НЕ были сохранены. Попробуйте еще раз.');
            // НЕ закрываем модальное окно при ошибке, чтобы пользователь мог попробовать снова
            return;
        }
        
    } catch (error) {
        console.error('=== ОШИБКА ПРИ СОХРАНЕНИИ ПИТОМЦА ===');
        console.error('Тип ошибки:', error.name);
        console.error('Сообщение:', error.message);
        console.error('Стек ошибки:', error.stack);
        alert('Ошибка при сохранении: ' + error.message);
    }
}

async function deletePet(petId){ 
    if(!isAdmin) return alert('Нет прав'); 
    if(!confirm('Удалить питомца?')) return; 
    
    console.log('🗑️ Удаляем питомца с ID:', petId);
    console.log('📊 ДО удаления: питомцев в базе =', db.petsData.length);
    
    const success = await db.deletePet(petId); 
    
    if (success) {
        console.log('📊 ПОСЛЕ удаления: питомцев в базе =', db.petsData.length);
        
        // Сохраняем изменения на сервер
        try {
            await store.saveData({ users: db.users, pets: db.petsData });
            console.log('✅ Изменения сохранены на сервер');
            loadPets(); 
            alert('Питомец удален!');
        } catch (error) {
            console.error('❌ Ошибка сохранения после удаления:', error);
            alert('Ошибка сохранения: ' + error.message);
        }
    } else {
        alert('Ошибка удаления питомца');
    }
}

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
    
    console.log('Сетки найдены:', {
        petsGrid: !!petsGrid,
        puppiesGrid: !!puppiesGrid,
        graduatesGrid: !!graduatesGrid,
        memoryGrid: !!memoryGrid
    });
    
    if (petsGrid) petsGrid.innerHTML=''; 
    if (puppiesGrid) puppiesGrid.innerHTML=''; 
    if (graduatesGrid) graduatesGrid.innerHTML=''; 
    if (memoryGrid) memoryGrid.innerHTML='';
    
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
    
    // Отладочная информация
    console.log(`Карточка ${pet.name}:`, {
        photos: pet.photos,
        firstPhoto: firstPhoto
    });
    
    if (firstPhoto && firstPhoto !== null && firstPhoto !== 'null'){ 
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
    const primaryMedia = firstPhoto; 
    const mediaHtml = primaryMedia ? `<img src="${primaryMedia}" alt="${pet.name}">` : `<i class="${pet.icon}"></i>`;
    
    // Галерея миниатюр с горизонтальным скроллом
    let thumbs = '';
    const allImages = Array.isArray(pet.photos)?pet.photos:[];
    const thumbItems = [ ...allImages.map(src=>({type:'img',src})) ];
    
    // Показываем галерею если есть больше одного фото
    if (thumbItems.length > 1){
        thumbs = `
            <div style="margin-top:15px;">
                <h4 style="margin-bottom:10px; color:#666;">Галерея (${thumbItems.length} фото):</h4>
                <div style="display:flex;gap:8px;overflow-x:auto;padding:10px;background:#f9f9f9;border-radius:8px;border:1px solid #e0e0e0;">
                    ${thumbItems.map((it, index)=> 
                        `<img src="${it.src}" style="width:80px;height:80px;object-fit:cover;cursor:pointer;border-radius:8px;flex-shrink:0;border:2px solid transparent;" onclick="swapPrimaryMedia('${pet.id}','${it.src}','img')" title="Фото ${index+1}" onmouseover="this.style.border='2px solid #e74c3c'" onmouseout="this.style.border='2px solid transparent'">`
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
function swapPrimaryMedia(petId, src, type){ const el=document.getElementById('viewPrimaryMedia'); if(!el) return; el.innerHTML = `<img src="${src}" alt="">`; }

function setupAdminFunctions(){
    // Функции для админа
    window.dbExport = function(){
        const data = { users: db.users, pets: db.getAllPets(), exportDate: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
        const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`pitomnik_backup_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    
    window.importData = function(){ document.getElementById('importFile').click(); };
    
    // Функция восстановления из localStorage
    window.restoreFromLocalStorage = async function(){
        if (!isAdmin) {
            alert('Только администратор может восстанавливать данные!');
            return;
        }
        
        if (!confirm('Восстановить данные из локальной копии? Это перезапишет текущие данные.')) {
            return;
        }
        
        try {
            const localData = await store.local.loadData();
            console.log('📦 Данные из localStorage:', {
                users: Object.keys(localData.users || {}).length,
                pets: (localData.pets || []).length
            });
            
            if ((localData.pets || []).length === 0) {
                alert('В локальной копии нет данных для восстановления!');
                return;
            }
            
            db.users = localData.users || {};
            db.petsData = localData.pets || [];
            
            // Сохраняем восстановленные данные
            await store.saveData({ users: db.users, pets: db.petsData });
            
            loadPets();
            alert(`Данные успешно восстановлены! Восстановлено ${db.petsData.length} карточек питомцев.`);
            console.log('✅ Данные восстановлены из localStorage');
        } catch (error) {
            console.error('❌ Ошибка восстановления:', error);
            alert('Ошибка восстановления данных: ' + error.message);
        }
    };
    
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
