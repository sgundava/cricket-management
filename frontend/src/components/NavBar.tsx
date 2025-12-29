import { useGameStore } from '../store/gameStore';
import { Screen } from '../types';

// Franchise mode navigation items
const franchiseNavItems: { screen: Screen; label: string; icon: string }[] = [
  { screen: 'home', label: 'Home', icon: '🏠' },
  { screen: 'squad', label: 'Squad', icon: '👥' },
  { screen: 'stats', label: 'Stats', icon: '📊' },
  { screen: 'schedule', label: 'Schedule', icon: '📅' },
  { screen: 'club', label: 'Club', icon: '🏢' },
];

// International mode navigation items
const internationalNavItems: { screen: Screen; label: string; icon: string }[] = [
  { screen: 'home', label: 'Home', icon: '🏠' },
  { screen: 'squad', label: 'Squad', icon: '👥' },
  { screen: 'stats', label: 'Stats', icon: '📊' },
  { screen: 'schedule', label: 'Calendar', icon: '📅' },
  { screen: 'club', label: 'Board', icon: '🏛️' },
];

export const NavBar = () => {
  const { currentScreen, navigateTo, gameMode } = useGameStore();

  const navItems = gameMode === 'international' ? internationalNavItems : franchiseNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-2 py-2 z-50">
      <div className="max-w-lg mx-auto flex justify-around">
        {navItems.map(({ screen, label, icon }) => (
          <button
            key={screen}
            onClick={() => navigateTo(screen)}
            className={`flex flex-col items-center py-2 px-2 rounded-lg transition-all min-w-0
              ${currentScreen === screen
                ? 'text-blue-400 bg-blue-900/30'
                : 'text-gray-400 hover:text-gray-200'
              }`}
          >
            <span className="text-lg">{icon}</span>
            <span className="text-[10px] mt-1">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
