package com.devconnect.dice.dto;

import lombok.Data;

import java.util.List;

@Data
public class DiceActionRequest {
    private String username;
    private String action;
    private List<Integer> indices;
    private Integer quantity;
    private Integer faceValue;
}
