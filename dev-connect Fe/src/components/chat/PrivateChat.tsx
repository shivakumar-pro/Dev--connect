import { useState, useEffect, useRef } from 'react';
import { Search, Send, MoreVertical, Phone, Video, Loader2, Users, Shield, ShieldOff, ShieldBan, MessageSquarePlus, Inbox, Check, X, ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '../common/Button';
import { MessageAPI, UserAPI, ChatRequestAPI } from '../../services/api';
import { subscribe, sendPrivateMessage } from '../../services/stompClient';
import { getAvatarEmoji } from '../../utils/avatars';

type ChatStatus = 'NONE' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED' | 'loading';

export const PrivateChat = ({ currentUser, unreadCounts, onMarkRead }: { currentUser: any; unreadCounts?: Record<string, number>; onMarkRead?: (roomId: string) => void }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [activeUser, setActiveUser] = useState<any>(null);
  const [msgInput, setMsgInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Chat request & block state
  const [chatStatus, setChatStatus] = useState<ChatStatus>('loading');
  const [requestMessage, setRequestMessage] = useState('');
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [blockStatus, setBlockStatus] = useState<{ iBlocked: boolean; blockedMe: boolean }>({ iBlocked: false, blockedMe: false });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: any } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load users
  useEffect(() => {
    const fetchUsersData = async () => {
      setIsLoadingUsers(true);
      try {
        if (!search) {
          const res = await UserAPI.getRecentChats();
          setUsers(res.data || res);
        } else {
          const res = await UserAPI.getUsers(search);
          setUsers(res.data || res);
        }
      } catch (err) {
        console.error('Failed to fetch users', err);
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchUsersData();
  }, [search]);

  // Load pending requests count
  useEffect(() => {
    ChatRequestAPI.getPending().then(res => {
      setPendingRequests(res.data || res || []);
    }).catch(() => {});
  }, []);

  // Check chat status when active user changes
  useEffect(() => {
    if (!activeUser?.id) return;
    setChatStatus('loading');
    setBlockStatus({ iBlocked: false, blockedMe: false });

    Promise.all([
      ChatRequestAPI.getStatus(activeUser.username).catch(() => ({ data: { status: 'ACCEPTED' } })),
      UserAPI.checkBlockStatus(activeUser.username).catch(() => ({ data: { iBlocked: false, blockedMe: false } })),
    ]).then(([chatRes, blockRes]) => {
      const bData = blockRes.data || blockRes;
      setBlockStatus({ iBlocked: bData.iBlocked, blockedMe: bData.blockedMe });

      if (bData.iBlocked || bData.blockedMe) {
        setChatStatus('BLOCKED');
      } else {
        const status = chatRes.data?.status || chatRes.status || 'ACCEPTED';
        setChatStatus(status as ChatStatus);
      }
    });
  }, [activeUser?.id]);

  // Mark as read when opening a private chat
  useEffect(() => {
    if (!activeUser?.id || !currentUser?.id) return;
    const ids = [currentUser.id, activeUser.id].sort((a: number, b: number) => a - b);
    const roomId = `${ids[0]}-${ids[1]}`;
    onMarkRead?.(roomId);
  }, [activeUser?.id, currentUser?.id]);

  // Fetch messages when chat is accepted
  useEffect(() => {
    if (!activeUser || chatStatus !== 'ACCEPTED') {
      if (chatStatus !== 'ACCEPTED') setMessages([]);
      return;
    }
    const fetchMessages = async () => {
      setIsLoadingChats(true);
      try {
        const res = await MessageAPI.getPrivate(activeUser.id, 50);
        const data = Array.isArray(res.data || res) ? (res.data || res) : [];
        data.sort((a: any, b: any) => new Date(a.createdAt || a.timestamp || 0).getTime() - new Date(b.createdAt || b.timestamp || 0).getTime());
        setMessages(data);
      } catch {
        setMessages([]);
      } finally {
        setIsLoadingChats(false);
      }
    };
    fetchMessages();
  }, [activeUser?.id, chatStatus]);

  // Real-time messages + chat request notifications
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    let sub: any = null;

    subscribe(`/topic/user/${currentUser.id}`, (msg: any) => {
      if (cancelled) return;

      if (msg.type === 'CHAT_REQUEST_RECEIVED') {
        setPendingRequests(prev => [...prev, msg]);
        return;
      }
      if (msg.type === 'CHAT_REQUEST_ACCEPTED') {
        if (activeUser && msg.fromUserId === activeUser.id) {
          setChatStatus('ACCEPTED');
        }
        return;
      }

      // Regular message
      if (msg.senderId === currentUser.id) return;
      if (activeUser && (msg.senderId === activeUser.id)) {
        setMessages(prev => [...prev, msg]);
      }
    }).then(s => { sub = s; });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [currentUser?.id, activeUser?.id]);

  // Subscribe to room topic for delete/clear events
  useEffect(() => {
    if (!activeUser?.id || !currentUser?.id) return;
    const ids = [currentUser.id, activeUser.id].sort((a: number, b: number) => a - b);
    const roomId = `${ids[0]}-${ids[1]}`;
    let cancelled = false;
    let sub: any = null;

    subscribe(`/topic/room/${roomId}`, (msg: any) => {
      if (cancelled) return;

      if (msg.type === 'CHAT_CLEARED') {
        setMessages([]);
      }
      if (msg.type === 'MESSAGE_DELETED') {
        setMessages(prev => prev.map(m =>
          m.id === msg.messageId
            ? { ...m, content: 'This message was deleted', deleted: true }
            : m
        ));
      }
    }).then(s => { sub = s; });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [activeUser?.id, currentUser?.id]);

  // ── Actions ──

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim() || !activeUser || !currentUser || chatStatus !== 'ACCEPTED') return;
    try {
      sendPrivateMessage(activeUser.id, msgInput);
      setMessages(p => [...p, {
        id: Date.now(), content: msgInput, createdAt: new Date().toISOString(),
        senderId: currentUser.id, senderName: currentUser.username,
      }]);
      setMsgInput('');
    } catch (err) {
      console.error('Failed to send', err);
    }
  };

  const handleSendRequest = async () => {
    if (!requestMessage.trim() || !activeUser) return;
    try {
      await ChatRequestAPI.send(activeUser.username, requestMessage.trim());
      setChatStatus('PENDING_SENT');
      setRequestMessage('');
    } catch (err: any) {
      console.error('Failed to send request', err);
    }
  };

  const handleAcceptRequest = async (requestId: number) => {
    try {
      await ChatRequestAPI.accept(requestId);
      setPendingRequests(prev => prev.filter(r => r.requestId !== requestId));
      if (activeUser) setChatStatus('ACCEPTED');
    } catch (err) {
      console.error('Failed to accept', err);
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    try {
      await ChatRequestAPI.reject(requestId);
      setPendingRequests(prev => prev.filter(r => r.requestId !== requestId));
    } catch (err) {
      console.error('Failed to reject', err);
    }
  };

  const handleBlock = async () => {
    if (!activeUser) return;
    try {
      await UserAPI.blockUser(activeUser.username);
      setBlockStatus({ iBlocked: true, blockedMe: false });
      setChatStatus('BLOCKED');
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to block', err);
    }
  };

  const handleUnblock = async () => {
    if (!activeUser) return;
    try {
      await UserAPI.unblockUser(activeUser.username);
      setBlockStatus({ iBlocked: false, blockedMe: false });
      setChatStatus('NONE');
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to unblock', err);
    }
  };

  // ── Message delete handlers ──

  const handleDeleteForMe = async (messageId: number | string) => {
    try {
      await MessageAPI.deleteForMe(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      setContextMenu(null);
    } catch (err) { console.error('Failed to delete', err); }
  };

  const handleDeleteForEveryone = async (messageId: number | string) => {
    try {
      await MessageAPI.deleteForEveryone(messageId);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: 'This message was deleted', deleted: true } : m));
      setContextMenu(null);
    } catch (err) { console.error('Failed to delete', err); }
  };

  const handleClearForMe = async () => {
    if (!activeUser || !currentUser) return;
    const ids = [currentUser.id, activeUser.id].sort((a: number, b: number) => a - b);
    const roomId = `${ids[0]}-${ids[1]}`;
    try {
      await MessageAPI.clearForMe(roomId);
      setMessages([]);
      setShowMenu(false);
    } catch (err) { console.error('Failed to clear', err); }
  };

  const handleClearForEveryone = async () => {
    if (!activeUser || !currentUser || !confirm('Clear all messages for both users?')) return;
    const ids = [currentUser.id, activeUser.id].sort((a: number, b: number) => a - b);
    const roomId = `${ids[0]}-${ids[1]}`;
    try {
      await MessageAPI.clearForEveryone(roomId);
      setMessages([]);
      setShowMenu(false);
    } catch (err) { console.error('Failed to clear', err); }
  };

  const handleMessageContextMenu = (e: React.MouseEvent, message: any) => {
    e.preventDefault();
    if (message.deleted) return;
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  };

  // ── Render helpers ──

  const renderChatInput = () => {
    if (chatStatus === 'BLOCKED') {
      return (
        <div className="p-3 sm:p-6 mb-14 lg:mb-0 bg-bg-secondary border-t border-border-color shrink-0">
          <div className="flex items-center justify-center gap-3 py-4 text-text-muted">
            <ShieldBan className="w-5 h-5" />
            <span className="text-sm font-medium">
              {blockStatus.iBlocked ? 'You blocked this user.' : 'This user has blocked you.'}
            </span>
            {blockStatus.iBlocked && (
              <Button variant="outline" size="sm" className="ml-2 rounded-lg" onClick={handleUnblock}>
                <ShieldOff className="w-4 h-4 mr-1" /> Unblock
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (chatStatus === 'NONE' || chatStatus === 'REJECTED') {
      return (
        <div className="p-3 sm:p-6 mb-14 lg:mb-0 bg-bg-secondary border-t border-border-color shrink-0">
          <div className="max-w-xl mx-auto flex flex-col gap-3">
            <div className="text-center">
              <MessageSquarePlus className="w-8 h-8 text-accent-purple mx-auto mb-2" />
              <p className="text-sm text-text-secondary">
                {chatStatus === 'REJECTED' ? 'Your previous request was declined. Try again?' : `Send a chat request to @${activeUser?.username}`}
              </p>
            </div>
            <textarea
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
              placeholder="Write a message with your request..."
              rows={2}
              className="w-full bg-bg-tertiary border border-border-color rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-purple resize-none"
            />
            <Button
              variant="primary"
              className="rounded-xl h-11 bg-gradient-to-r from-accent-purple to-accent-hover border-0 font-semibold"
              onClick={handleSendRequest}
              disabled={!requestMessage.trim()}
            >
              <Send className="w-4 h-4 mr-2" /> Send Chat Request
            </Button>
          </div>
        </div>
      );
    }

    if (chatStatus === 'PENDING_SENT') {
      return (
        <div className="p-3 sm:p-6 mb-14 lg:mb-0 bg-bg-secondary border-t border-border-color shrink-0">
          <div className="flex items-center justify-center gap-3 py-4 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin text-accent-purple" />
            <span className="text-sm font-medium">Chat request pending. Waiting for {activeUser?.username} to accept...</span>
          </div>
        </div>
      );
    }

    if (chatStatus === 'PENDING_RECEIVED') {
      const req = pendingRequests.find(r => r.senderId === activeUser?.id);
      return (
        <div className="p-3 sm:p-6 mb-14 lg:mb-0 bg-bg-secondary border-t border-border-color shrink-0">
          <div className="max-w-xl mx-auto flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-text-secondary">{activeUser?.username} wants to chat with you</p>
            {req?.firstMessage && (
              <div className="bg-bg-tertiary border border-border-color rounded-xl px-4 py-3 text-sm text-text-primary italic w-full">
                "{req.firstMessage}"
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="rounded-xl px-6" onClick={() => req && handleRejectRequest(req.requestId)}>
                <X className="w-4 h-4 mr-1" /> Decline
              </Button>
              <Button variant="primary" className="rounded-xl px-6 bg-gradient-to-r from-green-500 to-emerald-600 border-0" onClick={() => req && handleAcceptRequest(req.requestId)}>
                <Check className="w-4 h-4 mr-1" /> Accept
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (chatStatus === 'loading') {
      return (
        <div className="p-3 sm:p-6 mb-14 lg:mb-0 bg-bg-secondary border-t border-border-color shrink-0">
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
        </div>
      );
    }

    // ACCEPTED — normal input
    return (
      <div className="fixed bottom-14 left-0 right-0 lg:static p-3 sm:p-6 bg-bg-secondary border-t border-border-color z-30 shrink-0">
        <form className="flex items-center gap-2 sm:gap-4 max-w-6xl mx-auto" onSubmit={handleSend}>
          <input
            type="text"
            className="flex-1 h-11 sm:h-14 bg-bg-tertiary border border-border-color focus:border-accent-purple rounded-full px-4 sm:px-6 text-sm sm:text-base focus:outline-none focus:ring-1 focus:ring-accent-purple/30 text-text-primary placeholder:text-text-muted transition-all"
            placeholder={`Message @${activeUser?.username}...`}
            value={msgInput}
            onChange={(e) => setMsgInput(e.target.value)}
          />
          <Button type="submit" variant="primary" size="icon" className="rounded-full shrink-0 w-11 h-11 sm:w-14 sm:h-14 shadow-lg bg-gradient-to-br from-accent-purple to-accent-hover" disabled={!msgInput.trim()}>
            <Send className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
          </Button>
        </form>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full bg-bg-primary overflow-hidden">
      {/* Users List Panel — hidden on mobile when a user is selected */}
      <div className={`${activeUser ? 'hidden lg:flex' : 'flex'} w-full lg:w-96 border-r border-border-color bg-bg-secondary flex-col shrink-0 lg:flex-none lg:max-w-xs transition-all`}>

        <div className="p-6 border-b border-border-color">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Direct Messages</h2>
            {/* Requests inbox */}
            <button
              onClick={() => setShowRequests(!showRequests)}
              className="relative p-2.5 hover:bg-bg-tertiary rounded-xl transition-colors text-text-secondary hover:text-accent-purple"
              title="Chat Requests"
            >
              <Inbox className="w-5 h-5" />
              {pendingRequests.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          </div>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text" placeholder="Search users..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-12 bg-bg-tertiary border border-border-color rounded-full pl-12 pr-5 text-base text-text-primary focus:outline-none focus:border-accent-purple transition-colors shadow-sm"
            />
          </div>
        </div>

        {/* Pending Requests Panel */}
        {showRequests && (
          <div className="border-b border-border-color bg-bg-primary">
            <div className="px-5 py-3 border-b border-border-color/50">
              <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">Chat Requests</h3>
            </div>
            {pendingRequests.length === 0 ? (
              <p className="text-center text-text-muted text-sm py-6">No pending requests</p>
            ) : (
              pendingRequests.map((req: any) => (
                <div key={req.requestId} className="flex items-start gap-3 p-4 border-b border-border-color/30">
                  <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border-color flex items-center justify-center text-xl shrink-0">
                    {getAvatarEmoji(req.senderAvatar)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-text-primary">{req.senderUsername}</span>
                    {req.firstMessage && (
                      <p className="text-xs text-text-secondary mt-0.5 truncate italic">"{req.firstMessage}"</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => handleRejectRequest(req.requestId)}
                        className="text-xs px-3 py-1 rounded-lg bg-bg-tertiary border border-border-color text-text-muted hover:text-red-400 hover:border-red-500/30 transition-colors">
                        Decline
                      </button>
                      <button onClick={() => handleAcceptRequest(req.requestId)}
                        className="text-xs px-3 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors">
                        Accept
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* User list */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingUsers ? (
            <div className="p-6 flex justify-center text-accent-purple"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : users.length === 0 ? (
            <div className="p-6 text-center text-text-muted">No users found. Try searching!</div>
          ) : (
            users.map(u => {
              const ids = currentUser?.id ? [currentUser.id, u.id].sort((a: number, b: number) => a - b) : [];
              const roomId = ids.length === 2 ? `${ids[0]}-${ids[1]}` : '';
              const unread = roomId ? (unreadCounts?.[roomId] || 0) : 0;
              return (
                <div key={u.id} onClick={() => { setActiveUser(u); setShowRequests(false); }}
                  className={`flex items-center gap-4 p-5 border-b border-border-color/50 cursor-pointer transition-colors ${
                    activeUser?.id === u.id ? 'bg-accent-purple/10 border-l-4 border-l-accent-purple' : 'hover:bg-bg-tertiary border-l-4 border-l-transparent'
                  }`}>
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-bg-tertiary border-2 border-border-color flex items-center justify-center text-2xl shadow-md">
                      {getAvatarEmoji(u.profileAvatar)}
                    </div>
                    {u.status === 'ONLINE' && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-[3px] border-bg-secondary rounded-full" />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h3 className={`font-semibold text-lg truncate ${activeUser?.id === u.id ? 'text-accent-purple' : 'text-text-primary'}`}>{u.username}</h3>
                    <p className="text-sm text-text-secondary truncate capitalize">{u.status === 'ONLINE' ? 'Active now' : 'Offline'}</p>
                  </div>
                  {unread > 0 && (
                    <span className="min-w-[22px] h-[22px] px-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center shrink-0">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Window Panel — shown on mobile when user selected */}
      <div className={`${activeUser ? 'flex' : 'hidden lg:flex'} flex-col flex-1 bg-bg-primary h-full`}>
        {activeUser ? (
          <>
            {/* Header */}
            <header className="h-16 lg:h-20 px-3 lg:px-8 border-b border-border-color flex items-center justify-between shrink-0 glass w-full">
              <div className="flex items-center gap-3 lg:gap-4">
                {/* Back button (mobile only) */}
                <button onClick={() => setActiveUser(null)} className="lg:hidden p-1.5 -ml-1 hover:bg-bg-tertiary rounded-lg text-text-secondary">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-bg-tertiary border-2 border-border-color flex items-center justify-center text-xl lg:text-2xl">
                  {getAvatarEmoji(activeUser.profileAvatar)}
                </div>
                <div>
                  <h2 className="font-bold text-xl leading-tight">{activeUser.username}</h2>
                  <p className="text-sm text-text-secondary capitalize">{activeUser.status || 'Offline'}</p>
                </div>
              </div>
              <div className="flex gap-2 text-text-secondary">
                {chatStatus === 'ACCEPTED' && (
                  <>
                    <button onClick={() => (window as any).__startCall?.(activeUser.username, 'video')} className="p-3 hover:text-accent-purple hover:bg-bg-tertiary rounded-xl transition-colors" title="Video Call">
                      <Video className="w-6 h-6" />
                    </button>
                    <button onClick={() => (window as any).__startCall?.(activeUser.username, 'audio')} className="p-3 hover:text-accent-purple hover:bg-bg-tertiary rounded-xl transition-colors" title="Audio Call">
                      <Phone className="w-6 h-6" />
                    </button>
                  </>
                )}
                {/* More menu */}
                <div className="relative">
                  <button onClick={() => setShowMenu(!showMenu)} className="p-3 hover:text-accent-purple hover:bg-bg-tertiary rounded-xl transition-colors">
                    <MoreVertical className="w-6 h-6" />
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-bg-secondary border border-border-color rounded-2xl shadow-2xl z-30 overflow-hidden min-w-[240px] py-2">
                      {chatStatus === 'ACCEPTED' && (
                        <>
                          <button onClick={handleClearForMe} className="flex items-center gap-4 w-full px-5 py-4 text-base text-text-primary hover:bg-bg-tertiary transition-colors">
                            <Trash2 className="w-5 h-5 text-text-muted" /> Clear chat for me
                          </button>
                          <button onClick={handleClearForEveryone} className="flex items-center gap-4 w-full px-5 py-4 text-base text-red-400 hover:bg-red-500/5 transition-colors">
                            <Trash2 className="w-5 h-5" /> Clear for everyone
                          </button>
                          <div className="border-t border-border-color/50 my-1 mx-3" />
                        </>
                      )}
                      {blockStatus.iBlocked ? (
                        <button onClick={handleUnblock} className="flex items-center gap-4 w-full px-5 py-4 text-base text-green-400 hover:bg-green-500/5 transition-colors">
                          <ShieldOff className="w-5 h-5" /> Unblock User
                        </button>
                      ) : (
                        <button onClick={handleBlock} className="flex items-center gap-4 w-full px-5 py-4 text-base text-red-400 hover:bg-red-500/5 transition-colors">
                          <Shield className="w-5 h-5" /> Block User
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-3">
              <div className="flex-1" />
              {chatStatus === 'loading' || isLoadingChats ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
                </div>
              ) : chatStatus !== 'ACCEPTED' ? (
                <div className="flex justify-center items-center h-full text-text-muted text-base flex-col gap-3">
                  <MessageSquarePlus className="w-16 h-16 opacity-30" />
                  {chatStatus === 'NONE' && <p>Send a chat request to start messaging</p>}
                  {chatStatus === 'PENDING_SENT' && <p>Waiting for {activeUser.username} to accept your request</p>}
                  {chatStatus === 'PENDING_RECEIVED' && <p>{activeUser.username} wants to chat with you</p>}
                  {chatStatus === 'REJECTED' && <p>Request was declined. You can send again.</p>}
                  {chatStatus === 'BLOCKED' && <p>This conversation is blocked.</p>}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center items-center h-full text-text-muted text-lg flex-col gap-4">
                  <div className="w-20 h-20 rounded-full bg-bg-tertiary flex items-center justify-center mb-2">
                    <Send className="w-8 h-8 text-text-muted" />
                  </div>
                  No messages yet. Say hi!
                </div>
              ) : messages.map((m, i) => {
                const isOwn = m.senderId === currentUser?.id;
                const showAvatar = !isOwn && (i === 0 || messages[i - 1].senderId !== m.senderId);
                const time = m.createdAt || m.timestamp
                  ? new Date(m.createdAt || m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';
                return (
                  <div key={m.id || i} className={`flex gap-2 max-w-[75%] ${isOwn ? 'self-end flex-row-reverse' : ''} ${showAvatar ? 'mt-3' : ''}`}>
                    {!isOwn && showAvatar ? (
                      <div className="w-8 h-8 rounded-full bg-bg-tertiary border border-border-color shrink-0 flex items-center justify-center text-base">
                        {getAvatarEmoji(m.profileAvatar || activeUser?.profileAvatar)}
                      </div>
                    ) : !isOwn ? (
                      <div className="w-8 shrink-0" />
                    ) : null}

                    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                      {!isOwn && showAvatar && (
                        <span className="text-xs font-semibold text-accent-purple mb-0.5 ml-1">{m.senderName || activeUser?.username}</span>
                      )}
                      <div
                        onContextMenu={(e) => handleMessageContextMenu(e, m)}
                        className={`px-6 py-4 rounded-3xl relative shadow-md min-w-[50px] cursor-context-menu ${
                          m.deleted
                            ? 'bg-bg-tertiary/50 border border-border-color/50 italic'
                            : isOwn
                              ? 'bg-gradient-to-br from-accent-purple to-accent-hover text-white rounded-tr-sm border border-accent-purple/30'
                              : 'bg-bg-tertiary border-2 border-border-color text-text-primary rounded-tl-sm'
                        }`}
                      >
                        <p className={`text-base leading-relaxed tracking-wide break-words overflow-hidden ${m.deleted ? 'text-text-muted text-sm' : ''}`}>
                          {m.deleted ? '🚫 This message was deleted' : m.content}
                        </p>
                      </div>
                      {time && <span className="text-[10px] font-medium text-text-muted mt-0.5 mx-1">{time}</span>}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area — changes based on chat status */}
            {renderChatInput()}
          </>
        ) : (
          <div className="flex flex-col justify-center items-center h-full text-text-muted text-lg">
            <Users className="w-24 h-24 text-text-muted opacity-30 mb-6" />
            <p>Select a conversation to start messaging</p>
          </div>
        )}
      </div>

      {/* Close menus on outside click */}
      {showMenu && <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />}

      {/* Message context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-bg-secondary border border-border-color rounded-2xl shadow-2xl overflow-hidden min-w-[220px] py-2"
            style={{ top: Math.min(contextMenu.y, window.innerHeight - 150), left: Math.min(contextMenu.x, window.innerWidth - 240) }}
          >
            <button
              onClick={() => handleDeleteForMe(contextMenu.message.id)}
              className="flex items-center gap-4 w-full px-5 py-4 text-base text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <Trash2 className="w-5 h-5 text-text-muted" /> Delete for me
            </button>
            {contextMenu.message.senderId === currentUser?.id && (
              <button
                onClick={() => handleDeleteForEveryone(contextMenu.message.id)}
                className="flex items-center gap-4 w-full px-5 py-4 text-base text-red-400 hover:bg-red-500/5 transition-colors"
              >
                <Trash2 className="w-5 h-5" /> Delete for everyone
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
