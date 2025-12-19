import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { TeamMeetingOption, TeamMeetingResult } from '../types';
import { StatBar } from '../components/StatBar';

const meetingTypeLabels: Record<string, { label: string; color: string; icon: string }> = {
  'pre-match': { label: 'Pre-Match', color: 'text-blue-400', icon: '🎯' },
  'post-win': { label: 'After Victory', color: 'text-green-400', icon: '🏆' },
  'post-loss': { label: 'After Defeat', color: 'text-orange-400', icon: '💪' },
  crisis: { label: 'Crisis Meeting', color: 'text-red-400', icon: '🚨' },
};

export const TeamMeetingScreen = () => {
  const {
    playerTeamId,
    teams,
    players,
    navigateTo,
    canHoldTeamMeeting,
    getTeamMeetingOptions,
    holdTeamMeeting,
  } = useGameStore();

  const [result, setResult] = useState<TeamMeetingResult | null>(null);

  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamPlayers = players.filter((p) => playerTeam?.squad.includes(p.id));
  const options = getTeamMeetingOptions();
  const canMeet = canHoldTeamMeeting();

  // Calculate team stats
  const avgMorale = teamPlayers.length
    ? Math.round(teamPlayers.reduce((sum, p) => sum + p.morale, 0) / teamPlayers.length)
    : 0;

  // Count players by morale level
  const lowMorale = teamPlayers.filter((p) => p.morale < 50).length;
  const highMorale = teamPlayers.filter((p) => p.morale >= 70).length;

  const handleSelectOption = (option: TeamMeetingOption) => {
    const meetingResult = holdTeamMeeting(option);
    setResult(meetingResult);
  };

  const handleBack = () => {
    navigateTo('club');
  };

  const handleDone = () => {
    navigateTo('home');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <button
          onClick={handleBack}
          className="text-blue-400 hover:text-blue-300 mb-2"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold">Team Meeting</h1>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Team Morale Overview */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ backgroundColor: playerTeam?.colors.primary }}
            >
              {playerTeam?.shortName}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold">{playerTeam?.name}</h2>
              <p className="text-sm text-gray-400">{teamPlayers.length} players in squad</p>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-1">Team Morale</div>
            <StatBar
              value={avgMorale}
              label=""
              color={avgMorale >= 70 ? 'green' : avgMorale >= 50 ? 'yellow' : 'red'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-lg">😟</span>
                <div>
                  <div className="font-bold text-red-400">{lowMorale}</div>
                  <div className="text-xs text-gray-500">Low morale</div>
                </div>
              </div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-lg">😊</span>
                <div>
                  <div className="font-bold text-green-400">{highMorale}</div>
                  <div className="text-xs text-gray-500">High morale</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Result Display */}
        {result && (
          <div
            className={`rounded-xl p-4 border ${
              result.success ? 'bg-gray-800 border-gray-700' : 'bg-red-900/30 border-red-700'
            }`}
          >
            <h3 className="font-semibold mb-2">
              {result.success ? 'Meeting Complete' : 'That didn\'t go well...'}
            </h3>

            <div className="bg-gray-700/50 rounded-lg p-3 mb-4 text-gray-300">
              {result.message}
            </div>

            {/* Notable reactions */}
            {result.notableReactions.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-2">Notable Reactions</div>
                <div className="space-y-2">
                  {result.notableReactions.map((reaction, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-700/30 rounded-lg p-2 text-sm"
                    >
                      <span className="font-medium text-blue-400">
                        {reaction.playerName}:
                      </span>{' '}
                      <span className="text-gray-300 italic">"{reaction.reaction}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 text-sm">
              <div
                className={`flex items-center gap-1 ${
                  result.avgMoraleChange > 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                <span>Avg Morale</span>
                <span className="font-bold">
                  {result.avgMoraleChange > 0 ? '+' : ''}
                  {result.avgMoraleChange}
                </span>
              </div>
            </div>

            <button
              onClick={handleDone}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Meeting Options */}
        {!result && canMeet && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400">CHOOSE YOUR MESSAGE</h3>
            {options.map((option) => {
              const typeInfo = meetingTypeLabels[option.type] || {
                label: option.type,
                color: 'text-gray-400',
                icon: '📢',
              };
              return (
                <button
                  key={option.id}
                  onClick={() => handleSelectOption(option)}
                  className="w-full bg-gray-800 rounded-xl p-4 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{typeInfo.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium mb-1">{option.label}</div>
                      <div className="text-sm text-gray-400">{option.description}</div>

                      {/* Effect hints */}
                      <div className="flex gap-3 mt-2 text-xs">
                        <span
                          className={
                            option.baseMoraleDelta > 0
                              ? 'text-green-500'
                              : option.baseMoraleDelta < 0
                              ? 'text-red-500'
                              : 'text-gray-500'
                          }
                        >
                          Morale{' '}
                          {option.baseMoraleDelta > 0 ? '+' : ''}
                          {option.baseMoraleDelta}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Cooldown Message */}
        {!result && !canMeet && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
            <div className="text-4xl mb-3">⏳</div>
            <h3 className="font-semibold mb-2">Recent Meeting</h3>
            <p className="text-gray-400 text-sm">
              You've already held a team meeting recently. Give the players some time to absorb
              your message before calling another meeting.
            </p>
            <button
              onClick={handleBack}
              className="mt-4 text-blue-400 hover:text-blue-300"
            >
              Go Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
