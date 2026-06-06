import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AuthAPI = {
  login: (data: any) => api.post('/auth/login', data).then(res => res.data),
  register: (data: any) => api.post('/auth/register', data).then(res => res.data),
};

export const GroupAPI = {
  create: (data: any) => api.post('/groups', data).then(res => res.data),
  getAll: () => api.get('/groups/my-groups').then(res => res.data),
  getById: (id: number | string) => api.get(`/groups/${id}`).then(res => res.data),
  update: (id: number | string, data: any) => api.put(`/groups/${id}`, data).then(res => res.data),
  delete: (id: number | string) => api.delete(`/groups/${id}`).then(res => res.data),
  getMembers: (id: number | string) => api.get(`/groups/${id}/members`).then(res => res.data),
  addMember: (groupId: number | string, username: string) => api.post(`/groups/${groupId}/members/${username}`).then(res => res.data),
  removeMember: (groupId: number | string, username: string) => api.delete(`/groups/${groupId}/members/${username}`).then(res => res.data),
  leave: (groupId: number | string) => api.post(`/groups/${groupId}/leave`).then(res => res.data),
  promote: (groupId: number | string, username: string) => api.post(`/groups/${groupId}/promote/${username}`).then(res => res.data),
  demote: (groupId: number | string, username: string) => api.post(`/groups/${groupId}/demote/${username}`).then(res => res.data),
};

export const MessageAPI = {
  send: (data: { roomId: string; roomType: string; content: string; messageType: string }) =>
    api.post('/messages/send', data).then(res => res.data),

  getGlobal: (limit = 50) => api.get(`/messages/global?limit=${limit}`).then(res => res.data),
  getPrivate: (userId: number | string, limit = 50) => api.get(`/messages/private/${userId}?limit=${limit}`).then(res => res.data),
  getGroup: (groupId: number | string, limit = 50) => api.get(`/messages/group/${groupId}?limit=${limit}`).then(res => res.data),
  markRead: (roomId: string) => api.post(`/messages/mark-read/${roomId}`).then(res => res.data),
  getUnreadCounts: () => api.get('/messages/unread-counts').then(res => res.data),
  getUnreadCount: (roomId: string) => api.get(`/messages/unread-count/${roomId}`).then(res => res.data),
  // Delete / Clear
  clearForMe: (roomId: string) => api.delete(`/messages/clear/${roomId}`).then(res => res.data),
  clearForEveryone: (roomId: string) => api.delete(`/messages/clear/${roomId}/everyone`).then(res => res.data),
  deleteForEveryone: (messageId: number | string) => api.delete(`/messages/${messageId}`).then(res => res.data),
  deleteForMe: (messageId: number | string) => api.delete(`/messages/${messageId}/for-me`).then(res => res.data),
};

export const PartyAPI = {
  getGames: () => api.get('/party/games').then(res => res.data),
  createRoom: (data: any) => api.post('/party/create-room', data).then(res => res.data),
  listRooms: () => api.get('/party/rooms').then(res => res.data),
  getRoomStatus: (roomId: string) => api.get(`/party/room/${roomId}`).then(res => res.data),
};

export const DiceAPI = {
  listRooms: () => api.get('/dice/rooms').then(r => r.data),
  createRoom: (data: any) => api.post('/dice/rooms', data).then(r => r.data),
  getRoom: (id: string, username: string) => api.get(`/dice/rooms/${id}?username=${username}`).then(r => r.data),
  join: (id: string, username: string) => api.post(`/dice/rooms/${id}/join`, { username }).then(r => r.data),
  leave: (id: string, username: string) => api.post(`/dice/rooms/${id}/leave`, { username }).then(r => r.data),
  start: (id: string, username: string) => api.post(`/dice/rooms/${id}/start`, { username }).then(r => r.data),
  action: (id: string, data: any) => api.post(`/dice/rooms/${id}/action`, data).then(r => r.data),
};

export const BottleAPI = {
  listRooms: () => api.get('/bottle/rooms').then(r => r.data),
  createRoom: (data: { hostUsername: string; maxPlayers?: number; bottleCount?: number }) => api.post('/bottle/rooms', data).then(r => r.data),
  getRoom: (id: string, username: string) => api.get(`/bottle/rooms/${id}?username=${username}`).then(r => r.data),
  join: (id: string, username: string) => api.post(`/bottle/rooms/${id}/join`, { username }).then(r => r.data),
  leave: (id: string, username: string) => api.post(`/bottle/rooms/${id}/leave`, { username }).then(r => r.data),
  start: (id: string, username: string) => api.post(`/bottle/rooms/${id}/start`, { username }).then(r => r.data),
  addBot: (id: string, username: string) => api.post(`/bottle/rooms/${id}/add-bot`, { username }).then(r => r.data),
  removeBot: (id: string, username: string, botName: string) => api.post(`/bottle/rooms/${id}/remove-bot`, { username, botName }).then(r => r.data),
  submit: (id: string, data: { username: string; arrangement: string[] }) => api.post(`/bottle/rooms/${id}/submit`, data).then(r => r.data),
  rematch: (id: string, username: string) => api.post(`/bottle/rooms/${id}/rematch`, { username }).then(r => r.data),
  chat: (id: string, username: string, message: string) => api.post(`/bottle/rooms/${id}/chat`, { username, message }).then(r => r.data),
};

