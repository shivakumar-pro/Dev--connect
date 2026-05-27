package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * MEMORY GAME:
 * Show a list of items for a few seconds, then players recall as many as possible.
 * Scoring: +1 per correct item recalled.
 */
@Component
public class MemoryGameEngine implements GameEngine {

    private static final List<List<String>> ITEM_POOLS = List.of(
            List.of("Apple", "Car", "Dog", "Moon", "Guitar", "Book", "Clock", "Tree"),
            List.of("Cat", "Sun", "Phone", "Pizza", "Star", "River", "Crown", "Ball"),
            List.of("Rocket", "Cake", "Fish", "Lamp", "Key", "Flower", "Hat", "Coin"),
            List.of("Sword", "Cloud", "Tiger", "Diamond", "Ship", "Leaf", "Camera", "Drum"),
            List.of("Rainbow", "Castle", "Spider", "Balloon", "Bread", "Compass", "Anchor", "Bell")
    );

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        int poolIdx = ThreadLocalRandom.current().nextInt(ITEM_POOLS.size());
        List<String> pool = new ArrayList<>(ITEM_POOLS.get(poolIdx));
        Collections.shuffle(pool);

        // Pick 5 items to show
        int count = Math.min(5 + room.getCurrentRound(), pool.size());
        List<String> items = pool.subList(0, count);

        room.getGameData().put("items", new ArrayList<>(items));
        room.getGameData().put("showTimeMs", 5000);

        return Map.of(
                "instruction", "Memorize these items! They will disappear in 5 seconds.",
                "items", items,
                "showTimeMs", 5000
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        Object recalledObj = action.get("recalled");
        if (recalledObj == null) return "Missing 'recalled' (list of items)";
        if (!(recalledObj instanceof List)) return "'recalled' must be a list";
        return null;
    }

    @Override
    public Map<String, Object> evaluateRound(PartyRoom room) {
        @SuppressWarnings("unchecked")
        List<String> correctItems = (List<String>) room.getGameData().get("items");
        Set<String> correctSet = new HashSet<>();
        for (String item : correctItems) {
            correctSet.add(item.toLowerCase().trim());
        }

        Map<String, Object> playerResults = new LinkedHashMap<>();

        for (Map.Entry<String, Object> entry : room.getPlayerActions().entrySet()) {
            String player = entry.getKey();
            @SuppressWarnings("unchecked")
            Map<String, Object> act = (Map<String, Object>) entry.getValue();
            @SuppressWarnings("unchecked")
            List<String> recalled = (List<String>) act.get("recalled");

            int correct = 0;
            List<String> matched = new ArrayList<>();
            if (recalled != null) {
                for (String item : recalled) {
                    if (correctSet.contains(item.toLowerCase().trim())) {
                        correct++;
                        matched.add(item);
                    }
                }
            }

            room.getPlayer(player).addScore(correct);
            playerResults.put(player, Map.of(
                    "recalled", recalled != null ? recalled : List.of(),
                    "matched", matched,
                    "correct", correct,
                    "points", correct
            ));
        }

        return Map.of(
                "correctItems", correctItems,
                "playerResults", playerResults
        );
    }
}
