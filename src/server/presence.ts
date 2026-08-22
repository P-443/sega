/**
 * In-memory presence manager.
 * A user is online while they hold ≥1 socket; in-game while in an ACTIVE game.
 */

import type { PresenceStatus, PublicPlayer } from '@/shared/events';

interface UserMeta {
  username: string;
  displayName: string;
  hasAvatar: boolean;
}

class PresenceManager {
  private socketsByUser = new Map<string, Set<string>>();
  private metaByUser = new Map<string, UserMeta>();
  private inGameUsers = new Set<string>();
  /** userId → last status sent, to avoid redundant broadcasts */
  private lastBroadcast = new Map<string, PresenceStatus>();

  addSocket(userId: string, socketId: string, meta: UserMeta): boolean {
    let set = this.socketsByUser.get(userId);
    const wasOnline = !!set && set.size > 0;
    if (!set) {
      set = new Set();
      this.socketsByUser.set(userId, set);
    }
    set.add(socketId);
    this.metaByUser.set(userId, meta);
    return !wasOnline;
  }

  /** Returns true when the user went fully offline (no sockets left). */
  removeSocket(userId: string, socketId: string): boolean {
    const set = this.socketsByUser.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.socketsByUser.delete(userId);
      return true;
    }
    return false;
  }

  setInGame(userId: string, inGame: boolean): void {
    if (inGame) this.inGameUsers.add(userId);
    else this.inGameUsers.delete(userId);
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  socketIdsOf(userId: string): string[] {
    return Array.from(this.socketsByUser.get(userId) ?? []);
  }

  statusOf(userId: string): PresenceStatus {
    if (!this.isOnline(userId)) return 'offline';
    return this.inGameUsers.has(userId) ? 'in-game' : 'online';
  }

  metaOf(userId: string): UserMeta | null {
    return this.metaByUser.get(userId) ?? null;
  }

  /** Returns the status if it CHANGED since last broadcast (and records it). */
  changedStatus(userId: string): PresenceStatus | null {
    const current = this.statusOf(userId);
    if (this.lastBroadcast.get(userId) === current) return null;
    this.lastBroadcast.set(userId, current);
    return current;
  }

  listOnline(): PublicPlayer[] {
    const out: PublicPlayer[] = [];
    for (const [userId, meta] of this.metaByUser) {
      if (!this.isOnline(userId)) continue;
      out.push({
        userId,
        username: meta.username,
        displayName: meta.displayName,
        hasAvatar: meta.hasAvatar,
        status: this.inGameUsers.has(userId) ? 'in-game' : 'online',
      });
    }
    out.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ar'));
    return out;
  }
}

export const presence = new PresenceManager();
