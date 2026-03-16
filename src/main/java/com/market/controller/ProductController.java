package com.market.controller;

import com.market.service.DbService;
import com.market.service.FileService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

import static com.market.controller.UserController.err;
import static com.market.controller.UserController.ok;

@RestController
@RequestMapping("/api")
public class ProductController {

    @Autowired private DbService db;
    @Autowired private FileService fileService;

    // 商品列表
    @GetMapping("/products")
    public ResponseEntity<?> list(
            @RequestParam(defaultValue = "all") String category,
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "12") int limit,
            @RequestParam(defaultValue = "active") String status,
            @RequestParam(required = false) Double minPrice,
            @RequestParam(required = false) Double maxPrice) {
        try {
            List<String> where = new ArrayList<>(List.of("p.status = ?"));
            List<Object> params = new ArrayList<>(List.of(status));
            if (!"all".equals(category)) { where.add("p.category = ?"); params.add(category); }
            if (!keyword.isBlank()) { where.add("(p.title LIKE ? OR p.description LIKE ?)"); params.add("%" + keyword + "%"); params.add("%" + keyword + "%"); }
            if (minPrice != null) { where.add("p.price >= ?"); params.add(minPrice); }
            if (maxPrice != null) { where.add("p.price <= ?"); params.add(maxPrice); }

            Map<String, String> orderMap = Map.of(
                    "newest", "p.created_at DESC", "oldest", "p.created_at ASC",
                    "price_asc", "p.price ASC", "price_desc", "p.price DESC", "popular", "p.views DESC");
            String orderBy = orderMap.getOrDefault(sort, "p.created_at DESC");
            String whereClause = String.join(" AND ", where);

            int offset = (page - 1) * limit;
            List<Object> pageParams = new ArrayList<>(params);
            pageParams.add(limit); pageParams.add(offset);

            List<Map<String, Object>> products = db.query(
                    "SELECT p.*, u.username, u.avatar FROM products p JOIN users u ON p.user_id = u.id WHERE " + whereClause + " ORDER BY " + orderBy + " LIMIT ? OFFSET ?",
                    pageParams.toArray());
            products.forEach(p -> p.put("images", db.parseImages(p.get("images"))));

            Map<String, Object> countRow = db.queryOne("SELECT COUNT(*) as total FROM products p WHERE " + whereClause, params.toArray());
            long total = countRow != null ? ((Number) countRow.get("total")).longValue() : 0;

            return ResponseEntity.ok(Map.of("products", products, "total", total, "page", page, "limit", limit));
        } catch (Exception e) { return err(500, "查询失败: " + e.getMessage()); }
    }

    // 热门商品
    @GetMapping("/products/hot")
    public ResponseEntity<?> hot() {
        try {
            List<Map<String, Object>> rows = db.query(
                    "SELECT p.*, u.username, u.avatar FROM products p JOIN users u ON p.user_id = u.id WHERE p.status = 'active' ORDER BY p.views DESC LIMIT 8");
            rows.forEach(p -> p.put("images", db.parseImages(p.get("images"))));
            return ResponseEntity.ok(rows);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 单个商品
    @GetMapping("/products/{id}")
    public ResponseEntity<?> get(@PathVariable int id) {
        try {
            db.update("UPDATE products SET views = views + 1 WHERE id = ?", id);
            Map<String, Object> row = db.queryOne(
                    "SELECT p.*, u.username, u.avatar, u.phone FROM products p JOIN users u ON p.user_id = u.id WHERE p.id = ?", id);
            if (row == null) return err(404, "商品不存在");
            row.put("images", db.parseImages(row.get("images")));
            return ResponseEntity.ok(row);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 相似商品
    @GetMapping("/products/{id}/similar")
    public ResponseEntity<?> similar(@PathVariable int id) {
        try {
            Map<String, Object> p = db.queryOne("SELECT category FROM products WHERE id = ?", id);
            if (p == null) return err(404, "商品不存在");
            List<Map<String, Object>> rows = db.query(
                    "SELECT p.*, u.username, u.avatar FROM products p JOIN users u ON p.user_id = u.id WHERE p.category = ? AND p.id != ? AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 6",
                    p.get("category"), id);
            rows.forEach(r -> r.put("images", db.parseImages(r.get("images"))));
            return ResponseEntity.ok(rows);
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 商品统计
    @GetMapping("/products/{id}/stats")
    public ResponseEntity<?> stats(@PathVariable int id) {
        try {
            Map<String, Object> p = db.queryOne("SELECT views FROM products WHERE id = ?", id);
            if (p == null) return err(404, "商品不存在");
            Map<String, Object> fav = db.queryOne("SELECT COUNT(*) as favorites FROM favorites WHERE product_id = ?", id);
            return ResponseEntity.ok(Map.of("views", p.get("views"), "favorites", fav != null ? fav.get("favorites") : 0));
        } catch (Exception e) { return err(500, "查询失败"); }
    }

    // 举报
    @PostMapping("/products/{id}/report")
    public ResponseEntity<?> report(@PathVariable int id, @RequestBody Map<String, String> body, HttpSession session) {
        try {
            Integer uid = (Integer) session.getAttribute("userId");
            db.insert("INSERT INTO reports (product_id, user_id, reason) VALUES (?, ?, ?)",
                    id, uid, body.getOrDefault("reason", ""));
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) { return err(500, "举报失败"); }
    }

    // 发布商品
    @PostMapping("/products")
    public ResponseEntity<?> create(
            @RequestParam String title,
            @RequestParam String price,
            @RequestParam String category,
            @RequestParam String condition,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String location,
            @RequestParam(required = false, defaultValue = "false") String negotiable,
            @RequestParam(required = false) List<MultipartFile> images,
            HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            List<String> imgUrls = new ArrayList<>();
            if (images != null) {
                for (MultipartFile f : images) {
                    if (!f.isEmpty()) imgUrls.add(fileService.save(f));
                }
            }
            long id = db.insert(
                    "INSERT INTO products (user_id, title, description, price, category, condition, images, location, negotiable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    uid, title, description, Double.parseDouble(price), category, condition,
                    db.toJson(imgUrls), location, "true".equals(negotiable) ? 1 : 0);
            return ResponseEntity.ok(Map.of("success", true, "productId", id));
        } catch (Exception e) { return err(500, "发布失败: " + e.getMessage()); }
    }

    // 更新商品
    @PutMapping("/products/{id}")
    public ResponseEntity<?> update(
            @PathVariable int id,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String price,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String condition,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String negotiable,
            @RequestParam(required = false) List<MultipartFile> images,
            HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            Map<String, Object> existing = db.queryOne("SELECT * FROM products WHERE id = ? AND user_id = ?", id, uid);
            if (existing == null) return err(403, "无权操作");

            List<String> imgUrls = db.parseImages(existing.get("images"));
            if (images != null && !images.isEmpty()) {
                imgUrls = new ArrayList<>();
                for (MultipartFile f : images) { if (!f.isEmpty()) imgUrls.add(fileService.save(f)); }
            }
            db.update("UPDATE products SET title=?, description=?, price=?, category=?, condition=?, images=?, location=?, status=?, negotiable=? WHERE id=?",
                    title != null ? title : existing.get("title"),
                    description != null ? description : existing.get("description"),
                    price != null ? Double.parseDouble(price) : existing.get("price"),
                    category != null ? category : existing.get("category"),
                    condition != null ? condition : existing.get("condition"),
                    db.toJson(imgUrls),
                    location != null ? location : existing.get("location"),
                    status != null ? status : existing.get("status"),
                    negotiable != null ? ("true".equals(negotiable) ? 1 : 0) : existing.get("negotiable"),
                    id);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) { return err(500, "更新失败: " + e.getMessage()); }
    }

    // 删除商品
    @DeleteMapping("/products/{id}")
    public ResponseEntity<?> delete(@PathVariable int id, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            int rows = db.update("DELETE FROM products WHERE id = ? AND user_id = ?", id, uid);
            if (rows == 0) return err(403, "无权操作");
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) { return err(500, "删除失败"); }
    }

    // 我的发布
    @GetMapping("/my/products")
    public ResponseEntity<?> myProducts(@RequestParam(defaultValue = "all") String status, HttpSession session) {
        Integer uid = (Integer) session.getAttribute("userId");
        if (uid == null) return err(401, "请先登录");
        try {
            List<Map<String, Object>> rows;
            if ("all".equals(status)) {
                rows = db.query("SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC", uid);
            } else {
                rows = db.query("SELECT * FROM products WHERE user_id = ? AND status = ? ORDER BY created_at DESC", uid, status);
            }
            rows.forEach(r -> r.put("images", db.parseImages(r.get("images"))));
            return ResponseEntity.ok(rows);
        } catch (Exception e) { return err(500, "查询失败"); }
    }
}
