// components/icons.tsx

export const Logo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className}>
    <g transform="translate(-5, 0)">
      <path d="M 10 25 A 15 15 0 0 1 25 10 L 75 10 A 15 15 0 0 1 90 25 L 90 45 L 10 45 Z" />
    </g>
    <g transform="translate(5, 0)">
      <path d="M 10 55 L 90 55 L 90 75 A 15 15 0 0 1 75 90 L 25 90 A 15 15 0 0 1 10 75 Z" />
    </g>
  </svg>
);


// --- UserAvatar COMPONENT ---
const generateBgColor = (name: string): string => {
  if (!name) return '#6b7280'; // gray-500
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 50%)`;
};

export const UserAvatar = ({ username, avatarUrl, className }: { username?: string | null; avatarUrl?: string | null; className?: string }) => {
  const finalClassName = `flex items-center justify-center text-white font-bold object-cover select-none ${className || 'w-8 h-8 text-sm rounded-full'}`;

  if (avatarUrl) {
    return <img src={avatarUrl} alt={username || 'User Avatar'} className={finalClassName} />;
  }

  if (!username) {
    return <div className={`${finalClassName} bg-gray-500`}>?</div>;
  }

  const initial = username.charAt(0).toUpperCase();
  const bgColor = generateBgColor(username);

  return (
    <div className={finalClassName} style={{ backgroundColor: bgColor }}>
      {initial}
    </div>
  );
};