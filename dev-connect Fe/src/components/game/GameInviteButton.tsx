import { useState, useEffect } from 'react';
import { UserPlus, X, Search, Check, Loader2, Send } from 'lucide-react';
import { UserAPI } from '../../services/api';
import { sendPrivateMessage } from '../../services/stompClient';
import { getAvatarEmoji } from '../../utils/avatars';
import { encodeGameInvite, type GameInviteKind, type DiceType } from '../../utils/gameInvite';

interface Props {
  currentUser: any;
  kind: GameInviteKind;
  roomId: string;
  label: string;
  diceType?: DiceType;
  partyKey?: string;
  className?: string;
}

export const GameInviteButton = ({ currentUser, kind, roomId, label, diceType, partyKey, className = '' }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const run = async () => {
      try {
        const res = search.trim()
          ? await UserAPI.getUsers(search.trim())
          : await UserAPI.getRecentChats();
        const data = res.data || res || [];
        setUsers((data as any[]).filter((u) => u.id !== currentUser?.id));
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(run, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, search, currentUser?.id]);

  const invite = (user: any) => {
    if (!roomId) return;
    const content = encodeGameInvite({
      kind,
      roomId,
      label,
      invitedBy: currentUser?.username || 'A friend',
      diceType,
      partyKey,
    });
    sendPrivateMessage(user.id, content);
    setSentTo(user.username);
    setTimeout(() => setSentTo(null), 2500);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setSearch(''); }}
        disabled={!roomId}
        className={`inline-flex items-center gap-2 px-4 h-11 rounded-xl font-semibold text-sm bg-gradient-to-r from-accent-purple to-accent-orange text-white shadow-lg hover:opacity-90 disabled:opacity-40 transition-opacity ${className}`}
      >
        <UserPlus className="w-4 h-4" /> Invite a friend
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-bg-secondary border border-border-color rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-color">
              <div>
                <h3 className="text-base font-bold text-text-primary">Invite to {label}</h3>
                <p className="text-xs text-text-muted font-mono mt-0.5">Room code: {roomId}</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-bg-tertiary rounded-lg text-text-muted"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-5 py-3 border-b border-border-color">
              <div className="flex items-center gap-2.5 w-full h-11 bg-bg-tertiary border border-border-color rounded-full px-4 focus-within:border-accent-purple transition-colors">
                <Search className="w-4 h-4 text-text-muted shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search friends…"
                  className="flex-1 min-w-0 text-sm text-text-primary placeholder:text-text-muted"
                  style={{ background: 'transparent', border: 'none', outline: 'none', padding: 0, boxShadow: 'none' }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-accent-purple" /></div>
              ) : users.length === 0 ? (
                <p className="text-center text-text-muted text-sm py-8">
                  {search ? 'No users found.' : 'No recent chats. Search for a friend to invite.'}
                </p>
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => invite(u)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-bg-tertiary transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border-color flex items-center justify-center text-lg shrink-0">
                      {getAvatarEmoji(u.profileAvatar)}
                    </div>
                    <span className="flex-1 min-w-0 font-semibold text-sm text-text-primary truncate">{u.username}</span>
                    {sentTo === u.username ? (
                      <span className="flex items-center gap-1 text-xs text-green-500 font-medium shrink-0"><Check className="w-4 h-4" /> Sent</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-accent-purple font-medium shrink-0"><Send className="w-3.5 h-3.5" /> Invite</span>
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="px-5 py-3 border-t border-border-color">
              <p className="text-[11px] text-text-muted text-center">
                Invites are sent in your private chat. You can only invite friends you've connected with.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
