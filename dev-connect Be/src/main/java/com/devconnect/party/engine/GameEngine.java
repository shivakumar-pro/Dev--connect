package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;

import java.util.Map;

/**
 * Game Engine interface — each of the 8 party games implements this.
 *
 * The PartyRoomService calls these methods in order during each round:
 *   1. onRoundStart()      — generate the question/prompt, return data to send to players
 *   2. validateAction()    — validate a player's submission
 *   3. hasSecondPhase()    — does this round have a 2nd phase? (e.g., choose then predict)
 *   4. onPhase2Start()     — if yes, prepare phase 2 data
 *   5. evaluateRound()     — score the round, return results
 */
public interface GameEngine {

    /**
     * Called when a new round starts. Populate gameData with question/prompt data.
     * Returns the round data to send to all players.
     */
    Map<String, Object> onRoundStart(PartyRoom room);

    /**
     * Validate and process a player's action for the current round.
     * Returns null if valid, or an error message if invalid.
     */
    String validateAction(PartyRoom room, String username, Map<String, Object> action);

    /**
     * Evaluate the round after all players have acted (or timer expired).
     * Update scores in PlayerInfo. Returns results to broadcast.
     */
    Map<String, Object> evaluateRound(PartyRoom room);

    /**
     * Whether the game needs a second phase in the same round (e.g., guess phase after submit phase).
     */
    default boolean hasSecondPhase(PartyRoom room) {
        return false;
    }

    /**
     * Called at the start of phase 2. Returns data to send to players.
     */
    default Map<String, Object> onPhase2Start(PartyRoom room) {
        return Map.of();
    }

    /**
     * Validate phase 2 action.
     */
    default String validatePhase2Action(PartyRoom room, String username, Map<String, Object> action) {
        return null;
    }

    /**
     * Min players required for this game.
     */
    default int minPlayers() {
        return 2;
    }
}
