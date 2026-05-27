package com.devconnect.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_read_status", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"user_id", "room_id"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserReadStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "room_id", nullable = false, length = 50)
    private String roomId;

    @Column(name = "last_read_at", nullable = false)
    private LocalDateTime lastReadAt;

    @Column(name = "cleared_at")
    private LocalDateTime clearedAt;

    public UserReadStatus(Long userId, String roomId, LocalDateTime lastReadAt) {
        this.userId = userId;
        this.roomId = roomId;
        this.lastReadAt = lastReadAt;
    }
}
