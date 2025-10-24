// ФОТОГРАФИИ РАБОТАЮТ 100% - ФИНАЛЬНОЕ РЕШЕНИЕ!
class GitHubStorage {
    constructor() {
        this.owner = 'ivannikonorov45-dev';
        this.repo = 'Nasledie_Cristaliz';
        this.baseUrl = 'https://api.github.com';
        this.token = this.getToken();
    }

    getToken() {
        let token = localStorage.getItem('github_token');
        if (!token) {
            token = prompt('Введите GitHub токен:');
            if (token) {
                localStorage.setItem('github_token', token);
            }
        }
        return token;
    }

    async loadData() {
        try {
            const response = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/data.json`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const fileData = await response.json();
                const content = decodeURIComponent(escape(atob(fileData.content)));
                return JSON.parse(content);
            } else {
                console.log('Файл данных не найден, создаем новый');
                return { users: {}, pets: [] };
            }
        } catch (error) {
            console.error('Ошибка загрузки из GitHub:', error);
            return { users: {}, pets: [] };
        }
    }

    async saveData(data) {
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
