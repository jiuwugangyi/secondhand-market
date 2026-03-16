package com.market.controller;

import com.market.service.DbService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

import static com.market.controller.UserController.err;

@RestController
@RequestMapping("/api")
public class MessageController {

    @Autowired private DbService db;

    // 发送消息
    @PostMapping("/messages")
    public ResponseEntity<?> send(@RequestBody Map<String, Object> body, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        String content = (String) body.get("content");
        if (content == null || content.isBlank()) return err(400, "消息不能为空");
        try {
            long id = db.insert("INSERT INTO messages (product_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)",
                    body.get("productId"), uid, body.get("receiverId"), content.trim());
            return ResponseEntity.ok(Map.of("success", true, "messageId", id));
        } catch (Exception e) { return err(500, "发送失败"); }
    }

    // 获取某商品的消息（旧接口兼容）
    @GetMapping("/messages/{productId}")
    public ResponseEntity<?> getByProduct(@PathVariable int productId, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            List<Map<String, Object>> rows = db.query(
                    "SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.product_id = ? AND (m.sender_id = ? OR m.receiver_id = ?) ORDER BY m.created_at ASC",
                    productId, uid, uid);
            db.update("UPDATE messages SET is_read = 1 WHERE product_id = ? AND receiver_id = ?", productId, uid);
            return ResponseEntity.ok(rows);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 获取某会话消息（新接口）
    @GetMapping("/messages/{productId}/{otherUserId}")
    public ResponseEntity<?> getConversation(@PathVariable int productId, @PathVariable int otherUserId, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            List<Map<String, Object>> rows = db.query(
                    "SELECT m.*, u.username as sender_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.product_id = ? AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)) ORDER BY m.created_at ASC",
                    productId, uid, otherUserId, otherUserId, uid);
            db.update("UPDATE messages SET is_read = 1 WHERE product_id = ? AND sender_id = ? AND receiver_id = ?",
                    productId, otherUserId, uid);
            return ResponseEntity.ok(rows);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 我的消息列表
    @GetMapping("/my/messages")
    public ResponseEntity<?> myMessages(HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            List<Map<String, Object>> rows = db.query(
                    "SELECT m.*, p.title as product_title, p.images as product_images, u.username as other_username, u.avatar as other_avatar FROM messages m JOIN products p ON m.product_id = p.id JOIN users u ON (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END) = u.id WHERE m.sender_id = ? OR m.receiver_id = ? GROUP BY m.product_id, CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END ORDER BY m.created_at DESC",
                    uid, uid, uid, uid);
            return ResponseEntity.ok(rows);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 未读数
    @GetMapping("/my/unread")
    public ResponseEntity<?> unread(HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return ResponseEntity.ok(Map.of("count", 0));
        try {
            Map<String, Object> row = db.queryOne("SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0", uid);
            return ResponseEntity.ok(Map.of("count", row != null ? row.get("count") : 0));
        } catch (Exception e) { return ResponseEntity.ok(Map.of("count", 0)); }
    }

    // 会话列表
    @GetMapping("/my/conversations")
    public ResponseEntity<?> conversations(HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            // SQLite 子查询获取每个会话最新消息
            List<Map<String, Object>> rows = db.query("""
                SELECT m.*, p.title as product_title, p.images as product_images,
                    u.id as other_id, u.username as other_username, u.avatar as other_avatar,
                    (SELECT COUNT(*) FROM messages WHERE product_id = m.product_id
                        AND sender_id = (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END)
                        AND receiver_id = ? AND is_read = 0) as unread_count
                FROM messages m
                JOIN products p ON m.product_id = p.id
                JOIN users u ON u.id = (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END)
                WHERE (m.sender_id = ? OR m.receiver_id = ?)
                  AND m.id IN (
                    SELECT MAX(id) FROM messages
                    WHERE sender_id = ? OR receiver_id = ?
                    GROUP BY product_id, CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
                  )
                ORDER BY m.created_at DESC
                """, uid, uid, uid, uid, uid, uid, uid, uid);
            rows.forEach(r -> r.put("product_images", db.parseImages(r.get("product_images"))));
            return ResponseEntity.ok(rows);
        } catch (Exception e) { return err(500, "查询失败: " + e.getMessage()); }
    }
}
