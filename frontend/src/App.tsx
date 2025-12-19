import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { NavBar } from './components/NavBar';
import { GlobalMenu } from './components/GlobalMenu';
import { DebugButton } from './components/DebugButton';
import {
  StartScreen,
  HomeScreen,
  SquadScreen,
  PlayerDetailScreen,
  PlayerTalkScreen,
  TeamMeetingScreen,
  StatsScreen,
  ScheduleScreen,
  ClubScreen,
  MatchPrepScreen,
  MatchLiveScreen,
  SeasonSummaryScreen,
  EventScreen,
  AuctionScreen,
  ReleasePhaseScreen,
} from './screens';

function App() {
  const { initialized, currentScreen, phase, auctionState, liveMatchState, navigateTo, selectMatch } = useGameStore();

  // Restore correct screen based on persisted phase (currentScreen is not persisted)
  useEffect(() => {
    if (!initialized) return;

    // If there's a live match in progress, navigate to match-live
    if (liveMatchState && currentScreen !== 'match-live') {
      selectMatch(liveMatchState.matchId);
      navigateTo('match-live');
      return;
    }

    // If in auction phase with active auction, navigate to auction screen
    if (phase === 'auction' && auctionState && auctionState.status !== 'completed') {
      if (currentScreen !== 'auction') {
        navigateTo('auction');
      }
    }
  }, [initialized, phase, auctionState, liveMatchState, currentScreen, navigateTo, selectMatch]);

  // Show start screen if game not initialized
  if (!initialized) {
    return <StartScreen />;
  }

  // Screens that should hide the nav bar
  const hideNavScreens = ['match-live', 'match-prep', 'event', 'season-summary', 'player-talk', 'team-meeting', 'auction', 'release-phase'];
  const showNav = !hideNavScreens.includes(currentScreen);

  // Render current screen
  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />;
      case 'squad':
        return <SquadScreen />;
      case 'player-detail':
        return <PlayerDetailScreen />;
      case 'player-talk':
        return <PlayerTalkScreen />;
      case 'team-meeting':
        return <TeamMeetingScreen />;
      case 'stats':
        return <StatsScreen />;
      case 'schedule':
        return <ScheduleScreen />;
      case 'club':
        return <ClubScreen />;
      case 'match-prep':
        return <MatchPrepScreen />;
      case 'match-live':
        return <MatchLiveScreen />;
      case 'season-summary':
        return <SeasonSummaryScreen />;
      case 'event':
        return <EventScreen />;
      case 'auction':
        return <AuctionScreen />;
      case 'release-phase':
        return <ReleasePhaseScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <GlobalMenu />
      <DebugButton />
      {renderScreen()}
      {showNav && <NavBar />}
    </div>
  );
}

export default App;
