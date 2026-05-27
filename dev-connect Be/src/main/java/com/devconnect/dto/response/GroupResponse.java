package com.devconnect.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Builder
public class GroupResponse {
    private Long id;
    private String name;
    private String description;
    private Long createdById;
    private String createdByName;
    private LocalDateTime createdAt;
    private Integer memberCount;
    private String currentUserRole;
    private MessageResponse lastMessage;
    private List<Map<String, Object>> members;
}
