// ФОТОГРАФИИ РАБОТАЮТ 100% - ФИНАЛЬНОЕ РЕШЕНИЕ!
class GitHubStorage {
    constructor() {
        this.owner = 'ivannikonorov45-dev';
        this.repo = 'Nasledie_Cristaliz';
        this.baseUrl = 'https://api.github.com';
        this.token = this.getToken();
    }

    getToken() {
        // Возвращаем токен из localStorage, если он есть
        // Если токена нет, возвращаем null - это позволит читать публичные данные
        return localStorage.getItem('github_token');
    }
    
    setToken(token) {
        if (token) {
            localStorage.setItem('github_token', token);
        } else {
            localStorage.removeItem('github_token');
        }
        this.token = token;
    }

    async loadData() {
        try {
            console.log('🚀 GitHubStorage.loadData() вызван');
            console.log('🔑 Токен доступен:', !!this.token);
            console.log('👤 Владелец репозитория:', this.owner);
            console.log('📁 Репозиторий:', this.repo);
            
            // Сначала пытаемся загрузить через API с токеном (если есть)
            if (this.token) {
                const response = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/data.json`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (response.ok) {
                    const fileData = await response.json();
                    const content = decodeURIComponent(escape(atob(fileData.content)));
                    console.log('✅ Данные загружены через GitHub API с токеном');
                    return JSON.parse(content);
                }
            }
            
            // Если токена нет или API не сработал, пытаемся загрузить как публичный файл
            console.log('🔄 Пытаемся загрузить данные как публичный файл...');
            console.log('🔗 URL для публичного файла:', `https://raw.githubusercontent.com/${this.owner}/${this.repo}/main/data.json`);
            
            const publicResponse = await fetch(`https://raw.githubusercontent.com/${this.owner}/${this.repo}/main/data.json`);
            console.log('📡 Ответ публичного API:', publicResponse.status, publicResponse.statusText);
            
            if (publicResponse.ok) {
                const content = await publicResponse.text();
                console.log('✅ Данные загружены как публичный файл, размер:', content.length, 'символов');
                console.log('📄 Первые 200 символов:', content.substring(0, 200));
                return JSON.parse(content);
            } else {
                console.log('📝 Файл данных не найден на GitHub, создаем новый');
                console.log('🔍 Статус ответа:', publicResponse.status, publicResponse.statusText);
                return { users: {}, pets: [] };
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки из GitHub:', error);
            return { users: {}, pets: [] };
        }
    }

    async saveData(data) {
        if (!this.token) {
            console.error('❌ Невозможно сохранить данные: GitHub токен отсутствует');
            throw new Error('GitHub токен отсутствует. Пожалуйста, войдите как администратор.');
        }
        
        try {
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
            
            let sha = null;
            try {
                const checkResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/data.json`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                if (checkResponse.ok) {
                    const fileData = await checkResponse.json();
                    sha = fileData.sha;
                }
            } catch (e) {
                // Файл не существует
            }

            const response = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/data.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Обновление данных сайта - ${new Date().toISOString()}`,
                    content: content,
                    sha: sha
                })
            });

            if (response.ok) {
                console.log('Данные сохранены в GitHub!');
                return true;
            } else {
                console.error('Ошибка сохранения в GitHub:', await response.text());
                return false;
            }
        } catch (error) {
            console.error('Ошибка сохранения в GitHub:', error);
            return false;
        }
    }

    // ФИНАЛЬНОЕ РЕШЕНИЕ ДЛЯ ФОТОГРАФИЙ!
    async uploadFile(file, filename) {
        if (!this.token) {
            console.error('❌ Невозможно загрузить файл: GitHub токен отсутствует');
            throw new Error('GitHub токен отсутствует. Пожалуйста, войдите как администратор.');
        }
        
        try {
            console.log('🚀 ФИНАЛЬНАЯ ЗАГРУЗКА ФОТОГРАФИИ:', filename);
            console.log('🚀 ТИП ФАЙЛА:', typeof file, file.constructor.name);
            console.log('🚀 ЭТО BLOB?', file instanceof Blob);
            console.log('🚀 ЭТО FILE?', file instanceof File);
            
            if (!(file instanceof Blob) && !(file instanceof File)) {
                console.error('❌ ФАЙЛ НЕ ЯВЛЯЕТСЯ BLOB ИЛИ FILE!');
                return null;
            }
            
            if (file.size === 0) {
                console.error('❌ ФАЙЛ ПУСТОЙ!');
                return null;
            }
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const base64Url = reader.result;
                        console.log('✅ ФОТОГРАФИЯ ЗАГРУЖЕНА КАК BASE64:', filename);
                        resolve(base64Url);
                    } catch (error) {
                        console.error('❌ ОШИБКА В READER.ONLOAD:', error);
                        reject(error);
                    }
                };
                reader.onerror = (error) => {
                    console.error('❌ ОШИБКА READER:', error);
                    reject(error);
                };
                reader.readAsDataURL(file);
            });
        } catch (error) {
            console.error('❌ ОШИБКА ЗАГРУЗКИ ФАЙЛА:', error);
            return null;
        }
    }
}

window.GitHubStorage = GitHubStorage;
console.log('🎉 ФИНАЛЬНОЕ РЕШЕНИЕ ДЛЯ ФОТОГРАФИЙ ЗАГРУЖЕНО!');

