// GitHub Storage - сохраняем данные в репозитории GitHub
class GitHubStorage {
    constructor() {
        this.owner = 'ivannikonorov45-dev'; // Ваш GitHub username
        this.repo = 'Nasledie_Cristaliz'; // Название репозитория
        this.token = this.getToken(); // Безопасное получение токена
        this.baseUrl = 'https://api.github.com';
    }

    // Безопасное получение токена
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

    // Сохранить данные в файл data.json в репозитории
    async saveData(data) {
        try {
            const content = JSON.stringify(data, null, 2);
            const encodedContent = btoa(unescape(encodeURIComponent(content)));
            
            // Получаем текущий файл (если есть)
            let sha = null;
            try {
                const response = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/data.json`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                if (response.ok) {
                    const fileData = await response.json();
                    sha = fileData.sha;
                }
            } catch (e) {
                // Файл не существует, создаем новый
            }

            // Создаем или обновляем файл
            const response = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/data.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Обновление данных сайта - ${new Date().toISOString()}`,
                    content: encodedContent,
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
            console.error('Ошибка GitHub API:', error);
            return false;
        }
    }

    // Загрузить данные из файла data.json
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
                // Правильное декодирование с поддержкой русских символов
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

    // Загрузить файл (фото/видео) в репозиторий
    async uploadFile(file, filename) {
        try {
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.onload = async () => {
                    try {
                        const base64 = reader.result.split(',')[1];
                        
                        // Проверяем, существует ли файл (для получения sha)
                        let sha = null;
                        try {
                            const checkResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filename}`, {
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
                            // Файл не существует, создаем новый
                        }

                        const response = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filename}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `token ${this.token}`,
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                message: `Загрузка файла ${filename}`,
                                content: base64,
                                sha: sha
                            })
                        });

                        if (response.ok) {
                            const result = await response.json();
                            // Преобразуем API URL в raw URL для прямого доступа к файлу
                            const rawUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/main/${filename}`;
                            console.log('Файл загружен, raw URL:', rawUrl);
                            resolve(rawUrl);
                        } else {
                            const errorText = await response.text();
                            console.error('Ошибка загрузки файла на GitHub:', errorText);
                            reject(new Error(errorText));
                        }
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.readAsDataURL(file);
            });
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            return null;
        }
    }
}

// Экспортируем для использования
window.GitHubStorage = GitHubStorage;
