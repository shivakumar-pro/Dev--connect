package com.devconnect.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class UserResponse {
    private Long id;
    private String username;
    private String email;
    private String profileAvatar;
    private String status;
    private LocalDateTime lastSeen;
}
