import Database from "@tauri-apps/plugin-sql";

export interface DbTrack {
  id: string;
  name: string;
  artist?: string;
  album?: string;
  duration: number;
  size: number;
  file_path?: string;
  created_at: number;
}

export interface DbPlaylist {
  id: string;
  title: string;
  description?: string;
  created_at: number;
  updated_at: number;
}

export interface DbRoomHistory {
  id: string;
  room_id: string;
  role: string;
  joined_at: number;
}

const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

class LocalSqliteService {
  private db: Database | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (isTauri) {
        try {
          this.db = await Database.load("sqlite:soqaro-lite.db");
          await this.db.execute(`
            CREATE TABLE IF NOT EXISTS tracks (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              artist TEXT,
              album TEXT,
              duration REAL DEFAULT 0,
              size INTEGER DEFAULT 0,
              file_path TEXT,
              created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS playlists (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              description TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS playlist_tracks (
              playlist_id TEXT NOT NULL,
              track_id TEXT NOT NULL,
              position INTEGER NOT NULL,
              PRIMARY KEY (playlist_id, track_id)
            );
            CREATE TABLE IF NOT EXISTS room_history (
              id TEXT PRIMARY KEY,
              room_id TEXT NOT NULL,
              role TEXT NOT NULL,
              joined_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
          `);
          console.log("[sqlite] initialized native sqlite database: soqaro-lite.db");
        } catch (err) {
          console.warn("[sqlite] native initialization failed, fallback to local storage:", err);
          this.db = null;
        }
      }
    })();

    return this.initPromise;
  }

  // Tracks API
  async getTracks(): Promise<DbTrack[]> {
    await this.init();
    if (this.db) {
      return await this.db.select<DbTrack[]>("SELECT * FROM tracks ORDER BY created_at DESC");
    }
    const raw = typeof window !== "undefined" ? localStorage.getItem("soqaro_tracks") : null;
    return raw ? JSON.parse(raw) : [];
  }

  async saveTrack(track: Omit<DbTrack, "created_at">): Promise<void> {
    await this.init();
    const fullTrack: DbTrack = { ...track, created_at: Date.now() };
    if (this.db) {
      await this.db.execute(
        `INSERT OR REPLACE INTO tracks (id, name, artist, album, duration, size, file_path, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          fullTrack.id,
          fullTrack.name,
          fullTrack.artist || "",
          fullTrack.album || "",
          fullTrack.duration,
          fullTrack.size,
          fullTrack.file_path || "",
          fullTrack.created_at
        ]
      );
    } else if (typeof window !== "undefined") {
      const list = await this.getTracks();
      const updated = [fullTrack, ...list.filter((t) => t.id !== fullTrack.id)];
      localStorage.setItem("soqaro_tracks", JSON.stringify(updated));
    }
  }

  async removeTrack(id: string): Promise<void> {
    await this.init();
    if (this.db) {
      await this.db.execute("DELETE FROM tracks WHERE id = $1", [id]);
    } else if (typeof window !== "undefined") {
      const list = await this.getTracks();
      localStorage.setItem("soqaro_tracks", JSON.stringify(list.filter((t) => t.id !== id)));
    }
  }

  // Playlists API
  async getPlaylists(): Promise<DbPlaylist[]> {
    await this.init();
    if (this.db) {
      return await this.db.select<DbPlaylist[]>("SELECT * FROM playlists ORDER BY updated_at DESC");
    }
    const raw = typeof window !== "undefined" ? localStorage.getItem("soqaro_playlists") : null;
    return raw ? JSON.parse(raw) : [];
  }

  async createPlaylist(title: string, description: string = ""): Promise<DbPlaylist> {
    await this.init();
    const id = "pl_" + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    const pl: DbPlaylist = { id, title, description, created_at: now, updated_at: now };
    if (this.db) {
      await this.db.execute(
        "INSERT INTO playlists (id, title, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
        [id, title, description, now, now]
      );
    } else if (typeof window !== "undefined") {
      const list = await this.getPlaylists();
      localStorage.setItem("soqaro_playlists", JSON.stringify([pl, ...list]));
    }
    return pl;
  }

  // Room History API
  async getRoomHistory(): Promise<DbRoomHistory[]> {
    await this.init();
    if (this.db) {
      return await this.db.select<DbRoomHistory[]>(
        "SELECT * FROM room_history ORDER BY joined_at DESC LIMIT 15"
      );
    }
    const raw = typeof window !== "undefined" ? localStorage.getItem("soqaro_room_history") : null;
    return raw ? JSON.parse(raw) : [];
  }

  async addRoomHistory(roomId: string, role: string): Promise<void> {
    await this.init();
    const id = Math.random().toString(36).substring(2, 9);
    const joined_at = Date.now();
    if (this.db) {
      await this.db.execute(
        "INSERT OR REPLACE INTO room_history (id, room_id, role, joined_at) VALUES ($1, $2, $3, $4)",
        [id, roomId, role, joined_at]
      );
    } else if (typeof window !== "undefined") {
      const list = await this.getRoomHistory();
      const updated = [{ id, room_id: roomId, role, joined_at }, ...list.filter((h) => h.room_id !== roomId)].slice(0, 15);
      localStorage.setItem("soqaro_room_history", JSON.stringify(updated));
    }
  }

  // Settings API
  async getSetting(key: string, defaultValue: string = ""): Promise<string> {
    await this.init();
    if (this.db) {
      const rows = await this.db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = $1",
        [key]
      );
      return rows.length > 0 ? rows[0].value : defaultValue;
    }
    return (typeof window !== "undefined" ? localStorage.getItem(`soqaro_set_${key}`) : null) ?? defaultValue;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.init();
    if (this.db) {
      await this.db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
        [key, value]
      );
    } else if (typeof window !== "undefined") {
      localStorage.setItem(`soqaro_set_${key}`, value);
    }
  }
}

export const sqliteDb = new LocalSqliteService();
