package com.devconnect.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "user_deleted_messages", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"user_id", "message_id"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserDeletedMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    public UserDeletedMessage(Long userId, Long messageId) {
        this.userId = userId;
        this.messageId = messageId;
    }
}
