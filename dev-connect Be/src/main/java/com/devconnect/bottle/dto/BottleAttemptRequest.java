package com.devconnect.bottle.dto;

import lombok.Data;

import java.util.List;

@Data
public class BottleAttemptRequest {
    private String username;
    /** The player's current arrangement — a permutation of the 5 bottle colors. */
    private List<String> arrangement;
}
