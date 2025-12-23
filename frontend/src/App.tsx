import { useEffect, useRef } from 'react';
import { useGameStore } from './store/gameStore';
import { NavBar } from './components/NavBar';
import { GlobalMenu } from './components/GlobalMenu';
import { DebugButton } from './components/DebugButton';
import { ModalContainer } from './components/ModalContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
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

  // Track if we've already done initial navigation to prevent loops
  const hasNavigatedRef = useRef(false);

  // Restore correct screen based on persisted phase (currentScreen is not persisted)
  // Only run once on initial load to prevent infinite loops
  useEffect(() => {
    if (!initialized || hasNavigatedRef.current) return;

    // If there's a live match in progress, navigate to match-live
    if (liveMatchState?.matchId) {
      hasNavigatedRef.current = true;
      selectMatch(liveMatchState.matchId);
      navigateTo('match-live');
      return;
    }

    // If in auction phase with active auction, navigate to appropriate screen
    if (phase === 'auction' && auctionState?.status && auctionState.status !== 'completed') {
      hasNavigatedRef.current = true;
      // Route to release phase screen for mini auction release phase
      if (auctionState.status === 'release_phase') {
        navigateTo('release-phase');
      } else {
        navigateTo('auction');
      }
      return;
    }

    // Mark as navigated even if no navigation needed (initial load complete)
    hasNavigatedRef.current = true;
  }, [initialized]); // Only depend on initialized to run once

  // Show start screen if game not initialized
  if (!initialized) {
    return (
      <ErrorBoundary>
        <StartScreen />
      </ErrorBoundary>
    );
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

  // Screens where stacked modals are allowed (experiment)
  const stackingScreens = ['schedule'];
  const allowStacking = stackingScreens.includes(currentScreen);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-900">
        <GlobalMenu />
        <DebugButton />
        {renderScreen()}
        {showNav && <NavBar />}
        <ModalContainer allowStacking={allowStacking} />
      </div>
    </ErrorBoundary>
  );
}

export default App;
