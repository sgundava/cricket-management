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
    <>
      {/* Mobile/Tablet: Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-2 py-2 z-50">
        <div className="max-w-lg md:max-w-3xl mx-auto flex justify-around">
          {navItems.map(({ screen, label, icon }) => (
            <button
              key={screen}
              onClick={() => navigateTo(screen)}
              className={`flex flex-col items-center py-2 px-3 md:px-4 rounded-lg transition-all min-w-0
                ${currentScreen === screen
                  ? 'text-blue-400 bg-blue-900/30'
                  : 'text-gray-400 hover:text-gray-200'
                }`}
            >
              <span className="text-lg md:text-xl">{icon}</span>
              <span className="text-[10px] md:text-xs mt-1">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Desktop: Sidebar Navigation */}
      <nav className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-20 lg:bg-gray-900 lg:border-r lg:border-gray-800 lg:z-50">
        {/* Logo/Brand */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-center">
          <span className="text-2xl">🏏</span>
        </div>

        {/* Nav Items */}
        <div className="flex-1 flex flex-col items-center py-4 gap-2">
          {navItems.map(({ screen, label, icon }) => (
            <button
              key={screen}
              onClick={() => navigateTo(screen)}
              title={label}
              className={`flex flex-col items-center py-3 px-2 w-16 rounded-xl transition-all
                ${currentScreen === screen
                  ? 'text-blue-400 bg-blue-900/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
            >
              <span className="text-xl">{icon}</span>
              <span className="text-[10px] mt-1 font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* Bottom section for future settings/profile */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-center">
          <span className="text-gray-600 text-sm">v1.4</span>
        </div>
      </nav>
    </>
  );
};
