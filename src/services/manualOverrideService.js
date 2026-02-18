const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'cache_enricher.db');

function normalizeTitle(title) {
    if (!title) {
        return '';
    }
    // Garante que estamos lidando com uma string, mesmo que um array seja passado por engano
    const titleString = Array.isArray(title) ? title[0] : title;

    if (typeof titleString !== 'string') {
        return '';
    }

    return titleString.toLowerCase().trim();
}

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.run(sql, params, function (err) {
            db.close();
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.get(sql, params, (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.all(sql, params, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

class ManualOverrideService {

    static async findByTitle(title) {
        const normalized = normalizeTitle(title);
        return await dbGet('SELECT * FROM manual_overrides WHERE normalized_title = ?', [normalized]);
    }

    static async saveOverride(title, tmdbId, type) {
        const normalized = normalizeTitle(title);
        return await dbRun(`
            INSERT INTO manual_overrides 
            (normalized_title, original_title, forced_tmdb_id, forced_type)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(normalized_title) DO UPDATE SET
                forced_tmdb_id = excluded.forced_tmdb_id,
                forced_type = excluded.forced_type,
                updated_at = CURRENT_TIMESTAMP
        `, [normalized, title, tmdbId, type]);
    }

    static async listAll() {
        return await dbAll('SELECT * FROM manual_overrides ORDER BY updated_at DESC');
    }

    static async deleteById(id) {
        return await dbRun('DELETE FROM manual_overrides WHERE id = ?', [id]);
    }
}

module.exports = ManualOverrideService;
