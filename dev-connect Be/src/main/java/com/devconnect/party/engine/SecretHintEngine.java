package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * SECRET HINT GAME:
 * Phase 1: One player picks a secret word and gives a hint.
 * Phase 2: Others guess the word.
 * Scoring: First correct guesser = +3, others correct = +1. Hint-giver gets +1 per guesser.
 */
@Component
public class SecretHintEngine implements GameEngine {

    private static final List<String> SUGGESTED_WORDS = List.of(
            "Elephant", "Guitar", "Sunset", "Volcano", "Chocolate",
            "Pyramid", "Astronaut", "Rainbow", "Typewriter", "Lighthouse",
            "Penguin", "Tornado", "Diamond", "Compass", "Fireworks"
    );

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        List<String> players = room.getPlayerUsernames();
        int round = room.getCurrentRound();
        String hintGiver = players.get((round - 1) % players.size());

        // Suggest a word, but the player can pick their own
        String suggested = SUGGESTED_WORDS.get(ThreadLocalRandom.current().nextInt(SUGGESTED_WORDS.size()));

        room.getGameData().put("hintGiver", hintGiver);
        room.getGameData().put("phase", 1);

        // Per-player data
        Map<String, Map<String, Object>> perPlayer = new HashMap<>();
        for (String p : players) {
            Map<String, Object> data = new LinkedHashMap<>();
            if (p.equals(hintGiver)) {
                data.put("role", "HINT_GIVER");
                data.put("suggestedWord", suggested);
                data.put("instruction", "Pick a secret word and give a hint! Send {word: '...', hint: '...'}");
            } else {
                data.put("role", "GUESSER");
                data.put("instruction", "Wait for " + hintGiver + " to give a hint...");
            }
            perPlayer.put(p, data);
        }
        room.getGameData().put("perPlayerData", perPlayer);

        return Map.of(
                "phase", 1,
                "hintGiver", hintGiver,
                "instruction", hintGiver + " is choosing a word and hint...",
                "perPlayer", true
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        int phase = (int) room.getGameData().getOrDefault("phase", 1);
        String hintGiver = (String) room.getGameData().get("hintGiver");

        if (phase == 1) {
            if (!username.equals(hintGiver)) return "Only " + hintGiver + " can act in phase 1";
            if (action.get("word") == null) return "Missing 'word'";
            if (action.get("hint") == null) return "Missing 'hint'";
            return null;
        } else {
            if (username.equals(hintGiver)) return "Hint giver cannot guess";
            if (action.get("guess") == null) return "Missing 'guess'";
            return null;
        }
    }

    @Override
    public boolean hasSecondPhase(PartyRoom room) {
        int phase = (int) room.getGameData().getOrDefault("phase", 1);
        return phase == 1;
    }

    @Override
    public Map<String, Object> onPhase2Start(PartyRoom room) {
        Map<String, Object> phase1Actions = new LinkedHashMap<>(room.getPlayerActions());
        room.getGameData().put("phase1Actions", phase1Actions);
        room.getGameData().put("phase", 2);
        room.getPlayerActions().clear();

        String hintGiver = (String) room.getGameData().get("hintGiver");
        @SuppressWarnings("unchecked")
        Map<String, Object> hintAction = (Map<String, Object>) phase1Actions.get(hintGiver);
        String hint = hintAction != null ? (String) hintAction.get("hint") : "No hint given";

        room.getGameData().put("guessOrder", Collections.synchronizedList(new ArrayList<String>()));

        return Map.of(
                "phase", 2,
                "hintGiver", hintGiver,
                "hint", hint,
                "instruction", "Guess the secret word based on the hint!"
        );
    }

    @Override
    public String validatePhase2Action(PartyRoom room, String username, Map<String, Object> action) {
        String error = validateAction(room, username, action);
        if (error != null) return error;

        @SuppressWarnings("unchecked")
        List<String> guessOrder = (List<String>) room.getGameData().get("guessOrder");
        if (!guessOrder.contains(username)) {
            guessOrder.add(username);
        }
        return null;
    }

    @Override
    public Map<String, Object> evaluateRound(PartyRoom room) {
        String hintGiver = (String) room.getGameData().get("hintGiver");
        @SuppressWarnings("unchecked")
        Map<String, Object> phase1Actions = (Map<String, Object>) room.getGameData().get("phase1Actions");
        @SuppressWarnings("unchecked")
        Map<String, Object> hintAction = (Map<String, Object>) phase1Actions.get(hintGiver);
        String secretWord = hintAction != null ? ((String) hintAction.get("word")).toLowerCase().trim() : "";

        Map<String, Object> phase2Actions = room.getPlayerActions();
        @SuppressWarnings("unchecked")
        List<String> guessOrder = (List<String>) room.getGameData().getOrDefault("guessOrder", new ArrayList<>());

        Map<String, Object> playerResults = new LinkedHashMap<>();
        int correctCount = 0;
        boolean firstCorrectAwarded = false;

        for (String player : guessOrder) {
            Object actObj = phase2Actions.get(player);
            if (actObj == null) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> act = (Map<String, Object>) actObj;
            String guess = ((String) act.get("guess")).toLowerCase().trim();
            boolean correct = guess.equals(secretWord);

            int points = 0;
            if (correct) {
                correctCount++;
                if (!firstCorrectAwarded) {
                    points = 3;
                    firstCorrectAwarded = true;
                } else {
                    points = 1;
                }
            }

            room.getPlayer(player).addScore(points);
            playerResults.put(player, Map.of("guess", act.get("guess"), "correct", correct, "points", points));
        }

        // Hint giver gets +1 per correct guesser
        room.getPlayer(hintGiver).addScore(correctCount);
        playerResults.put(hintGiver, Map.of("role", "HINT_GIVER", "points", correctCount));

        return Map.of(
                "hintGiver", hintGiver,
                "secretWord", hintAction != null ? hintAction.get("word") : "",
                "hint", hintAction != null ? hintAction.get("hint") : "",
                "playerResults", playerResults
        );
    }

    @Override
    public int minPlayers() {
        return 3;
    }
}
