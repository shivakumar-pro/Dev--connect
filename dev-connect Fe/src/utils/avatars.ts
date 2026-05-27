export interface AvatarOption {
  key: string;
  emoji: string;
  label: string;
}

// Fallback catalog in case API is unavailable
export const AVATAR_CATALOG: Record<string, string> = {
  avatar_default: '😊',
  avatar_cool: '😎',
  avatar_nerd: '🤓',
  avatar_ninja: '🥷',
  avatar_robot: '🤖',
  avatar_alien: '👽',
  avatar_ghost: '👻',
  avatar_fire: '🔥',
  avatar_star: '⭐',
  avatar_heart: '❤️',
  avatar_thunder: '⚡',
  avatar_crown: '👑',
  avatar_unicorn: '🦄',
  avatar_cat: '🐱',
  avatar_dog: '🐶',
  avatar_panda: '🐼',
  avatar_fox: '🦊',
  avatar_lion: '🦁',
  avatar_astronaut: '🚀',
  avatar_wizard: '🧙',
};

export function getAvatarEmoji(avatarKey?: string | null): string {
  if (!avatarKey) return AVATAR_CATALOG.avatar_default;
  return AVATAR_CATALOG[avatarKey] || AVATAR_CATALOG.avatar_default;
}
