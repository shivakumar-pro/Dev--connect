package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * BLUFF / LIAR GAME:
 * Phase 1: System assigns one random player as the "liar". A question is asked.
 *          The liar is told a DIFFERENT answer. Everyone answers.
 * Phase 2: All players vote who they think is the liar.
 * Scoring: Correct vote = +2. Liar survives (not voted out by majority) = +3.
 */
@Component
public class BluffEngine implements GameEngine {

    private static final List<Map<String, String>> PROMPTS = List.of(
            Map.of("q", "What did you have for breakfast?", "truth", "Pancakes", "lie", "Sushi"),
            Map.of("q", "What is the capital of France?", "truth", "Paris", "lie", "London"),
            Map.of("q", "Finish: 'The early bird catches the...'", "truth", "worm", "lie", "bus"),
            Map.of("q", "What color is the sky?", "truth", "Blue", "lie", "Green"),
            Map.of("q", "How many legs does a spider have?", "truth", "8", "lie", "6"),
            Map.of("q", "What year did the Titanic sink?", "truth", "1912", "lie", "1920"),
            Map.of("q", "What planet is closest to the sun?", "truth", "Mercury", "lie", "Venus"),
            Map.of("q", "What is the largest ocean?", "truth", "Pacific", "lie", "Atlantic"),
            Map.of("q", "Who painted the Mona Lisa?", "truth", "Da Vinci", "lie", "Picasso"),
            Map.of("q", "What is H2O?", "truth", "Water", "lie", "Oxygen")
    );

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        List<String> players = room.getPlayerUsernames();
        String liar = players.get(ThreadLocalRandom.current().nextInt(players.size()));
        int idx = ThreadLocalRandom.current().nextInt(PROMPTS.size());
        Map<String, String> prompt = PROMPTS.get(idx);

        room.getGameData().put("liar", liar);
        room.getGameData().put("prompt", prompt);
        room.getGameData().put("phase", 1);

        // Everyone sees the question, but the liar gets a different "suggested answer"
        // This info is per-player, stored in gameData for the service to send individually
        Map<String, Map<String, Object>> perPlayer = new HashMap<>();
        for (String p : players) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("question", prompt.get("q"));
            if (p.equals(liar)) {
                data.put("suggestedAnswer", prompt.get("lie"));
                data.put("isLiar", true);
                data.put("instruction", "You are the LIAR! Answer with the suggested answer or something close.");
            } else {
                data.put("suggestedAnswer", prompt.get("truth"));
                data.put("isLiar", false);
                data.put("instruction", "Answer the question honestly using the suggested answer.");
            }
            perPlayer.put(p, data);
        }
        room.getGameData().put("perPlayerData", perPlayer);

        return Map.of(
                "phase", 1,
                "question", prompt.get("q"),
                "instruction", "Answer the question. One player is the LIAR!",
                "perPlayer", true
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        int phase = (int) room.getGameData().getOrDefault("phase", 1);
        if (phase == 1) {
            if (action.get("answer") == null) return "Missing 'answer'";
            return null;
        } else {
            if (action.get("vote") == null) return "Missing 'vote'";
            String vote = (String) action.get("vote");
            if (vote.equals(username)) return "Cannot vote for yourself";
            if (!room.getPlayers().containsKey(vote)) return "Invalid player: " + vote;
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

        // Show all answers (anonymized by player name)
        Map<String, String> answers = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : phase1Actions.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> act = (Map<String, Object>) entry.getValue();
            answers.put(entry.getKey(), (String) act.get("answer"));
        }

        return Map.of(
                "phase", 2,
                "instruction", "Vote who you think is the LIAR!",
                "answers", answers,
                "players", room.getPlayerUsernames()
        );
    }

    @Override
    public String validatePhase2Action(PartyRoom room, String username, Map<String, Object> action) {
        return validateAction(room, username, action);
    }

    @Override
    public Map<String, Object> evaluateRound(PartyRoom room) {
        String liar = (String) room.getGameData().get("liar");
        Map<String, Object> votes = room.getPlayerActions();

        // Count votes
        Map<String, Integer> voteCounts = new HashMap<>();
        for (Object act : votes.values()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> a = (Map<String, Object>) act;
            String vote = (String) a.get("vote");
            voteCounts.merge(vote, 1, Integer::sum);
        }

        // Most voted
        String mostVoted = voteCounts.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("");

        boolean liarCaught = mostVoted.equals(liar);

        Map<String, Object> playerResults = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : votes.entrySet()) {
            String player = entry.getKey();
            @SuppressWarnings("unchecked")
            Map<String, Object> act = (Map<String, Object>) entry.getValue();
            String vote = (String) act.get("vote");
            boolean correct = vote.equals(liar);
            int points = correct ? 2 : 0;
            room.getPlayer(player).addScore(points);
            playerResults.put(player, Map.of("vote", vote, "correct", correct, "points", points));
        }

        // Liar bonus
        int liarPoints = liarCaught ? 0 : 3;
        room.getPlayer(liar).addScore(liarPoints);
        playerResults.put(liar + "_liarBonus", Map.of("liar", liar, "survived", !liarCaught, "points", liarPoints));

        return Map.of(
                "liar", liar,
                "liarCaught", liarCaught,
                "voteCounts", voteCounts,
                "playerResults", playerResults
        );
    }

    @Override
    public int minPlayers() {
        return 3;
    }
}
