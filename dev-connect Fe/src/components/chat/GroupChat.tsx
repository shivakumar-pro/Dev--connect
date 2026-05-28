import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Hash, Info, Send, Loader2, X, Search, Check, Crown, Shield, UserMinus, UserPlus, LogOut, Trash2, Edit3, ChevronUp, ChevronDown, ArrowLeft } from 'lucide-react';
import { EmojiPicker } from '../common/EmojiPicker';
import { Button } from '../common/Button';
import { GroupAPI, MessageAPI, UserAPI } from '../../services/api';
import { subscribe, sendGroupMessage } from '../../services/stompClient';
import { getAvatarEmoji } from '../../utils/avatars';

interface Member { userId: number; username: string; profileAvatar?: string; role: string; joinedAt?: string }

const dayLabel = (raw: any) => {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const timeLabel = (raw: any) => {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const GroupChat = ({ currentUser, unreadCounts, onMarkRead }: { currentUser: any; unreadCounts?: Record<string, number>; onMarkRead?: (roomId: string) => void }) => {
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroup, setActiveGroup] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Group info panel
  const [showInfo, setShowInfo] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [addMemberInput, setAddMemberInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load groups
  useEffect(() => {
    const fetchGroups = async () => {
      setIsLoadingGroups(true);
      try {
        const res = await GroupAPI.getAll();
        const data = res.data || res || [];
        setGroups(data);
        if (data.length > 0 && !activeGroup) setActiveGroup(data[0]);
      } catch { setGroups([]); }
      finally { setIsLoadingGroups(false); }
    };
    fetchGroups();
  }, []);

  // Load messages
  useEffect(() => {
    if (!activeGroup) return;
    onMarkRead?.(`group-${activeGroup.id}`);
    setIsLoadingChats(true);
    MessageAPI.getGroup(activeGroup.id, 50).then(res => {
      const data = Array.isArray(res.data || res) ? (res.data || res) : [];
      data.sort((a: any, b: any) => new Date(a.createdAt || a.timestamp || 0).getTime() - new Date(b.createdAt || b.timestamp || 0).getTime());
      setMessages(data);
    }).catch(() => setMessages([]))
      .finally(() => setIsLoadingChats(false));
  }, [activeGroup?.id]);

  // Subscribe
  useEffect(() => {
    if (!activeGroup) return;
    let cancelled = false;
    let sub: any = null;
    subscribe(`/topic/group/${activeGroup.id}`, (msg: any) => {
      if (cancelled) return;
      // Ignore typed events / contentless payloads (prevents phantom empty bubbles)
      if (msg.type || !msg.content) return;
      if (msg.senderId === currentUser?.id || msg.senderName === currentUser?.username) return;
      setMessages(prev => [...prev, msg]);
    }).then(s => { sub = s; });
    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [activeGroup?.id, currentUser?.id]);

  // Search users for create modal
  useEffect(() => {
    if (!memberSearch.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await UserAPI.getUsers(memberSearch);
        const data = res.data || res || [];
        setSearchResults(data.filter((u: any) => u.id !== currentUser?.id && !selectedMembers.find(m => m.id === u.id)));
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [memberSearch, selectedMembers, currentUser?.id]);

  // Load members when info panel opens
  useEffect(() => {
    if (!showInfo || !activeGroup) return;
    setIsLoadingMembers(true);
    GroupAPI.getMembers(activeGroup.id).then(res => {
      setMembers(res.data || res || []);
    }).catch(() => setMembers([]))
      .finally(() => setIsLoadingMembers(false));
  }, [showInfo, activeGroup?.id]);

  const myRole = activeGroup?.currentUserRole || members.find(m => m.userId === currentUser?.id)?.role || 'MEMBER';
  const isAdmin = myRole === 'ADMIN';
  const isCreator = activeGroup?.createdById === currentUser?.id;

  const refreshGroups = async () => {
    const res = await GroupAPI.getAll();
    setGroups(res.data || res || []);
  };

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  // ── Actions ──

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim() || !activeGroup || !currentUser) return;
    sendGroupMessage(activeGroup.id, msgInput);
    setMessages(p => [...p, { id: Date.now(), content: msgInput, senderId: currentUser.id, senderName: currentUser.username, createdAt: new Date().toISOString() }]);
    setMsgInput('');
  };

  const insertEmoji = (emoji: string) => {
    setMsgInput(v => v + emoji);
    inputRef.current?.focus();
  };

  const handleCreateGroup = async () => {
    if (!createName.trim()) return;
    setIsCreating(true);
    try {
      await GroupAPI.create({
        name: createName.trim(),
        description: createDesc.trim(),
        memberUsernames: selectedMembers.map(m => m.username),
      });
      await refreshGroups();
      setShowCreate(false);
      setCreateName(''); setCreateDesc(''); setSelectedMembers([]); setMemberSearch('');
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to create group');
    } finally { setIsCreating(false); }
  };

  const handleUpdateGroup = async () => {
    if (!activeGroup || !editName.trim()) return;
    try {
      const res = await GroupAPI.update(activeGroup.id, { name: editName.trim(), description: editDesc.trim() });
      const updated = res.data || res;
      setActiveGroup({ ...activeGroup, ...updated });
      await refreshGroups();
      setEditingGroup(false);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to update'); }
  };

  const handleDeleteGroup = async () => {
    if (!activeGroup || !confirm('Delete this group permanently?')) return;
    try {
      await GroupAPI.delete(activeGroup.id);
      setActiveGroup(null);
      setShowInfo(false);
      await refreshGroups();
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to delete'); }
  };

  const handleLeaveGroup = async () => {
    if (!activeGroup || !confirm('Leave this group?')) return;
    try {
      await GroupAPI.leave(activeGroup.id);
      setActiveGroup(null);
      setShowInfo(false);
      await refreshGroups();
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to leave'); }
  };

  const handleAddMember = async () => {
    if (!activeGroup || !addMemberInput.trim()) return;
    try {
      await GroupAPI.addMember(activeGroup.id, addMemberInput.trim());
      setAddMemberInput('');
      const res = await GroupAPI.getMembers(activeGroup.id);
      setMembers(res.data || res || []);
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to add member'); }
  };

  const handleRemoveMember = async (username: string) => {
    if (!activeGroup || !confirm(`Remove ${username}?`)) return;
    try {
      await GroupAPI.removeMember(activeGroup.id, username);
      setMembers(prev => prev.filter(m => m.username !== username));
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to remove'); }
  };

  const handlePromote = async (username: string) => {
    if (!activeGroup) return;
    try {
      await GroupAPI.promote(activeGroup.id, username);
      setMembers(prev => prev.map(m => m.username === username ? { ...m, role: 'ADMIN' } : m));
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to promote'); }
  };

  const handleDemote = async (username: string) => {
    if (!activeGroup) return;
    try {
      await GroupAPI.demote(activeGroup.id, username);
      setMembers(prev => prev.map(m => m.username === username ? { ...m, role: 'MEMBER' } : m));
    } catch (err: any) { showError(err?.response?.data?.message || 'Failed to demote'); }
  };

  // ═══════════════════════════════════════
  return (
    <div className="flex h-full w-full bg-bg-primary overflow-hidden relative">

      {/* Groups Sidebar */}
      <div className={`${activeGroup ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 xl:w-96 border-r border-border-color bg-bg-secondary flex-col shrink-0`}>
        <div className="h-16 sm:h-20 px-4 sm:px-6 border-b border-border-color flex justify-between items-center shrink-0">
          <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2.5">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-accent-orange" /> Groups
          </h2>
          <button onClick={() => setShowCreate(true)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-accent-orange/10 text-accent-orange hover:bg-accent-orange hover:text-white flex items-center justify-center transition-colors border border-accent-orange/20"
            title="Create group">
            <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-3 pt-2">Your channels</div>
          {isLoadingGroups ? (
            <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-accent-orange" /></div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center text-center px-4 py-12">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-orange/20 to-red-500/10 border border-accent-orange/20 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-accent-orange" />
              </div>
              <h3 className="font-semibold text-text-primary mb-1">No groups yet</h3>
              <p className="text-sm text-text-secondary mb-4">Create a channel to start collaborating with your team.</p>
              <Button variant="primary" size="sm" onClick={() => setShowCreate(true)} className="gap-2 bg-gradient-to-r from-accent-orange to-red-500 border-0">
                <Plus className="w-4 h-4" /> Create group
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {groups.map(g => {
                const unread = unreadCounts?.[`group-${g.id}`] || 0;
                const active = activeGroup?.id === g.id;
                return (
                  <button key={g.id} onClick={() => { setActiveGroup(g); setShowInfo(false); }}
                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors text-left w-full ${
                      active ? 'bg-accent-orange/15 border border-accent-orange/20' : 'hover:bg-bg-tertiary border border-transparent'
                    }`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 font-bold text-base bg-gradient-to-br ${
                      active ? 'from-accent-orange to-red-500' : 'from-bg-tertiary to-bg-tertiary border border-border-color !text-text-muted'
                    }`}>
                      {(g.name || '#').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm truncate ${active ? 'text-accent-orange' : 'text-text-primary'}`}>{g.name}</div>
                      <div className="text-xs text-text-muted truncate">
                        {g.memberCount ? `${g.memberCount} member${g.memberCount === 1 ? '' : 's'}` : (g.description || 'Group channel')}
                      </div>
                    </div>
                    {unread > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center shrink-0">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`${activeGroup ? 'flex' : 'hidden lg:flex'} flex-col flex-1 bg-bg-primary h-full min-w-0`}>
        {activeGroup ? (
          <>
            <header className="h-16 sm:h-20 px-3 sm:px-6 lg:px-8 border-b border-border-color flex items-center justify-between shrink-0 glass w-full">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <button onClick={() => setActiveGroup(null)} className="lg:hidden p-1.5 -ml-1 hover:bg-bg-tertiary rounded-lg text-text-secondary shrink-0">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-accent-orange to-red-500 flex items-center justify-center text-white font-bold shrink-0">
                  {(activeGroup.name || '#').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-base sm:text-xl leading-tight truncate flex items-center gap-1.5">
                    <Hash className="w-4 h-4 text-text-muted shrink-0" />{activeGroup.name}
                  </h2>
                  <p className="text-xs sm:text-sm text-text-secondary truncate">{activeGroup.description || 'DevConnect group'}</p>
                </div>
              </div>
              <Button variant={showInfo ? 'primary' : 'secondary'} size="sm" className={`gap-2 shrink-0 ${showInfo ? 'bg-accent-orange border-0' : ''}`} onClick={() => setShowInfo(!showInfo)}>
                <Info className="w-4 h-4" /> <span className="hidden sm:inline">{showInfo ? 'Close' : 'Info'}</span>
              </Button>
            </header>

            <div className="flex flex-1 overflow-hidden">
              {/* Messages */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-y-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-6 flex flex-col">
                  {isLoadingChats ? (
                    <div className="flex flex-col justify-center items-center h-full gap-3 text-text-muted">
                      <Loader2 className="w-8 h-8 animate-spin text-accent-orange" />
                      <span className="text-sm">Loading messages…</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col justify-center items-center h-full text-center px-6">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-orange/20 to-red-500/10 border border-accent-orange/20 flex items-center justify-center mb-5">
                        <Hash className="w-10 h-10 text-accent-orange" />
                      </div>
                      <h3 className="text-lg font-semibold text-text-primary mb-1.5">Welcome to #{activeGroup.name}</h3>
                      <p className="text-sm text-text-secondary max-w-sm leading-relaxed">
                        This is the beginning of the group. Be the first to say something!
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1" />
                      <div className="flex flex-col gap-1.5">
                        {messages.map((m, i) => {
                          const isOwn = m.senderId === currentUser?.id || m.senderName === currentUser?.username;
                          const prev = messages[i - 1];
                          const stamp = m.createdAt || m.timestamp;
                          const prevStamp = prev?.createdAt || prev?.timestamp;
                          const newDay = i === 0 || dayLabel(prevStamp) !== dayLabel(stamp);
                          const prevOwn = prev && (prev.senderId === currentUser?.id || prev.senderName === currentUser?.username);
                          const grouped = !newDay && prev && prev.senderName === m.senderName && prevOwn === isOwn;
                          const showHeader = !grouped;

                          return (
                            <React.Fragment key={m.id || i}>
                              {newDay && stamp && (
                                <div className="flex items-center gap-3 my-4">
                                  <div className="flex-1 h-px bg-border-color" />
                                  <span className="text-[11px] font-medium text-text-muted px-2 py-0.5 rounded-full bg-bg-secondary border border-border-color">
                                    {dayLabel(stamp)}
                                  </span>
                                  <div className="flex-1 h-px bg-border-color" />
                                </div>
                              )}

                              <div className={`group flex gap-2.5 sm:gap-3 max-w-[88%] sm:max-w-[75%] ${isOwn ? 'ml-auto flex-row-reverse' : ''} ${showHeader ? 'mt-2' : ''}`}>
                                {!isOwn && (
                                  showHeader ? (
                                    <div className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-color shrink-0 flex items-center justify-center text-base">
                                      {getAvatarEmoji(m.profileAvatar)}
                                    </div>
                                  ) : <div className="w-9 shrink-0" />
                                )}

                                <div className={`flex flex-col min-w-0 ${isOwn ? 'items-end' : 'items-start'}`}>
                                  {showHeader && !isOwn && (
                                    <span className="text-xs font-medium text-accent-orange mb-1 ml-1">{m.senderName || `User ${m.senderId}`}</span>
                                  )}
                                  <div className="flex items-end gap-2">
                                    {isOwn && stamp && (
                                      <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0">{timeLabel(stamp)}</span>
                                    )}
                                    <div className={`px-4 py-2.5 rounded-2xl shadow-sm break-words ${
                                      isOwn
                                        ? 'bg-gradient-to-br from-accent-orange to-red-500 text-white rounded-br-md'
                                        : 'bg-bg-tertiary text-text-primary border border-border-color rounded-bl-md'
                                    }`}>
                                      <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                    </div>
                                    {!isOwn && stamp && (
                                      <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0">{timeLabel(stamp)}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="fixed bottom-16 left-0 right-0 lg:static lg:bottom-0 p-3 sm:p-4 lg:p-6 bg-bg-secondary border-t border-border-color z-30 shrink-0">
                  <form className="flex items-center gap-2 sm:gap-3 max-w-4xl mx-auto" onSubmit={handleSend}>
                    <EmojiPicker onSelect={insertEmoji} activeColor="text-accent-orange bg-accent-orange/15" />
                    <input ref={inputRef} type="text"
                      className="flex-1 min-w-0 h-11 sm:h-12 bg-bg-tertiary border border-border-color focus:border-accent-orange rounded-full px-4 sm:px-5 text-sm sm:text-base focus:outline-none focus:ring-1 focus:ring-accent-orange/30 text-text-primary placeholder:text-text-muted transition-all"
                      placeholder={`Message #${activeGroup.name}…`} value={msgInput} onChange={e => setMsgInput(e.target.value)} />
                    <button type="submit" disabled={!msgInput.trim()}
                      className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-accent-orange to-red-500 text-white shadow-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                      aria-label="Send">
                      <Send className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </div>

              {/* ── Group Info Panel ── */}
              {showInfo && (
                <div className="hidden md:flex w-80 border-l border-border-color bg-bg-secondary flex-col overflow-y-auto shrink-0">
                  <div className="p-5 border-b border-border-color">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-base">Group Info</h3>
                      <button onClick={() => setShowInfo(false)} className="p-1 hover:bg-bg-tertiary rounded-lg text-text-muted"><X className="w-4 h-4" /></button>
                    </div>

                    {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-xs mb-3">{error}</div>}

                    {editingGroup ? (
                      <div className="flex flex-col gap-3">
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Group name"
                          className="h-10 bg-bg-tertiary border border-border-color rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-accent-orange" />
                        <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" rows={2}
                          className="bg-bg-tertiary border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none resize-none" />
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={() => setEditingGroup(false)}>Cancel</Button>
                          <Button variant="primary" size="sm" className="flex-1 rounded-lg bg-accent-orange border-0" onClick={handleUpdateGroup}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-orange to-red-500 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
                          {(activeGroup.name || '#').charAt(0).toUpperCase()}
                        </div>
                        <h2 className="font-bold text-lg text-text-primary">{activeGroup.name}</h2>
                        <p className="text-sm text-text-secondary mt-1">{activeGroup.description || 'No description'}</p>
                        {isAdmin && (
                          <button onClick={() => { setEditName(activeGroup.name); setEditDesc(activeGroup.description || ''); setEditingGroup(true); }}
                            className="text-xs text-accent-orange hover:underline mt-3 inline-flex items-center gap-1"><Edit3 className="w-3 h-3" /> Edit group</button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Members */}
                  <div className="p-5 flex-1">
                    <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">Members ({members.length})</h4>

                    {isAdmin && (
                      <div className="flex gap-2 mb-4">
                        <input type="text" value={addMemberInput} onChange={e => setAddMemberInput(e.target.value)} placeholder="Add by username…"
                          onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                          className="flex-1 h-9 bg-bg-tertiary border border-border-color rounded-lg px-3 text-xs text-text-primary focus:outline-none focus:border-accent-orange min-w-0" />
                        <Button variant="primary" size="sm" className="h-9 px-3 rounded-lg bg-accent-orange border-0 shrink-0" onClick={handleAddMember} disabled={!addMemberInput.trim()}>
                          <UserPlus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}

                    {isLoadingMembers ? (
                      <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {members.map(m => {
                          const isMe = m.userId === currentUser?.id;
                          const isMemberAdmin = m.role === 'ADMIN';
                          const isMemberCreator = m.userId === activeGroup?.createdById;
                          return (
                            <div key={m.userId} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl group ${isMe ? 'bg-accent-orange/5' : 'hover:bg-bg-tertiary'}`}>
                              <div className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-color flex items-center justify-center text-lg shrink-0">
                                {getAvatarEmoji(m.profileAvatar)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-sm text-text-primary truncate">{m.username}{isMe ? ' (you)' : ''}</span>
                                  {isMemberCreator && <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                                  {isMemberAdmin && !isMemberCreator && <Shield className="w-3.5 h-3.5 text-accent-orange shrink-0" />}
                                </div>
                                <span className="text-[10px] text-text-muted capitalize">{m.role.toLowerCase()}</span>
                              </div>

                              {!isMe && (isAdmin || isCreator) && (
                                <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity shrink-0">
                                  {!isMemberCreator && (
                                    isMemberAdmin ? (
                                      isCreator && (
                                        <button onClick={() => handleDemote(m.username)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-text-muted hover:text-red-400 transition-colors" title="Demote">
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                      )
                                    ) : (
                                      <button onClick={() => handlePromote(m.username)} className="p-1.5 hover:bg-green-500/10 rounded-lg text-text-muted hover:text-green-400 transition-colors" title="Promote to Admin">
                                        <ChevronUp className="w-3.5 h-3.5" />
                                      </button>
                                    )
                                  )}
                                  {(!isMemberAdmin || isCreator) && !isMemberCreator && (
                                    <button onClick={() => handleRemoveMember(m.username)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-text-muted hover:text-red-400 transition-colors" title="Remove">
                                      <UserMinus className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-border-color flex flex-col gap-2">
                    <button onClick={handleLeaveGroup} className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                      <LogOut className="w-4 h-4" /> Leave Group
                    </button>
                    {isAdmin && (
                      <button onClick={handleDeleteGroup} className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-4 h-4" /> Delete Group
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col justify-center items-center h-full text-center px-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-orange/20 to-red-500/10 border border-accent-orange/20 flex items-center justify-center mb-5">
              <Hash className="w-10 h-10 text-accent-orange" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-1.5">Select a group</h3>
            <p className="text-sm text-text-secondary max-w-sm">Choose a channel from the left to start messaging, or create a new one.</p>
          </div>
        )}
      </div>

      {/* ── Create Group Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-bg-secondary border border-border-color rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-color sticky top-0 bg-bg-secondary z-10">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Users className="w-5 h-5 text-accent-orange" /> Create Group
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-bg-tertiary rounded-lg text-text-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div>
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 block">Group Name *</label>
                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. React Devs"
                  className="w-full h-12 bg-bg-tertiary border border-border-color rounded-xl px-4 text-base text-text-primary focus:outline-none focus:border-accent-orange" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 block">Description</label>
                <textarea value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="What's this group about?" rows={2}
                  className="w-full bg-bg-tertiary border border-border-color rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-orange resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 block">Add Members ({selectedMembers.length})</label>
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedMembers.map(m => (
                      <span key={m.id} className="flex items-center gap-1.5 bg-accent-orange/10 border border-accent-orange/20 text-accent-orange px-3 py-1.5 rounded-full text-sm font-medium">
                        <span className="text-base">{getAvatarEmoji(m.profileAvatar)}</span> {m.username}
                        <button onClick={() => setSelectedMembers(prev => prev.filter(s => s.id !== m.id))}><X className="w-3.5 h-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2.5 w-full h-11 bg-bg-tertiary border border-border-color rounded-xl px-3.5 focus-within:border-accent-orange transition-colors">
                  <Search className="w-4 h-4 text-text-muted shrink-0" />
                  <input type="text" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search users…"
                    className="flex-1 min-w-0 text-sm text-text-primary placeholder:text-text-muted"
                    style={{ background: 'transparent', border: 'none', outline: 'none', padding: 0, boxShadow: 'none' }} />
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 bg-bg-tertiary border border-border-color rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                    {searchResults.map(u => (
                      <button key={u.id} onClick={() => { setSelectedMembers(prev => [...prev, u]); setMemberSearch(''); setSearchResults([]); }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-bg-secondary transition-colors border-b border-border-color/30 last:border-0">
                        <div className="w-8 h-8 rounded-full bg-bg-secondary border border-border-color flex items-center justify-center text-lg">{getAvatarEmoji(u.profileAvatar)}</div>
                        <span className="font-semibold text-sm text-text-primary">{u.username}</span>
                        <Plus className="w-4 h-4 text-accent-orange ml-auto" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-sm">{error}</div>}
              <div className="flex gap-3 mt-2">
                <Button variant="outline" className="flex-1 rounded-xl h-12" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="primary" className="flex-1 rounded-xl h-12 bg-gradient-to-r from-accent-orange to-red-500 border-0 font-bold" onClick={handleCreateGroup} isLoading={isCreating} disabled={!createName.trim()}>
                  <Check className="w-5 h-5 mr-2" /> Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
