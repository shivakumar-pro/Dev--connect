package com.devconnect.bottle.dto;

import lombok.Data;

@Data
public class RemoveBotRequest {
    private String username;
    private String botName;
}
