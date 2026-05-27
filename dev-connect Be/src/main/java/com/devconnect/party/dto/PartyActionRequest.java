package com.devconnect.party.dto;

import lombok.Data;

import java.util.Map;

@Data
public class PartyActionRequest {
    private String roomId;
    private Map<String, Object> data;
}
