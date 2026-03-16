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
public class FavoriteController {

    @Autowired private DbService db;

    @PostMapping("/favorites/{productId}")
    public ResponseEntity<?> add(@PathVariable int productId, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            db.insert("INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)", uid, productId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) { return err(500, "操作失败"); }
    }

    @DeleteMapping("/favorites/{productId}")
    public ResponseEntity<?> remove(@PathVariable int productId, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            db.update("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", uid, productId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) { return err(500, "操作失败"); }
    }

    @GetMapping("/my/favorites")
    public ResponseEntity<?> myFavorites(HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            List<Map<String, Object>> rows = db.query(
                    "SELECT p.*, u.username FROM products p JOIN favorites f ON p.id = f.product_id JOIN users u ON p.user_id = u.id WHERE f.user_id = ? ORDER BY f.created_at DESC", uid);
            rows.forEach(r -> r.put("images", db.parseImages(r.get("images"))));
            return ResponseEntity.ok(rows);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    @GetMapping("/favorites/{productId}/check")
    public ResponseEntity<?> check(@PathVariable int productId, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return ResponseEntity.ok(Map.of("favorited", false));
        try {
            Map<String, Object> row = db.queryOne("SELECT id FROM favorites WHERE user_id = ? AND product_id = ?", uid, productId);
            return ResponseEntity.ok(Map.of("favorited", row != null));
        } catch (Exception e) { return ResponseEntity.ok(Map.of("favorited", false)); }
    }
}