export const ToxicAPI = {
  listRooms: () => api.get('/toxic/rooms').then(r => r.data),
  createRoom: (data: { hostUsername: string; rounds?: number; maxPlayers?: number }) =>
    api.post('/toxic/rooms', data).then(r => r.data),
  getRoom: (id: string, username: string) =>
    api.get(`/toxic/rooms/${id}?username=${username}`).then(r => r.data),
  join: (id: string, username: string) =>
    api.post(`/toxic/rooms/${id}/join`, { username }).then(r => r.data),
  leave: (id: string, username: string) =>
    api.post(`/toxic/rooms/${id}/leave`, { username }).then(r => r.data),
  start: (id: string, username: string) =>
    api.post(`/toxic/rooms/${id}/start`, { username }).then(r => r.data),
  action: (id: string, data: { username: string; action: 'poison' | 'eat'; position: number }) =>
    api.post(`/toxic/rooms/${id}/action`, data).then(r => r.data),
  nextRound: (id: string, username: string) =>
    api.post(`/toxic/rooms/${id}/next-round`, { username }).then(r => r.data),
};

export const ChowkaAPI = {
  listRooms: () => api.get('/chowka/rooms').then(r => r.data),
  createRoom: (data: { hostUsername: string; maxPlayers?: number; openStart?: boolean }) =>
    api.post('/chowka/rooms', data).then(r => r.data),
  getRoom: (id: string) => api.get(`/chowka/rooms/${id}`).then(r => r.data),
};

export const LeaderboardAPI = {
  get: (game = 'ALL', period: 'WEEKLY' | 'ALL_TIME' = 'WEEKLY', limit = 50) =>
    api.get(`/leaderboard?game=${game}&period=${period}&limit=${limit}`).then(r => r.data),
  stats: (username: string) => api.get(`/stats/${username}`).then(r => r.data),
  /** Top-N games by total plays across all users. */
  popular: (limit = 3) => api.get(`/leaderboard/popular?limit=${limit}`).then(r => r.data),
};

export const Phase10API = {
  createRoom: (data: { maxPlayers?: number; turnTimerSeconds?: number; botsEnabled?: boolean }) =>
    api.post('/phase10/create-room', data).then(res => res.data),
  listRooms: () => api.get('/phase10/rooms').then(res => res.data),
  getRoom: (roomId: string) => api.get(`/phase10/room/${roomId}`).then(res => res.data),
  getPhases: () => api.get('/phase10/phases').then(res => res.data),
  getLeaderboard: () => api.get('/phase10/leaderboard').then(res => res.data),
  getStats: (username: string) => api.get(`/phase10/stats/${username}`).then(res => res.data),
};

export const GameAPI = {
  createRoom: (difficulty?: string) =>
    api.post('/game/create-room', difficulty ? { difficulty } : {}).then(res => res.data),
  getRoomStatus: (roomId: string) => api.get(`/game/room/${roomId}`).then(res => res.data),
  getLeaderboard: () => api.get('/game/leaderboard').then(res => res.data),
  getPlayerStats: (username: string) => api.get(`/game/leaderboard/${username}`).then(res => res.data),
};

export const UserAPI = {
  getMe: () => api.get('/users/me').then(res => res.data),
  updateMe: (data: any) => api.put('/users/me', data).then(res => res.data),
  getUsers: (search?: string) => api.get(`/users${search ? `?search=${search}` : ''}`).then(res => res.data),
  getRecentChats: () => api.get('/users/recent-chats').then(res => res.data),
  getById: (userId: number | string) => api.get(`/users/${userId}`).then(res => res.data),
  getAvatars: () => api.get('/users/avatars').then(res => res.data),
  checkUsername: (username: string) => api.get(`/users/check-username?username=${username}`).then(res => res.data),
  checkEmail: (email: string) => api.get(`/users/check-email?email=${email}`).then(res => res.data),
  // Block (uses username)
  blockUser: (username: string) => api.post(`/users/block/${username}`).then(res => res.data),
  unblockUser: (username: string) => api.delete(`/users/block/${username}`).then(res => res.data),
  getBlockedUsers: () => api.get('/users/block').then(res => res.data),
  checkBlockStatus: (username: string) => api.get(`/users/block/check/${username}`).then(res => res.data),
};

export const ChatRequestAPI = {
  send: (username: string, message: string) =>
    api.post(`/chat-requests/send/${username}`, { message }).then(res => res.data),
  getPending: () => api.get('/chat-requests/pending').then(res => res.data),
  getSent: () => api.get('/chat-requests/sent').then(res => res.data),
  accept: (requestId: number | string) => api.post(`/chat-requests/${requestId}/accept`).then(res => res.data),
  reject: (requestId: number | string) => api.post(`/chat-requests/${requestId}/reject`).then(res => res.data),
  getStatus: (username: string) => api.get(`/chat-requests/status/${username}`).then(res => res.data),
};
