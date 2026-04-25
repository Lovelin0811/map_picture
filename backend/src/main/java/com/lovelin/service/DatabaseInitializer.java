package com.lovelin.service;

import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DatabaseInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(String... args) {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS users (
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              openid VARCHAR(128) NOT NULL UNIQUE,
              nickname VARCHAR(255) NOT NULL DEFAULT '',
              avatar_url VARCHAR(1024) NOT NULL DEFAULT '',
              created_at BIGINT NOT NULL,
              updated_at BIGINT NOT NULL
            )
            """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
              token VARCHAR(128) PRIMARY KEY,
              user_id BIGINT NOT NULL,
              expires_at BIGINT NOT NULL,
              created_at BIGINT NOT NULL,
              INDEX idx_sessions_user(user_id),
              INDEX idx_sessions_expires(expires_at),
              CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS albums (
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              title VARCHAR(255) NOT NULL DEFAULT '共享相册',
              created_at BIGINT NOT NULL,
              updated_at BIGINT NOT NULL
            )
            """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS album_members (
              album_id BIGINT NOT NULL,
              user_id BIGINT NOT NULL,
              role VARCHAR(32) NOT NULL DEFAULT 'member',
              created_at BIGINT NOT NULL,
              UNIQUE KEY uk_album_user (album_id, user_id),
              UNIQUE KEY uk_member_user (user_id),
              INDEX idx_album_members_album(album_id),
              CONSTRAINT fk_album_members_album FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
              CONSTRAINT fk_album_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS album_invites (
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              token VARCHAR(32) NOT NULL UNIQUE,
              album_id BIGINT NOT NULL,
              inviter_user_id BIGINT NOT NULL,
              status VARCHAR(32) NOT NULL DEFAULT 'pending',
              expires_at BIGINT NOT NULL,
              accepted_by_user_id BIGINT NULL,
              created_at BIGINT NOT NULL,
              accepted_at BIGINT NULL,
              INDEX idx_album_invites_album(album_id),
              INDEX idx_album_invites_status_expires(status, expires_at),
              CONSTRAINT fk_album_invites_album FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
              CONSTRAINT fk_album_invites_inviter FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
              CONSTRAINT fk_album_invites_acceptor FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
            )
            """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS folders (
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              album_id BIGINT NOT NULL,
              province VARCHAR(64) NOT NULL,
              name VARCHAR(64) NOT NULL,
              created_at BIGINT NOT NULL,
              UNIQUE KEY uk_folders_album_province_name(album_id, province, name),
              INDEX idx_folders_album_province(album_id, province),
              CONSTRAINT fk_folders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              CONSTRAINT fk_folders_album FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
            )
            """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS photos (
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              album_id BIGINT NOT NULL,
              province VARCHAR(64) NOT NULL,
              file_url VARCHAR(1024) NOT NULL,
              file_path VARCHAR(2048) NOT NULL,
              created_at BIGINT NOT NULL,
              folder_id BIGINT NULL,
              INDEX idx_photos_album_province(album_id, province),
              INDEX idx_photos_folder(folder_id),
              CONSTRAINT fk_photos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              CONSTRAINT fk_photos_album FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
              CONSTRAINT fk_photos_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
            )
            """);
    }
}
