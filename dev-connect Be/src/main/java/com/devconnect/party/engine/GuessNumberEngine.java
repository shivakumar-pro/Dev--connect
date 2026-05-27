package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import com.devconnect.party.model.PlayerInfo;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * GUESS THE NUMBER (Multiplayer):
 * Phase 1: System picks a secret number. All players guess simultaneously.
 * Scoring: First correct = +3, others correct = +1. Closest gets +2 if nobody is exact.
 */
@Component
public class GuessNumberEngine implements GameEngine {

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        int min = 1;
        int max = 100;
        int secret = ThreadLocalRandom.current().nextInt(min, max + 1);
        room.getGameData().put("secret", secret);
        room.getGameData().put("min", min);
        room.getGameData().put("max", max);

        return Map.of(
                "instruction", "Guess the number!",
                "min", min,
                "max", max
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        Object guessObj = action.get("guess");
        if (guessObj == null) return "Missing 'guess'";
        int guess;
        try {
            guess = ((Number) guessObj).intValue();
        } catch (Exception e) {
            return "Invalid guess";
        }
        int min = (int) room.getGameData().get("min");
        int max = (int) room.getGameData().get("max");
        if (guess < min || guess > max) return "Guess must be between " + min + " and " + max;
        return null;
    }

    @Override
    public Map<String, Object> evaluateRound(PartyRoom room) {
        int secret = (int) room.getGameData().get("secret");
        Map<String, Object> actions = room.getPlayerActions();
        Map<String, Object> results = new LinkedHashMap<>();
        Map<String, Object> playerResults = new LinkedHashMap<>();

        int closestDiff = Integer.MAX_VALUE;
        List<String> closestPlayers = new ArrayList<>();
        List<String> exactPlayers = new ArrayList<>();

        for (Map.Entry<String, Object> entry : actions.entrySet()) {
            String player = entry.getKey();
            @SuppressWarnings("unchecked")
            Map<String, Object> act = (Map<String, Object>) entry.getValue();
            int guess = ((Number) act.get("guess")).intValue();
            int diff = Math.abs(guess - secret);
            String hint = guess == secret ? "Correct" : (guess > secret ? "Too High" : "Too Low");

            Map<String, Object> pr = new LinkedHashMap<>();
            pr.put("guess", guess);
            pr.put("hint", hint);
            pr.put("diff", diff);

            if (diff == 0) {
                exactPlayers.add(player);
            }
            if (diff < closestDiff) {
                closestDiff = diff;
                closestPlayers.clear();
                closestPlayers.add(player);
            } else if (diff == closestDiff) {
                closestPlayers.add(player);
            }

            playerResults.put(player, pr);
        }

        // Scoring
        if (!exactPlayers.isEmpty()) {
            for (String p : exactPlayers) {
                room.getPlayer(p).addScore(3);
                @SuppressWarnings("unchecked")
                Map<String, Object> pr = (Map<String, Object>) playerResults.get(p);
                pr.put("points", 3);
            }
        } else {
            for (String p : closestPlayers) {
                room.getPlayer(p).addScore(2);
                @SuppressWarnings("unchecked")
                Map<String, Object> pr = (Map<String, Object>) playerResults.get(p);
                pr.put("points", 2);
            }
        }

        // Mark 0 points for others
        for (Map.Entry<String, Object> entry : playerResults.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pr = (Map<String, Object>) entry.getValue();
            pr.putIfAbsent("points", 0);
        }

        results.put("secret", secret);
        results.put("playerResults", playerResults);
        return results;
    }
}
