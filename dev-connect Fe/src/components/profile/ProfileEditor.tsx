import { useState, useEffect, useRef } from 'react';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { UserAPI } from '../../services/api';
import { AVATAR_CATALOG, getAvatarEmoji } from '../../utils/avatars';
import type { AvatarOption } from '../../utils/avatars';

interface ProfileEditorProps {
  currentUser: any;
  onClose: () => void;
  onUpdate: (user: any) => void;
}

export const ProfileEditor = ({ currentUser, onClose, onUpdate }: ProfileEditorProps) => {
  const [username, setUsername] = useState(currentUser?.username || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [avatar, setAvatar] = useState(currentUser?.profileAvatar || 'avatar_default');
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>([]);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    UserAPI.getAvatars().then(res => {
      const data = res.data || res;
      if (Array.isArray(data) && data.length > 0) {
        setAvatarOptions(data);
      } else {
        setAvatarOptions(Object.entries(AVATAR_CATALOG).map(([key, emoji]) => ({
          key, emoji, label: key.replace('avatar_', '').replace(/^\w/, c => c.toUpperCase()),
        })));
      }
    }).catch(() => {
      setAvatarOptions(Object.entries(AVATAR_CATALOG).map(([key, emoji]) => ({
        key, emoji, label: key.replace('avatar_', '').replace(/^\w/, c => c.toUpperCase()),
      })));
    });
  }, []);

  const checkUsername = (value: string) => {
    if (value === currentUser?.username || value.length < 2) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await UserAPI.checkUsername(value);
        const taken = res.data?.taken ?? res.taken;
        setUsernameStatus(taken ? 'taken' : 'available');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
  };

  const checkEmail = (value: string) => {
    if (value === currentUser?.email || value.length < 5) {
      setEmailStatus('idle');
      return;
    }
    setEmailStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await UserAPI.checkEmail(value);
        const taken = res.data?.taken ?? res.taken;
        setEmailStatus(taken ? 'taken' : 'available');
      } catch {
        setEmailStatus('idle');
      }
    }, 500);
  };

  const handleSave = async () => {
    if (usernameStatus === 'taken' || emailStatus === 'taken') return;
    setSaving(true);
    setError('');
    const payload: any = {};
    if (username !== currentUser?.username) payload.username = username;
    if (email !== currentUser?.email) payload.email = email;
    if (avatar !== currentUser?.profileAvatar) payload.profileAvatar = avatar;

    if (Object.keys(payload).length === 0) { onClose(); return; }

    try {
      const res = await UserAPI.updateMe(payload);
      const updated = res.data || res;
      onUpdate(updated);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'checking') return <Loader2 className="w-4 h-4 animate-spin text-text-muted" />;
    if (status === 'available') return <Check className="w-4 h-4 text-green-500" />;
    if (status === 'taken') return <AlertCircle className="w-4 h-4 text-red-500" />;
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-secondary border border-border-color rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color sticky top-0 bg-bg-secondary z-10">
          <h2 className="text-lg font-bold text-text-primary">Edit Profile</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-bg-tertiary rounded-lg text-text-muted"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Current Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-bg-tertiary border-2 border-border-color flex items-center justify-center text-5xl shadow-inner">
              {getAvatarEmoji(avatar)}
            </div>
            <span className="text-sm text-text-secondary">Tap an avatar below to change</span>
          </div>

          {/* Avatar Grid */}
          <div>
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 block">Choose Avatar</label>
            <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
              {avatarOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setAvatar(opt.key)}
                  title={opt.label}
                  className={`w-full aspect-square rounded-xl flex items-center justify-center text-2xl sm:text-3xl transition-all ${
                    avatar === opt.key
                      ? 'bg-accent-purple/20 border-2 border-accent-purple scale-110 shadow-lg'
                      : 'bg-bg-tertiary border border-border-color hover:border-accent-purple/50 hover:scale-105'
                  }`}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Username</label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); checkUsername(e.target.value); }}
                className="w-full h-12 bg-bg-tertiary border border-border-color rounded-xl px-4 pr-10 text-base text-text-primary focus:outline-none focus:border-accent-purple transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <StatusIcon status={usernameStatus} />
              </div>
            </div>
            {usernameStatus === 'taken' && <p className="text-xs text-red-400 mt-1">Username already taken</p>}
            {usernameStatus === 'available' && <p className="text-xs text-green-500 mt-1">Available!</p>}
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Email</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); checkEmail(e.target.value); }}
                className="w-full h-12 bg-bg-tertiary border border-border-color rounded-xl px-4 pr-10 text-base text-text-primary focus:outline-none focus:border-accent-purple transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <StatusIcon status={emailStatus} />
              </div>
            </div>
            {emailStatus === 'taken' && <p className="text-xs text-red-400 mt-1">Email already taken</p>}
            {emailStatus === 'available' && <p className="text-xs text-green-500 mt-1">Available!</p>}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-sm font-medium text-center">{error}</div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl h-12" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              className="flex-1 rounded-xl h-12 bg-gradient-to-r from-accent-purple to-accent-hover border-0 font-bold"
              onClick={handleSave}
              isLoading={saving}
              disabled={usernameStatus === 'taken' || emailStatus === 'taken'}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
