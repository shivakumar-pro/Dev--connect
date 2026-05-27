package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * THIS OR THAT:
 * Phase 1: Question with 2 options. All players choose one.
 * Phase 2: Players predict what the majority chose.
 * Scoring: Same as majority = +1, correct prediction = +2.
 */
@Component
public class ThisOrThatEngine implements GameEngine {

    private static final List<Map<String, Object>> QUESTIONS = List.of(
            Map.of("q", "Coffee or Tea?", "options", List.of("Coffee", "Tea")),
            Map.of("q", "Mountains or Beach?", "options", List.of("Mountains", "Beach")),
            Map.of("q", "Dogs or Cats?", "options", List.of("Dogs", "Cats")),
            Map.of("q", "Morning or Night?", "options", List.of("Morning", "Night")),
            Map.of("q", "Pizza or Burger?", "options", List.of("Pizza", "Burger")),
            Map.of("q", "Marvel or DC?", "options", List.of("Marvel", "DC")),
            Map.of("q", "Summer or Winter?", "options", List.of("Summer", "Winter")),
            Map.of("q", "Books or Movies?", "options", List.of("Books", "Movies")),
            Map.of("q", "Android or iPhone?", "options", List.of("Android", "iPhone")),
            Map.of("q", "Chocolate or Vanilla?", "options", List.of("Chocolate", "Vanilla")),
            Map.of("q", "Music or Podcasts?", "options", List.of("Music", "Podcasts")),
            Map.of("q", "Travel or Stay Home?", "options", List.of("Travel", "Stay Home")),
            Map.of("q", "Sweet or Salty?", "options", List.of("Sweet", "Salty")),
            Map.of("q", "Early Bird or Night Owl?", "options", List.of("Early Bird", "Night Owl")),
            Map.of("q", "City or Countryside?", "options", List.of("City", "Countryside"))
    );

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        int idx = ThreadLocalRandom.current().nextInt(QUESTIONS.size());
        Map<String, Object> question = QUESTIONS.get(idx);
        room.getGameData().put("question", question);
        room.getGameData().put("phase", 1);

        return Map.of(
                "phase", 1,
                "instruction", "Choose one!",
                "question", question.get("q"),
                "options", question.get("options")
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        int phase = (int) room.getGameData().getOrDefault("phase", 1);
        if (phase == 1) {
            String choice = (String) action.get("choice");
            if (choice == null) return "Missing 'choice'";
            @SuppressWarnings("unchecked")
            Map<String, Object> question = (Map<String, Object>) room.getGameData().get("question");
            @SuppressWarnings("unchecked")
            List<String> options = (List<String>) question.get("options");
            if (!options.contains(choice)) return "Invalid choice";
            return null;
        } else {
            String prediction = (String) action.get("prediction");
            if (prediction == null) return "Missing 'prediction'";
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
        room.getGameData().put("phase1Actions", new LinkedHashMap<>(room.getPlayerActions()));
        room.getGameData().put("phase", 2);
        room.getPlayerActions().clear();

        @SuppressWarnings("unchecked")
        Map<String, Object> question = (Map<String, Object>) room.getGameData().get("question");

        return Map.of(
                "phase", 2,
                "instruction", "Predict what the MAJORITY chose!",
                "question", question.get("q"),
                "options", question.get("options")
        );
    }

    @Override
    public String validatePhase2Action(PartyRoom room, String username, Map<String, Object> action) {
        return validateAction(room, username, action);
    }

    @Override
    public Map<String, Object> evaluateRound(PartyRoom room) {
        @SuppressWarnings("unchecked")
        Map<String, Object> phase1Actions = (Map<String, Object>) room.getGameData().get("phase1Actions");
        Map<String, Object> phase2Actions = room.getPlayerActions();

        // Count choices
        Map<String, Integer> choiceCounts = new HashMap<>();
        for (Object act : phase1Actions.values()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> a = (Map<String, Object>) act;
            String choice = (String) a.get("choice");
            choiceCounts.merge(choice, 1, Integer::sum);
        }

        // Find majority
        String majority = choiceCounts.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("");

        Map<String, Object> playerResults = new LinkedHashMap<>();

        for (String player : room.getPlayerUsernames()) {
            int points = 0;

            // +1 if chose same as majority
            @SuppressWarnings("unchecked")
            Map<String, Object> p1 = phase1Actions.get(player) != null ? (Map<String, Object>) phase1Actions.get(player) : Map.of();
            String playerChoice = (String) p1.getOrDefault("choice", "");
            if (playerChoice.equals(majority)) {
                points += 1;
            }

            // +2 if predicted majority correctly
            @SuppressWarnings("unchecked")
            Map<String, Object> p2 = phase2Actions.get(player) != null ? (Map<String, Object>) phase2Actions.get(player) : Map.of();
            String prediction = (String) p2.getOrDefault("prediction", "");
            if (prediction.equals(majority)) {
                points += 2;
            }

            room.getPlayer(player).addScore(points);
            playerResults.put(player, Map.of(
                    "choice", playerChoice,
                    "prediction", prediction,
                    "points", points
            ));
        }

        return Map.of(
                "majority", majority,
                "choiceCounts", choiceCounts,
                "playerResults", playerResults
        );
    }
}
