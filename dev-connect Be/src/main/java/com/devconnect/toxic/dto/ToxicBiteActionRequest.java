package com.devconnect.toxic.dto;

import lombok.Data;

@Data
public class ToxicBiteActionRequest {
    private String username;
    private String action;        // "poison" | "eat"
    private Integer position;     // 1..9
}
