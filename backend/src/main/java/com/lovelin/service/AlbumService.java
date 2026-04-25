package com.lovelin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lovelin.config.AppProperties;
import com.lovelin.exception.ApiException;
import com.lovelin.security.AuthSession;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class AlbumService {

    private static final Set<String> ALLOWED_EXT = Set.of(".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic");
    private static final Set<String> ALLOWED_MIME = Set.of(
            "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/heic"
    );

    private final JdbcTemplate jdbcTemplate;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Path uploadDir;
    private final SecureRandom secureRandom = new SecureRandom();

    public AlbumService(JdbcTemplate jdbcTemplate, AppProperties appProperties, ObjectMapper objectMapper) throws IOException {
        this.jdbcTemplate = jdbcTemplate;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newHttpClient();
        this.uploadDir = Paths.get(appProperties.getUpload().getDir()).toAbsolutePath().normalize();
        Files.createDirectories(uploadDir);
    }

    public long now() {
        return Instant.now().toEpochMilli();
    }

    public String normalizeAvatarUrl(String url) {
        if (!StringUtils.hasText(url)) {
            return "";
        }
        if (url.endsWith("/0")) {
            return url.substring(0, url.length() - 2) + "/132";
        }
        return url;
    }

    public AuthSession getSessionByToken(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        List<AuthSession> rows = jdbcTemplate.query("""
                        SELECT s.token, s.user_id, s.expires_at, u.nickname, u.avatar_url, u.openid,
                               am.album_id, am.role
                        FROM sessions s
                        JOIN users u ON u.id = s.user_id
                        LEFT JOIN album_members am ON am.user_id = s.user_id
                        WHERE s.token = ?
                        """,
                (rs, rowNum) -> {
                    AuthSession session = new AuthSession();
                    session.setToken(rs.getString("token"));
                    session.setUserId(rs.getLong("user_id"));
                    session.setExpiresAt(rs.getLong("expires_at"));
                    session.setNickname(rs.getString("nickname"));
                    session.setAvatarUrl(rs.getString("avatar_url"));
                    session.setOpenId(rs.getString("openid"));
                    long albumId = rs.getLong("album_id");
                    session.setAlbumId(rs.wasNull() ? null : albumId);
                    session.setAlbumRole(rs.getString("role"));
                    return session;
                }, token);
        if (rows.isEmpty()) {
            return null;
        }
        AuthSession session = rows.get(0);
        if (session.getExpiresAt() <= now()) {
            jdbcTemplate.update("DELETE FROM sessions WHERE token = ?", token);
            return null;
        }
        return session;
    }

    public long ensureUserAlbumMembership(long userId, String nickname) {
        Long existed = queryLong("SELECT album_id FROM album_members WHERE user_id = ?", userId);
        if (existed != null) {
            return existed;
        }
        long ts = now();
        String title = StringUtils.hasText(nickname) ? nickname + "的相册" : "共享相册";
        long albumId = insertAndReturnId("INSERT INTO albums(title, created_at, updated_at) VALUES (?, ?, ?)", title, ts, ts);
        jdbcTemplate.update("INSERT INTO album_members(album_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
                albumId, userId, ts);
        jdbcTemplate.update("UPDATE photos SET album_id = ? WHERE user_id = ? AND (album_id IS NULL OR album_id = 0)", albumId, userId);
        jdbcTemplate.update("UPDATE folders SET album_id = ? WHERE user_id = ? AND (album_id IS NULL OR album_id = 0)", albumId, userId);
        return albumId;
    }

    public Map<String, Object> getPairStatusByAlbum(long albumId, long selfUserId) {
        List<Map<String, Object>> members = jdbcTemplate.query("""
                        SELECT u.id, u.nickname, u.avatar_url
                        FROM album_members am
                        JOIN users u ON u.id = am.user_id
                        WHERE am.album_id = ?
                        ORDER BY am.created_at ASC
                        """,
                (rs, rowNum) -> Map.of(
                        "id", rs.getLong("id"),
                        "nickName", rs.getString("nickname"),
                        "avatarUrl", rs.getString("avatar_url")
                ),
                albumId
        );
        Map<String, Object> partner = null;
        for (Map<String, Object> member : members) {
            long id = (Long) member.get("id");
            if (id != selfUserId) {
                partner = Map.of(
                        "userId", id,
                        "nickName", member.get("nickName") == null ? "" : member.get("nickName"),
                        "avatarUrl", normalizeAvatarUrl((String) member.get("avatarUrl"))
                );
                break;
            }
        }
        Map<String, Object> out = new HashMap<>();
        out.put("paired", partner != null);
        out.put("partner", partner);
        return out;
    }

    public Map<String, Object> wechatLogin(String code, String nickName, String avatarUrl) {
        if (!StringUtils.hasText(code)) {
            throw new ApiException(400, "缺少 code");
        }
        String openId = resolveOpenIdByCode(code);
        long userId = upsertUser(openId, nickName, avatarUrl);
        Map<String, Object> user = jdbcTemplate.queryForObject(
                "SELECT openid, nickname, avatar_url FROM users WHERE id = ?",
                (rs, rowNum) -> Map.of(
                        "openId", rs.getString("openid"),
                        "nickName", rs.getString("nickname"),
                        "avatarUrl", normalizeAvatarUrl(rs.getString("avatar_url"))
                ),
                userId
        );
        long albumId = ensureUserAlbumMembership(userId, nickName);
        String token = randomHex(48);
        long expiresAt = now() + 7L * 24 * 60 * 60 * 1000;
        jdbcTemplate.update("INSERT INTO sessions(token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                token, userId, expiresAt, now());
        return Map.of(
                "token", token,
                "expiresAt", expiresAt,
                "user", user,
                "albumId", albumId
        );
    }

    public void logout(String token) {
        jdbcTemplate.update("DELETE FROM sessions WHERE token = ?", token);
    }

    public Map<String, Object> getSelf(long userId, String fallbackNick, String fallbackAvatar) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT nickname, avatar_url FROM users WHERE id = ?",
                    (rs, rowNum) -> {
                        Map<String, Object> out = new HashMap<>();
                        out.put("userId", userId);
                        out.put("nickName", StringUtils.hasText(rs.getString("nickname")) ? rs.getString("nickname") : nullSafe(fallbackNick));
                        out.put("avatarUrl", normalizeAvatarUrl(StringUtils.hasText(rs.getString("avatar_url")) ? rs.getString("avatar_url") : nullSafe(fallbackAvatar)));
                        return out;
                    },
                    userId
            );
        } catch (EmptyResultDataAccessException e) {
            return Map.of(
                    "userId", userId,
                    "nickName", fallbackNick == null ? "" : fallbackNick,
                    "avatarUrl", normalizeAvatarUrl(fallbackAvatar)
            );
        }
    }

    public Map<String, Object> createInvite(long albumId, long userId) {
        long memberCount = queryLongOrZero("SELECT COUNT(*) FROM album_members WHERE album_id = ?", albumId);
        if (memberCount >= 2) {
            throw new ApiException(409, "当前相册已配对，无法再邀请");
        }
        jdbcTemplate.update("UPDATE album_invites SET status = 'revoked' WHERE album_id = ? AND status = 'pending'", albumId);
        String code = randomCode(8);
        long expiresAt = now() + 7L * 24 * 60 * 60 * 1000;
        jdbcTemplate.update("""
                INSERT INTO album_invites(token, album_id, inviter_user_id, status, expires_at, created_at)
                VALUES(?, ?, ?, 'pending', ?, ?)
                """, code, albumId, userId, expiresAt, now());
        return Map.of("code", code, "expiresAt", expiresAt);
    }

    @Transactional
    public Map<String, Object> acceptInvite(long userId, String nickname, String code) {
        if (!StringUtils.hasText(code)) {
            throw new ApiException(400, "缺少邀请码");
        }
        Map<String, Object> invite = jdbcTemplate.query("""
                        SELECT id, token, album_id, inviter_user_id, status, expires_at
                        FROM album_invites
                        WHERE token = ?
                        """,
                rs -> {
                    if (!rs.next()) {
                        return null;
                    }
                    Map<String, Object> out = new HashMap<>();
                    out.put("id", rs.getLong("id"));
                    out.put("albumId", rs.getLong("album_id"));
                    out.put("inviterUserId", rs.getLong("inviter_user_id"));
                    out.put("status", rs.getString("status"));
                    out.put("expiresAt", rs.getLong("expires_at"));
                    return out;
                },
                code.trim().toUpperCase()
        );
        if (invite == null || !"pending".equals(invite.get("status"))) {
            throw new ApiException(404, "邀请码不存在或已失效");
        }
        long expiresAt = (Long) invite.get("expiresAt");
        if (expiresAt <= now()) {
            jdbcTemplate.update("UPDATE album_invites SET status = 'expired' WHERE id = ?", invite.get("id"));
            throw new ApiException(410, "邀请码已过期");
        }
        if ((Long) invite.get("inviterUserId") == userId) {
            throw new ApiException(400, "不能接受自己发出的邀请");
        }
        long targetAlbumId = (Long) invite.get("albumId");
        long targetCount = queryLongOrZero("SELECT COUNT(*) FROM album_members WHERE album_id = ?", targetAlbumId);
        if (targetCount >= 2) {
            throw new ApiException(409, "该相册已配对完成");
        }

        long currentAlbumId = ensureUserAlbumMembership(userId, nickname);
        if (currentAlbumId != targetAlbumId) {
            jdbcTemplate.update("DELETE FROM album_members WHERE user_id = ?", userId);
            jdbcTemplate.update("INSERT INTO album_members(album_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)",
                    targetAlbumId, userId, now());
            jdbcTemplate.update("UPDATE photos SET album_id = ? WHERE user_id = ? AND album_id = ?", targetAlbumId, userId, currentAlbumId);
            jdbcTemplate.update("UPDATE folders SET album_id = ? WHERE user_id = ? AND album_id = ?", targetAlbumId, userId, currentAlbumId);
        }

        jdbcTemplate.update("UPDATE album_invites SET status='accepted', accepted_by_user_id=?, accepted_at=? WHERE id=?",
                userId, now(), invite.get("id"));

        Map<String, Object> status = getPairStatusByAlbum(targetAlbumId, userId);
        Map<String, Object> out = new HashMap<>();
        out.put("ok", true);
        out.put("albumId", targetAlbumId);
        out.put("paired", status.get("paired"));
        out.put("partner", status.get("partner"));
        return out;
    }

    @Transactional
    public Map<String, Object> unbind(long userId, String nickname) {
        long currentAlbumId = ensureUserAlbumMembership(userId, nickname);
        Map<String, Object> pairStatus = getPairStatusByAlbum(currentAlbumId, userId);
        if (!(Boolean) pairStatus.get("paired")) {
            throw new ApiException(400, "当前未配对，无需解绑");
        }
        long ts = now();
        long newAlbumId = insertAndReturnId("INSERT INTO albums(title, created_at, updated_at) VALUES (?, ?, ?)", "我的相册", ts, ts);
        jdbcTemplate.update("DELETE FROM album_members WHERE user_id = ?", userId);
        jdbcTemplate.update("INSERT INTO album_members(album_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", newAlbumId, userId, ts);
        jdbcTemplate.update("UPDATE photos SET album_id = ? WHERE user_id = ? AND album_id = ?", newAlbumId, userId, currentAlbumId);
        jdbcTemplate.update("UPDATE folders SET album_id = ? WHERE user_id = ? AND album_id = ?", newAlbumId, userId, currentAlbumId);
        jdbcTemplate.update("UPDATE album_invites SET status='revoked' WHERE album_id = ? AND status='pending'", currentAlbumId);
        return Map.of("ok", true, "albumId", newAlbumId);
    }

    public List<Map<String, Object>> photoStats(long albumId) {
        return jdbcTemplate.query("""
                        SELECT province, COUNT(*) as count
                        FROM photos
                        WHERE album_id = ?
                        GROUP BY province
                        """,
                (rs, rowNum) -> Map.of("province", rs.getString("province"), "count", rs.getLong("count")),
                albumId);
    }

    public Map<String, Object> listPhotos(long albumId, String province, int page, int pageSize) {
        if (!StringUtils.hasText(province)) {
            throw new ApiException(400, "缺少 province");
        }
        int offset = (page - 1) * pageSize;
        long total = queryLongOrZero("SELECT COUNT(*) FROM photos WHERE album_id = ? AND province = ?", albumId, province);
        List<Map<String, Object>> rows = jdbcTemplate.query("""
                        SELECT p.id, p.province, p.created_at,
                               p.folder_id, f.name AS folder_name
                        FROM photos p
                        LEFT JOIN folders f ON f.id = p.folder_id AND f.album_id = p.album_id
                        WHERE p.album_id = ? AND p.province = ?
                        ORDER BY p.created_at DESC
                        LIMIT ? OFFSET ?
                        """,
                (rs, rowNum) -> {
                    Map<String, Object> m = new HashMap<>();
                    long id = rs.getLong("id");
                    m.put("id", id);
                    m.put("province", rs.getString("province"));
                    m.put("fileUrl", "/api/photos/file/" + id);
                    m.put("createdAt", rs.getLong("created_at"));
                    long folderId = rs.getLong("folder_id");
                    m.put("folderId", rs.wasNull() ? null : folderId);
                    m.put("folderName", rs.getString("folder_name"));
                    return m;
                },
                albumId, province, pageSize, offset);
        return Map.of(
                "items", rows,
                "page", page,
                "pageSize", pageSize,
                "total", total,
                "hasMore", offset + rows.size() < total
        );
    }

    public List<Map<String, Object>> listFolders(long albumId, String province) {
        if (!StringUtils.hasText(province)) {
            throw new ApiException(400, "缺少 province");
        }
        return jdbcTemplate.query("""
                        SELECT f.id, f.name, f.province, f.created_at, COUNT(p.id) as count
                        FROM folders f
                        LEFT JOIN photos p ON p.folder_id = f.id
                        WHERE f.album_id = ? AND f.province = ?
                        GROUP BY f.id
                        ORDER BY f.created_at ASC
                        """,
                (rs, rowNum) -> Map.of(
                        "id", rs.getLong("id"),
                        "name", rs.getString("name"),
                        "province", rs.getString("province"),
                        "createdAt", rs.getLong("created_at"),
                        "count", rs.getLong("count")
                ),
                albumId, province);
    }

    public Map<String, Object> createFolder(long userId, long albumId, String province, String name) {
        if (!StringUtils.hasText(province)) {
            throw new ApiException(400, "缺少 province");
        }
        if (!StringUtils.hasText(name)) {
            throw new ApiException(400, "缺少文件夹名称");
        }
        if (name.length() > 24) {
            throw new ApiException(400, "文件夹名称不能超过24个字符");
        }
        Long existed = queryLong("SELECT id FROM folders WHERE album_id = ? AND province = ? AND name = ?", albumId, province, name);
        if (existed != null) {
            throw new ApiException(409, "文件夹已存在");
        }
        long createdAt = now();
        long id = insertAndReturnId("INSERT INTO folders(user_id, album_id, province, name, created_at) VALUES (?, ?, ?, ?, ?)",
                userId, albumId, province, name, createdAt);
        return Map.of("id", id, "province", province, "name", name, "createdAt", createdAt, "count", 0);
    }

    @Transactional
    public Map<String, Object> deleteFolder(long albumId, long folderId, boolean keepPhotos) {
        Map<String, Object> target = jdbcTemplate.query("""
                        SELECT id, province, name FROM folders WHERE id = ? AND album_id = ?
                        """,
                rs -> {
                    if (!rs.next()) {
                        return null;
                    }
                    return Map.of(
                            "id", rs.getLong("id"),
                            "province", rs.getString("province"),
                            "name", rs.getString("name")
                    );
                },
                folderId, albumId);
        if (target == null) {
            throw new ApiException(404, "文件夹不存在");
        }
        if (keepPhotos) {
            jdbcTemplate.update("UPDATE photos SET folder_id = NULL WHERE album_id = ? AND folder_id = ?", albumId, folderId);
        } else {
            List<String> paths = jdbcTemplate.query("SELECT file_path FROM photos WHERE album_id = ? AND folder_id = ?",
                    (rs, rowNum) -> rs.getString("file_path"), albumId, folderId);
            jdbcTemplate.update("DELETE FROM photos WHERE album_id = ? AND folder_id = ?", albumId, folderId);
            for (String filePath : paths) {
                deleteUploadFileSafe(filePath);
            }
        }
        jdbcTemplate.update("DELETE FROM folders WHERE id = ? AND album_id = ?", folderId, albumId);
        return Map.of(
                "ok", true,
                "id", folderId,
                "province", target.get("province"),
                "name", target.get("name"),
                "keepPhotos", keepPhotos
        );
    }

    public Path resolvePhotoFilePath(long photoId, long albumId) {
        String filePath = jdbcTemplate.query("""
                        SELECT file_path FROM photos WHERE id = ? AND album_id = ?
                        """,
                rs -> rs.next() ? rs.getString("file_path") : null,
                photoId, albumId);
        if (!StringUtils.hasText(filePath)) {
            throw new ApiException(404, "照片不存在");
        }
        Path resolved = Paths.get(filePath).toAbsolutePath().normalize();
        if (!resolved.startsWith(uploadDir) || !Files.exists(resolved)) {
            throw new ApiException(404, "照片文件不存在");
        }
        return resolved;
    }

    public String getMimeTypeByExt(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (name.endsWith(".png")) {
            return "image/png";
        }
        if (name.endsWith(".gif")) {
            return "image/gif";
        }
        if (name.endsWith(".webp")) {
            return "image/webp";
        }
        if (name.endsWith(".bmp")) {
            return "image/bmp";
        }
        if (name.endsWith(".heic")) {
            return "image/heic";
        }
        return "application/octet-stream";
    }

    public Map<String, Object> uploadPhotoFromMultipart(long userId, long albumId, String province, String folderIdRaw, MultipartFile file) throws IOException {
        if (!StringUtils.hasText(province)) {
            throw new ApiException(400, "缺少 province");
        }
        if (file == null || file.isEmpty()) {
            throw new ApiException(400, "缺少文件");
        }
        String ext = extensionOf(file.getOriginalFilename());
        String mime = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!ALLOWED_EXT.contains(ext) || !ALLOWED_MIME.contains(mime)) {
            throw new ApiException(400, "仅支持 jpg/png/gif/webp/bmp/heic 图片");
        }
        long maxBytes = maxUploadBytes();
        if (file.getSize() > maxBytes) {
            throw new ApiException(413, "图片不能超过 " + appProperties.getUpload().getMaxUploadMb() + "MB");
        }
        Long folderId = parseOptionalFolderId(folderIdRaw);
        ensureFolderValid(albumId, province, folderId);
        String filename = randomFileName(ext);
        Path target = uploadDir.resolve(filename).normalize();
        file.transferTo(target);
        return savePhoto(userId, albumId, province, folderId, target.toString());
    }

    public Map<String, Object> uploadPhotoFromBase64(long userId, long albumId, String province, String folderIdRaw, String fileBase64, String fileName) throws IOException {
        if (!StringUtils.hasText(province)) {
            throw new ApiException(400, "缺少 province");
        }
        if (!StringUtils.hasText(fileBase64)) {
            throw new ApiException(400, "缺少文件");
        }
        String ext = extensionOf(fileName);
        if (!ALLOWED_EXT.contains(ext)) {
            throw new ApiException(400, "不支持的图片格式");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(fileBase64);
        } catch (IllegalArgumentException e) {
            throw new ApiException(400, "文件内容不是有效Base64");
        }
        if (bytes.length > maxUploadBytes()) {
            throw new ApiException(413, "图片不能超过 " + appProperties.getUpload().getMaxUploadMb() + "MB");
        }
        Long folderId = parseOptionalFolderId(folderIdRaw);
        ensureFolderValid(albumId, province, folderId);
        String filename = randomFileName(ext);
        Path target = uploadDir.resolve(filename).normalize();
        Files.write(target, bytes);
        return savePhoto(userId, albumId, province, folderId, target.toString());
    }

    public Map<String, Object> updatePhotoFolder(long photoId, long albumId, String folderIdRaw) {
        Long folderId = parseOptionalFolderId(folderIdRaw);
        Map<String, Object> photo = jdbcTemplate.query("""
                        SELECT id, province FROM photos WHERE id = ? AND album_id = ?
                        """,
                rs -> rs.next() ? Map.of("id", rs.getLong("id"), "province", rs.getString("province")) : null,
                photoId, albumId);
        if (photo == null) {
            throw new ApiException(404, "照片不存在");
        }
        ensureFolderValid(albumId, (String) photo.get("province"), folderId);
        jdbcTemplate.update("UPDATE photos SET folder_id = ? WHERE id = ?", folderId, photoId);
        Map<String, Object> out = new HashMap<>();
        out.put("ok", true);
        out.put("id", photoId);
        out.put("folderId", folderId);
        return out;
    }

    public Map<String, Object> deletePhoto(long photoId, long albumId) {
        String filePath = jdbcTemplate.query("""
                        SELECT file_path FROM photos WHERE id = ? AND album_id = ?
                        """,
                rs -> rs.next() ? rs.getString("file_path") : null,
                photoId, albumId);
        if (!StringUtils.hasText(filePath)) {
            throw new ApiException(404, "照片不存在");
        }
        jdbcTemplate.update("DELETE FROM photos WHERE id = ? AND album_id = ?", photoId, albumId);
        deleteUploadFileSafe(filePath);
        return Map.of("ok", true);
    }

    private Map<String, Object> savePhoto(long userId, long albumId, String province, Long folderId, String filePath) {
        long createdAt = now();
        long id = insertAndReturnId("""
                INSERT INTO photos(user_id, album_id, province, file_url, file_path, created_at, folder_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, userId, albumId, province, "", filePath, createdAt, folderId);
        String fileUrl = "/api/photos/file/" + id;
        jdbcTemplate.update("UPDATE photos SET file_url = ? WHERE id = ?", fileUrl, id);
        Map<String, Object> out = new HashMap<>();
        out.put("id", id);
        out.put("province", province);
        out.put("fileUrl", fileUrl);
        out.put("createdAt", createdAt);
        out.put("folderId", folderId);
        return out;
    }

    private void ensureFolderValid(long albumId, String province, Long folderId) {
        if (folderId == null) {
            return;
        }
        Long existed = queryLong("SELECT id FROM folders WHERE id = ? AND album_id = ? AND province = ?", folderId, albumId, province);
        if (existed == null) {
            throw new ApiException(400, "文件夹不存在");
        }
    }

    private void deleteUploadFileSafe(String filePath) {
        if (!StringUtils.hasText(filePath)) {
            return;
        }
        Path target = Paths.get(filePath).toAbsolutePath().normalize();
        if (!target.startsWith(uploadDir)) {
            return;
        }
        try {
            Files.deleteIfExists(target);
        } catch (IOException ignored) {
            // keep DB deletion as source of truth
        }
    }

    private String resolveOpenIdByCode(String code) {
        String appId = appProperties.getWechat().getAppid();
        String secret = appProperties.getWechat().getSecret();
        if (!StringUtils.hasText(appId) || !StringUtils.hasText(secret)) {
            throw new ApiException(500, "缺少 WECHAT_APPID / WECHAT_SECRET");
        }
        String url = "https://api.weixin.qq.com/sns/jscode2session?appid=" + encode(appId)
                + "&secret=" + encode(secret)
                + "&js_code=" + encode(code)
                + "&grant_type=authorization_code";
        try {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode node = objectMapper.readTree(response.body());
            if (node.hasNonNull("openid")) {
                return node.get("openid").asText();
            }
            String message = node.has("errmsg") ? node.get("errmsg").asText() : "jscode2session 失败";
            throw new ApiException(500, message);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(500, "登录失败: " + e.getMessage());
        }
    }

    private long upsertUser(String openId, String nickName, String avatarUrl) {
        long ts = now();
        jdbcTemplate.update("""
                INSERT INTO users(openid, nickname, avatar_url, created_at, updated_at)
                VALUES(?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  nickname = CASE WHEN VALUES(nickname) <> '' THEN VALUES(nickname) ELSE users.nickname END,
                  avatar_url = CASE WHEN VALUES(avatar_url) <> '' THEN VALUES(avatar_url) ELSE users.avatar_url END,
                  updated_at = VALUES(updated_at)
                """, openId, nullSafe(nickName), nullSafe(avatarUrl), ts, ts);
        Long userId = queryLong("SELECT id FROM users WHERE openid = ?", openId);
        if (userId == null) {
            throw new ApiException(500, "用户创建失败");
        }
        return userId;
    }

    private String nullSafe(String input) {
        return input == null ? "" : input;
    }

    private long insertAndReturnId(String sql, Object... args) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < args.length; i++) {
                ps.setObject(i + 1, args[i]);
            }
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new ApiException(500, "创建记录失败");
        }
        return key.longValue();
    }

    private Long queryLong(String sql, Object... args) {
        try {
            return jdbcTemplate.queryForObject(sql, Long.class, args);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    private long queryLongOrZero(String sql, Object... args) {
        Long value = queryLong(sql, args);
        return value == null ? 0L : value;
    }

    private String randomHex(int length) {
        byte[] bytes = new byte[Math.max(1, length / 2)];
        secureRandom.nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.substring(0, Math.min(length, sb.length()));
    }

    private String randomCode(int length) {
        return randomHex(length).toUpperCase();
    }

    private long maxUploadBytes() {
        return Math.max(1L, appProperties.getUpload().getMaxUploadMb()) * 1024L * 1024L;
    }

    private String extensionOf(String fileName) {
        String name = StringUtils.hasText(fileName) ? fileName.trim().toLowerCase() : ".jpg";
        int index = name.lastIndexOf('.');
        if (index < 0 || index == name.length() - 1) {
            return ".jpg";
        }
        String ext = name.substring(index);
        if (ext.length() > 6) {
            return ".jpg";
        }
        return ext;
    }

    private String randomFileName(String ext) {
        return now() + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12) + ext;
    }

    private Long parseOptionalFolderId(String rawValue) {
        if (!StringUtils.hasText(rawValue)) {
            return null;
        }
        try {
            long value = Long.parseLong(rawValue.trim());
            if (value <= 0) {
                throw new ApiException(400, "folderId 无效");
            }
            return value;
        } catch (NumberFormatException e) {
            throw new ApiException(400, "folderId 无效");
        }
    }

    private String encode(String input) {
        return URLEncoder.encode(input, StandardCharsets.UTF_8);
    }

    public List<String> parseCorsAllowList() {
        String raw = appProperties.getCorsOrigin();
        if (!StringUtils.hasText(raw)) {
            return List.of();
        }
        String[] split = raw.split(",");
        List<String> out = new ArrayList<>();
        for (String item : split) {
            if (StringUtils.hasText(item)) {
                out.add(item.trim());
            }
        }
        return out;
    }

    public int normalizePageSize(Integer pageSize) {
        int defaultSize = Math.max(1, appProperties.getPhoto().getPageSize());
        int max = Math.max(defaultSize, appProperties.getPhoto().getMaxPageSize());
        int candidate = pageSize == null ? defaultSize : pageSize;
        return Math.max(1, Math.min(max, candidate));
    }
}
